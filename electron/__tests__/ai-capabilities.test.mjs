import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import { createModels, createProvider, InMemoryCredentialStore, InMemoryModelsStore } from '@dome/ai';
const require = createRequire(import.meta.url);
const { generate, classify } = require('../ai/capabilities.cjs');
const { validateModelHandoff } = require('../ai/model-handoff.cjs');
const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const image = { type:'image', id:'image-fixture', name:'Fixture Image', provider:'fixture', api:'fixture-image', baseUrl:'https://fixture.test', input:['text'], output:['image'], cost };
const classifier = { type:'classifier', id:'class-fixture', name:'Fixture Classifier', provider:'fixture', api:'fixture-classifier', baseUrl:'https://fixture.test', input:['text'], contextWindow:8192, cost };
function fixture() {
  let authCalls = 0; let seen;
  const models = createModels({ credentials: new InMemoryCredentialStore(), modelsStore:new InMemoryModelsStore() });
  models.setProvider(createProvider({ id:'fixture', models:[image,classifier], auth:{ apiKey: { name:'Fixture', resolve: async () => { authCalls++; return { auth:{apiKey:'secret'},source:'fixture' }; } } },
    images:{ 'fixture-image':{ generateImages:async (_model,_context,options) => { seen = options; return {provider:'fixture',api:'fixture-image',model:image.id,output:[{type:'image',mimeType:'image/png',data:'aW1hZ2U='}],stopReason:'stop',timestamp:1}; } } },
    classifiers:{ 'fixture-classifier':{ classify:async (_model,_context,options) => { seen = options; return {provider:'fixture',api:'fixture-classifier',model:classifier.id,answers:{label:{type:'choice',choice:'yes',probabilities:{yes:0.8,no:0.2},confidence:0.8}},stopReason:'stop',timestamp:1}; } } },
  }));
  return {models, get authCalls(){return authCalls;}, get seen(){return seen;}};
}
test('one shared catalog separates types, availability and resolves auth once per request', async () => {
  const f = fixture();
  assert.equal(f.models.getModels().length,0);
  assert.equal(f.models.getAllModels().length,2);
  assert.equal(f.models.getModelOfType('image','fixture',image.id).id,image.id);
  await f.models.generateImages(image,{input:[]},{transformHeaders: headers => ({...headers,'x-fixture':'transformed'})});
  assert.equal(f.authCalls,1); assert.equal(f.seen.apiKey,'secret'); assert.equal(f.seen.headers['x-fixture'],'transformed');
  assert.equal((await f.models.getAllAvailable()).length,2);
});
test('generated images become library resources without base64 or credentials in tool output', async () => {
  const f = fixture(); const imported=[];
  const result=await generate({prompt:'Create a fixture'}, {automationProjectId:'authorized-project'}, {database:{},resolved:{models:f.models,model:image},importer:async args => {imported.push(args);return {success:true,resource_id:'resource-fixture'};}});
  assert.equal(result.success,true);assert.equal(imported[0].project_id,'authorized-project');
  assert.equal(imported[0].content_base64,'aW1hZ2U='); assert.equal(result.resources[0].resource_id,'resource-fixture');
  assert.doesNotMatch(JSON.stringify(result), /secret|aW1hZ2U/);
});
test('classification returns exact adapter probabilities; no chat inference or synthetic usage', async () => {
  const f=fixture(); const result=await classify({state:{text:'Observed'},questions:{label:{type:'choice',instructions:'Choose',criteria:{yes:'Matches',no:'Other'}}}}, {}, {database:{},resolved:{models:f.models,model:classifier}});
  assert.deepEqual(result.answers.label.probabilities,{yes:0.8,no:0.2});assert.equal(result.usage,undefined);assert.equal(f.authCalls,1);
});
test('cancelled requests never dispatch generation', async () => {
  const f=fixture();const controller=new AbortController();controller.abort();
  const result=await f.models.generateImages(image,{input:[]},{signal:controller.signal});
  assert.equal(result.stopReason,'aborted');assert.equal(f.seen,undefined);
});
test('switching model preserves history and rejects incompatible vision', () => {
  const model={id:'chat',api:'fixture',input:['text'],contextWindow:8192,maxTokens:1024};
  const messages=[{role:'user',content:[{type:'image',data:'image'}]}];
  assert.throws(()=>validateModelHandoff(model,messages), /contains images/);
  assert.deepEqual(messages[0].content,[{type:'image',data:'image'}]);
  assert.equal(validateModelHandoff({...model,input:['text','image']},messages).id,'chat');
});
test('classifier tool schema validates recursive JSON state before provider dispatch', async () => {
  const {validateToolArguments}=await import('@dome/ai');
  const definitions=require('../../packages/tools/src/families/ai.schema.json');
  const tool=definitions.find(def => def.function.name==='ai_classify').function;
  const args={state:{text:'Observed',nested:[true,{score:1}]},questions:{label:{type:'choice',instructions:'Choose',criteria:{yes:'Matches',no:'Other'}}}};
  assert.deepEqual(validateToolArguments(tool,{id:'call',name:tool.name,arguments:args}),args);
  assert.throws(()=>validateToolArguments(tool,{id:'call',name:tool.name,arguments:{...args,questions:{label:{type:'invented'}}}}));
});
test('persisted mixed catalogs are isolated by profile and shared within the same profile', async () => {
  const {getModelCollection,catalogStore}=require('../ai/model-collection.cjs');
  function profile() {
    const rows=new Map();
    const queries={getSetting:{get:key=>rows.has(key)?{value:rows.get(key)}:undefined},setSetting:{run:(key,value)=>rows.set(key,value)}};
    return {getQueries:()=>queries};
  }
  const first=profile();const second=profile();
  const catalog={models:[image,classifier],updatedAt:123};
  await catalogStore(first).write('fixture',catalog);
  assert.deepEqual(await catalogStore(first).read('fixture'),catalog);
  assert.equal(await catalogStore(second).read('fixture'),undefined);
  const [a,b]=await Promise.all([getModelCollection(first),getModelCollection(first)]);
  assert.equal(a,b);
  assert.notEqual(a,await getModelCollection(second));
  const controller=new AbortController();controller.abort();
  await assert.rejects(catalogStore(first).write('fixture',{models:[]},{signal:controller.signal}));
  assert.deepEqual(await catalogStore(first).read('fixture'),catalog);
});

