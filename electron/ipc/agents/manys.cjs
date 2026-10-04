'use strict';
const { z } = require('zod');
const { fetchWithDomeAuth, getDomeProviderBaseUrl } = require('../../auth/dome-oauth.cjs');
const {
  listCloudAgentProviders,
  prepareCloudManyCreate,
  acceptCreatedMany,
  attachRememberedRuntime,
} = require('../../ai/cloud-agent-runtime.cjs');
const RequestSchema=z.object({
  method:z.enum(['GET','POST','PATCH','DELETE']).default('GET'),
  path:z.string().max(300).regex(/^(?:\/[a-z0-9-]+)*(?:\?after=\d+)?$/),
  body:z.record(z.string(),z.unknown()).optional(),
}).strict();
function register({ipcMain,windowManager,database}) {
  ipcMain.handle('manys:cloud-providers',async(event,payload)=>{
    if(!windowManager.isAuthorized(event.sender.id))return {success:false,error:'unauthorized'};
    const parsed=z.union([z.undefined(),z.null(),z.object({}).strict()]).safeParse(payload);
    if(!parsed.success)return {success:false,error:'invalid_request'};
    try {
      return {success:true,data:{providers:listCloudAgentProviders(database.getQueries())}};
    } catch {
      return {success:false,error:'service_unavailable'};
    }
  });
  ipcMain.handle('manys:request',async(event,payload)=>{
    if(!windowManager.isAuthorized(event.sender.id))return {success:false,error:'unauthorized'};
    const parsed=RequestSchema.safeParse(payload);
    if(!parsed.success)return {success:false,error:'invalid_request'};
    let {path,method,body}=parsed.data;
    let sentRuntime=null;
    if(method==='POST'&&path===''){
      const prepared=prepareCloudManyCreate(database.getQueries(),body??{});
      if(!prepared.ok)return {success:false,error:prepared.error};
      body=prepared.body;
      sentRuntime=prepared.runtime;
    }
    if(JSON.stringify(body??{}).length>1048576)return {success:false,error:'request_too_large'};
    try {
      const response=await fetchWithDomeAuth(database,`${getDomeProviderBaseUrl()}/api/v1/manys${path}`,{
        method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000),
      });
      const data=await response.json();
      if(!response.ok)return {success:false,error:data.error||'service_unavailable',status:response.status};
      const queries=database.getQueries();
      const enriched=method==='POST'&&path===''?acceptCreatedMany(queries,sentRuntime,data):attachRememberedRuntime(queries,data);
      return {success:true,data:enriched};
    }catch{return {success:false,error:'service_unavailable'};}
  });
}
module.exports={register};
