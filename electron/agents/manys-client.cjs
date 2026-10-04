'use strict';
const {z}=require('zod');
const {randomUUID}=require('node:crypto');
const {prepareCloudManyCreate,acceptCreatedMany}=require('../ai/cloud-agent-runtime.cjs');
const IdSchema=z.string().uuid();
async function request(database,path,method='GET',body) {
  const {fetchWithDomeAuth,getDomeProviderBaseUrl}=require('../auth/dome-oauth.cjs');
  const response=await fetchWithDomeAuth(database,`${getDomeProviderBaseUrl()}/api/v1/manys${path}`,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'manys_unavailable');return result;
}
const definitions=[
  {type:'function',function:{name:'manys_list',description:'List cloud Many collaborators and their shared context permissions.',parameters:{type:'object',properties:{}}}},
  {type:'function',function:{name:'manys_create',description:'Create a cloud Many collaborator. It works with Desktop closed. Ask which cloud runtime to store on the agent: dome_credits, or provider_key for a saved API-key provider that is not local. Never send or invent an API key. Start with no shared resources; the user configures capabilities and context in Many’s.',parameters:{type:'object',properties:{name:{type:'string'},instructions:{type:'string'},runtime_source:{type:'string',enum:['dome_credits','provider_key']},provider:{type:'string',description:'Saved provider id when runtime_source is provider_key. Not an API key.'}},required:['name','runtime_source']}}},
  {type:'function',function:{name:'manys_delegate',description:'Delegate a task to a cloud Many with access only to its granted vault resources. The task continues after Desktop closes. Include relevant interaction context in the prompt; never include credentials.',parameters:{type:'object',properties:{many_id:{type:'string'},prompt:{type:'string'},request_key:{type:'string',description:'Stable UUID for this logical task; reuse only when retrying the same task.'}},required:['many_id','prompt','request_key']}}},
  {type:'function',function:{name:'manys_task',description:'Inspect tasks, approvals and results of a cloud Many.',parameters:{type:'object',properties:{many_id:{type:'string'}},required:['many_id']}}},
  {type:'function',function:{name:'manys_recur',description:'Schedule independent recurring tasks for a cloud Many. Repeated checks without changes remain silent.',parameters:{type:'object',properties:{many_id:{type:'string'},prompt:{type:'string'},interval_seconds:{type:'number',minimum:300}},required:['many_id','prompt','interval_seconds']}}},
];
async function execute(database,name,args) {
  if(name==='manys_list')return request(database,'');
  if(name==='manys_create'){
    const runtime=args.runtime_source==='provider_key'
      ?{source:'provider_key',provider:args.provider}
      :args.runtime_source==='dome_credits'?{source:'dome_credits'}:{};
    const prepared=prepareCloudManyCreate(database.getQueries(),{
      name:z.string().min(1).max(120).parse(args.name),
      instructions:z.string().max(20000).parse(args.instructions??''),
      runtime,
    });
    if(!prepared.ok)throw new Error(prepared.error);
    const created=await request(database,'','POST',prepared.body);
    return acceptCreatedMany(database.getQueries(),prepared.runtime,created);
  }
  const id=IdSchema.parse(args.many_id);
  if(name==='manys_task')return request(database,`/${id}`);
  if(name==='manys_delegate')return request(database,`/${id}/tasks`,'POST',{prompt:z.string().min(1).max(50000).parse(args.prompt),requestKey:IdSchema.parse(args.request_key)});
  if(name==='manys_recur') {
    const detail=await request(database,`/${id}`);
    return request(database,`/${id}/recurrences`,'POST',{conversationId:detail.conversations[0].id,prompt:args.prompt,intervalSeconds:args.interval_seconds,nextAt:new Date(Date.now()+300000).toISOString()});
  }
  throw new Error('tool_unavailable');
}
async function delegatePipeline(database,item,manyId,prompt) {
  IdSchema.parse(manyId);
  const sync=await require('../storage/domain-sync.cjs').pushDomain({database},'pipelines');
  if(!sync.success||sync.rejected)throw new Error('pipeline_sync_required');
  // A persisted per-item request key survives a response lost after server commit.
  const db=database.getDB();const key=`manys:pipeline-request:${item.id}:${item.stage_id}`;
  const previous=db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
  const requestKey=previous||randomUUID();
  db.prepare('INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES(?,?,?)').run(key,requestKey,Date.now());
  const task=await request(database,`/${manyId}/tasks`,'POST',{prompt,requestKey,pipelineItemId:item.id});
  db.prepare('DELETE FROM settings WHERE key=?').run(key);return task;
}
module.exports={request,definitions,execute,delegatePipeline};