test('credential updates serialize OAuth refreshes and retain provider metadata across API/OAuth changes', async () => {
  const rows=new Map();
  const queries={getSetting:{get:key=>rows.has(key)?{value:rows.get(key)}:undefined},setSetting:{run:(key,value)=>rows.set(key,value)}};
  const read=(_queries,key)=>rows.get(key)||null;
  const write=(_queries,key,value)=>rows.set(key,value);
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(new URL('../ai/dome-credential-store.cjs',import.meta.url),'utf8'),{module,require:id=>{
    if(id==='./provider-keys.cjs')return {readProviderApiKey:(_queries,id)=>read(_queries,`ai_api_key_${id}`),writeProviderApiKey:(_queries,id,value)=>write(_queries,`ai_api_key_${id}`,value)};
    if(id==='../core/settings-secrets.cjs')return {readSettingSecret:read,writeSettingSecret:write};
    throw new Error(`Unexpected dependency: ${id}`);
  }});
  const store=module.exports.createDomeCredentialStore({getQueries:()=>queries});
  await store.modify('fixture',()=>({type:'oauth',access:'initial',refresh:'refresh',expires:10,accountId:'account',tenant:'tenant'}));
  await Promise.all([store.modify('fixture',async current=>{await new Promise(resolve=>setImmediate(resolve));return {...current,expires:current.expires+1};}),store.modify('fixture',current=>({...current,expires:current.expires+1}))]);
  assert.equal((await store.read('fixture')).expires,12);
  assert.equal((await store.read('fixture')).tenant,'tenant');
  await store.modify('fixture',()=>({type:'api_key',key:'own-key',env:{region:'fixture-region'}}));
  assert.equal((await store.read('fixture')).type,'api_key');
  assert.equal((await store.read('fixture')).env.region,'fixture-region');
  assert.equal(await store.read('other-provider'),undefined);
  await store.delete('fixture');
  assert.equal(await store.read('fixture'),undefined);
});
test('local custom protocols work without a key while cloud endpoints require their own credentials', async () => {
  const ai=await import('@dome/ai');
  const {createCustomProvider}=require('../ai/model-collection.cjs');
  const models=createModels({credentials:new InMemoryCredentialStore(),modelsStore:new InMemoryModelsStore()});
  const config={id:'local-classifier',name:'Local classifier',models:[{...classifier,provider:'local-classifier',api:'llama-cpp-classify',baseUrl:'http://127.0.0.1:8080'}]};
  models.setProvider(createCustomProvider(ai,config));
  assert.equal((await models.getAllAvailable()).length,1);
  models.setProvider(createCustomProvider(ai,{...config,id:'cloud-classifier',models:[{...config.models[0],provider:'cloud-classifier',baseUrl:'https://classifier.example'}]}));
  assert.equal(await models.getAuth('cloud-classifier'),undefined);
});
test('structured extraction uses each chat protocol native JSON request format', async () => {
  const {streamSimple}=await import('@dome/ai');
  const {buildStreamOptions}=require('../ai/llm-service.cjs');
  for(const [api,provider] of [['openai-completions','openai'],['openai-responses','openai'],['google-generative-ai','google'],['anthropic-messages','anthropic']]) {
    const model={api,provider,id:'fixture',name:'Fixture',baseUrl:'http://127.0.0.1:9',input:['text'],reasoning:false,cost,contextWindow:8192,maxTokens:1000};
    const options=buildStreamOptions({responseFormat:'json_object'},'test-key');
    let payload;
    await streamSimple(model,{messages:[{role:'user',content:'Return JSON',timestamp:0}]},{...options,onPayload:(request,model)=>{
      payload=options.onPayload(request,model);throw new Error('Captured before network');
    }}).result();
    assert.ok(payload,api);
    if(api==='google-generative-ai')assert.equal(payload.config.responseMimeType,'application/json');
    else if(api==='openai-responses')assert.equal(payload.text.format.type,'json_object');
    else if(api==='openai-completions')assert.equal(payload.response_format.type,'json_object');
    else assert.equal(payload.response_format,undefined);
  }
});
