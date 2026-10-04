import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {run} from '../../packages/manys-runtime/dist/index.js';

test('portable harness persists a waiting task, then resumes with a reviewed action and explicit outcome',async()=>{
  let turn=0;const requests=[];
  const server=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));
    const name=turn++===0?'ask_user':'finish_task';const args=name==='ask_user'?{question:'Which project?'}:{text:'Delivered',resources:['resource-id']};
    res.writeHead(200,{'content-type':'text/event-stream'});
    const send=payload=>res.write(`data: ${JSON.stringify({id:'mock',object:'chat.completion.chunk',created:1,model:'test-model',...payload})}\n\n`);
    send({choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'step-'+turn,type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:null}]});
    send({choices:[{index:0,delta:{},finish_reason:'tool_calls'}]});
    send({choices:[],usage:{prompt_tokens:25,completion_tokens:10,total_tokens:35}});res.end('data: [DONE]\n\n');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;const entries=[];const calls=[];const usage=[];let reservations=0;
  const input={taskId:'task-test',prompt:'Produce a report',instructions:'',entries,resumeContext:{},model:'test-model',provider:'openrouter',apiKey:'test',baseUrl:`http://127.0.0.1:${port}/v1`,signal:new AbortController().signal,
    saveEntry:async entry=>{entries.push(structuredClone(entry));},beforeRequest:async()=>{reservations++;},usage:async(i,o)=>{usage.push([i,o]);},call:async(id,name,args)=>{calls.push({id,name,args});return {state:name==='ask_user'?'waiting_input':'completed'};}};
  try {
    await run(input);assert.equal(calls.length,1);assert.equal(calls[0].name,'ask_user');assert.ok(entries.length>0);
    const saved=structuredClone(entries).filter(entry=>!(entry.type==='message'&&entry.message.role==='toolResult'));
    await run({...input,entries:saved,resumeContext:{answers:[{role:'user',content:'Project A'}],actions:[{id:'approval-1',state:'approved'}]}});
    assert.deepEqual(calls.map(c=>c.name),['ask_user','finish_task']);assert.equal(reservations,2);assert.equal(usage.length,2);
    assert.ok(JSON.stringify(requests[1]).includes('interrupted'));assert.equal(requests[1].max_tokens,2048);assert.ok(JSON.stringify(requests[1]).includes('Project A'));assert.ok(JSON.stringify(requests[1]).includes('approval-1'));
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('a plain-text reply with no terminal tool completes the task with that reply',async()=>{
  const server=createServer(async(req,res)=>{
    for await(const _ of req);
    res.writeHead(200,{'content-type':'text/event-stream'});
    const send=payload=>res.write(`data: ${JSON.stringify({id:'mock',object:'chat.completion.chunk',created:1,model:'test-model',...payload})}\n\n`);
    send({choices:[{index:0,delta:{role:'assistant',content:'Hola, ¿en qué te ayudo?'},finish_reason:null}]});
    send({choices:[{index:0,delta:{},finish_reason:'stop'}]});
    send({choices:[],usage:{prompt_tokens:25,completion_tokens:12,total_tokens:37}});res.end('data: [DONE]\n\n');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;const calls=[];
  try {
    await run({taskId:'task-chat',prompt:'hola',instructions:'',entries:[],resumeContext:{},model:'test-model',provider:'openrouter',apiKey:'test',baseUrl:`http://127.0.0.1:${port}/v1`,signal:new AbortController().signal,
      saveEntry:async()=>{},beforeRequest:async()=>{},usage:async()=>{},call:async(id,name,args)=>{calls.push({id,name,args});return {state:'completed'};}});
    assert.deepEqual(calls.map(c=>c.name),['finish_task']);assert.equal(calls[0].args.text,'Hola, ¿en qué te ayudo?');
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('streams the text of a turn as it is written, one message id per assistant message',async()=>{
  let turn=0;
  const server=createServer(async(req,res)=>{
    for await(const _ of req);
    res.writeHead(200,{'content-type':'text/event-stream'});
    const send=payload=>res.write(`data: ${JSON.stringify({id:'mock',object:'chat.completion.chunk',created:1,model:'test-model',...payload})}\n\n`);
    if(turn++===0){
      for(const part of ['Let me ','check.'])send({choices:[{index:0,delta:{role:'assistant',content:part},finish_reason:null}]});
      send({choices:[{index:0,delta:{tool_calls:[{index:0,id:'step-1',type:'function',function:{name:'checkpoint',arguments:JSON.stringify({plan:'p',progress:'q'})}}]},finish_reason:null}]});
      send({choices:[{index:0,delta:{},finish_reason:'tool_calls'}]});
    } else {
      for(const part of ['All ','done.'])send({choices:[{index:0,delta:{role:'assistant',content:part},finish_reason:null}]});
      send({choices:[{index:0,delta:{},finish_reason:'stop'}]});
    }
    send({choices:[],usage:{prompt_tokens:25,completion_tokens:12,total_tokens:37}});res.end('data: [DONE]\n\n');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;const calls=[];const streamed=[];
  try {
    await run({taskId:'task-live',prompt:'go',instructions:'',entries:[],resumeContext:{},model:'test-model',provider:'openrouter',apiKey:'test',baseUrl:`http://127.0.0.1:${port}/v1`,signal:new AbortController().signal,
      saveEntry:async()=>{},beforeRequest:async()=>{},usage:async()=>{},stream:chunk=>{streamed.push(chunk);},call:async(id,name,args)=>{calls.push(name);return {state:'ok'};}});
    const byMessage=new Map();for(const chunk of streamed)byMessage.set(chunk.messageId,(byMessage.get(chunk.messageId)??'')+chunk.delta);
    assert.deepEqual([...byMessage.entries()],[['task-live:1','Let me check.'],['task-live:2','All done.']]);
    assert.ok(streamed.some(chunk=>chunk.end&&chunk.messageId==='task-live:1'));
    assert.deepEqual(calls,['checkpoint','finish_task']);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('a stream callback that throws never fails the run',async()=>{
  const server=createServer(async(req,res)=>{
    for await(const _ of req);
    res.writeHead(200,{'content-type':'text/event-stream'});
    const send=payload=>res.write(`data: ${JSON.stringify({id:'mock',object:'chat.completion.chunk',created:1,model:'test-model',...payload})}\n\n`);
    send({choices:[{index:0,delta:{role:'assistant',content:'Hi.'},finish_reason:null}]});send({choices:[{index:0,delta:{},finish_reason:'stop'}]});
    send({choices:[],usage:{prompt_tokens:5,completion_tokens:2,total_tokens:7}});res.end('data: [DONE]\n\n');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;const calls=[];
  try {
    await run({taskId:'task-throw',prompt:'hi',instructions:'',entries:[],resumeContext:{},model:'test-model',provider:'openrouter',apiKey:'test',baseUrl:`http://127.0.0.1:${port}/v1`,signal:new AbortController().signal,
      saveEntry:async()=>{},beforeRequest:async()=>{},usage:async()=>{},stream:()=>{throw new Error('db down');},call:async(id,name,args)=>{calls.push({name,args});return {};}});
    assert.deepEqual(calls.map(c=>c.name),['finish_task']);assert.equal(calls[0].args.text,'Hi.');
  } finally {await new Promise(resolve=>server.close(resolve));}
});
