'use strict';
const { z } = require('zod');
const { fetchWithDomeAuth, getDomeProviderBaseUrl } = require('../../auth/dome-oauth.cjs');
const {
  listCloudAgentProviders,
  attachRememberedRuntime,
  forgetRuntime,
  publicManyError,
} = require('../../ai/cloud-agent-runtime.cjs');
const { createCloudMany, cloudModels, setManyModel } = require('../../agents/manys-client.cjs');
const RequestSchema=z.object({
  method:z.enum(['GET','POST','PUT','PATCH','DELETE']).default('GET'),
  path:z.string().max(300).regex(/^(?:\/[a-z0-9-]+)*(?:\?(?:after|before)=\d+)?$/),
  body:z.record(z.string(),z.unknown()).optional(),
}).strict();
async function readManyBody(response) {
  const text = await response.text();
  if (!String(text).trim()) return response.ok ? {} : { error: 'service_unavailable' };
  return JSON.parse(text);
}
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
  ipcMain.handle('manys:cloud-models',async(event,payload)=>{
    if(!windowManager.isAuthorized(event.sender.id))return {success:false,error:'unauthorized'};
    if(!z.union([z.undefined(),z.null(),z.object({}).strict()]).safeParse(payload).success)return {success:false,error:'invalid_request'};
    try {return {success:true,data:await cloudModels(database)};}
    catch (error) {return {success:false,error:publicManyError(error)};}
  });
  ipcMain.handle('manys:set-model',async(event,payload)=>{
    if(!windowManager.isAuthorized(event.sender.id))return {success:false,error:'unauthorized'};
    const parsed=z.object({id:z.string().uuid(),selection:z.object({
      source:z.enum(['dome','external']),provider:z.string().max(80).optional(),model:z.string().min(1).max(200),
      thinking:z.enum(['off','minimal','low','medium','high','xhigh','max']).optional(),
    }).strict()}).strict().safeParse(payload);
    if(!parsed.success)return {success:false,error:'invalid_request'};
    try {return {success:true,data:await setManyModel(database,parsed.data.id,parsed.data.selection)};}
    catch (error) {return {success:false,error:publicManyError(error)};}
  });
  ipcMain.handle('manys:request',async(event,payload)=>{
    if(!windowManager.isAuthorized(event.sender.id))return {success:false,error:'unauthorized'};
    const parsed=RequestSchema.safeParse(payload);
    if(!parsed.success)return {success:false,error:'invalid_request'};
    let {path,method,body}=parsed.data;
    if(method==='POST'&&path===''){
      try {
        return {success:true,data:await createCloudMany(database,body??{})};
      } catch (error) {
        return {success:false,error:publicManyError(error)};
      }
    }
    if(JSON.stringify(body??{}).length>1048576)return {success:false,error:'request_too_large'};
    try {
      const response=await fetchWithDomeAuth(database,`${getDomeProviderBaseUrl()}/api/v1/manys${path}`,{
        method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000),
      });
      const data=await readManyBody(response);
      if(!response.ok){
        const code=data&&typeof data==='object'&&typeof data.error==='string'?data.error:'service_unavailable';
        return {success:false,error:publicManyError(new Error(code)),status:response.status};
      }
      if(method==='DELETE'&&/^\/[a-z0-9-]+$/.test(path))forgetRuntime(database.getDB(),path.slice(1));
      const queries=database.getQueries();
      const enriched=attachRememberedRuntime(queries,data);
      return {success:true,data:enriched};
    }catch (error) {return {success:false,error:publicManyError(error)};}
  });
}
module.exports={register};
