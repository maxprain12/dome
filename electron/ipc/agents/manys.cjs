'use strict';
const { z } = require('zod');
const { fetchWithDomeAuth, getDomeProviderBaseUrl } = require('../../auth/dome-oauth.cjs');
const RequestSchema=z.object({
  method:z.enum(['GET','POST','PATCH','DELETE']).default('GET'),
  path:z.string().max(300).regex(/^(?:\/[a-z0-9-]+)*(?:\?after=\d+)?$/),
  body:z.record(z.string(),z.unknown()).optional(),
}).strict();
function register({ipcMain,windowManager,database}) {
  ipcMain.handle('manys:request',async(event,payload)=>{
    if(!windowManager.isAuthorized(event.sender.id))return {success:false,error:'unauthorized'};
    const parsed=RequestSchema.safeParse(payload);
    if(!parsed.success)return {success:false,error:'invalid_request'};
    if(JSON.stringify(parsed.data.body??{}).length>1048576)return {success:false,error:'request_too_large'};
    try {
      const {path,method,body}=parsed.data;
      const response=await fetchWithDomeAuth(database,`${getDomeProviderBaseUrl()}/api/v1/manys${path}`,{
        method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000),
      });
      const data=await response.json();
      return response.ok?{success:true,data}:{success:false,error:data.error||'service_unavailable',status:response.status};
    }catch{return {success:false,error:'service_unavailable'};}
  });
}
module.exports={register};
