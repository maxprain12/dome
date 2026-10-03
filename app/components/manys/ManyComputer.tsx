import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { request } from '@/lib/manys/api';
export default function ManyComputer({manyId,control}:{manyId:string;control:string}) {
  const {t}=useTranslation();const [requestId,setRequestId]=useState('');const [result,setResult]=useState<Record<string,unknown>>({});const [screen,setScreen]=useState<{base64:string;width:number;height:number}|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const call=async(operation:string,parameters:Record<string,unknown>={})=>{
    setBusy(true);try{const response=await request<Record<string,unknown>>(`/${manyId}/computer`,'POST',{operation,parameters});setResult(response);if(typeof response.base64==='string')setScreen({base64:response.base64,width:Number(response.width??1280),height:Number(response.height??800)});if(response.request)setRequestId(String((response.request as {id:string}).id));setError('');}catch(e){setError(e instanceof Error?e.message:'service_unavailable');}finally{setBusy(false);}
  };
  const release=async()=>{
    let id=requestId;if(!id){const state=await request<{request?:{id:string}}>(`/${manyId}/computer`,'POST',{operation:'control'});id=state.request?.id??'';}
    await call('control/release',{requestId:id});
  };
  const take=async()=>{
    const pending=await request<Record<string,unknown>>(`/${manyId}/computer`,'POST',{operation:'control/request',parameters:{reason:t('manys.takeControl')}});
    const id=String((pending.request as {id:string}).id);setRequestId(id);await call('control/take',{requestId:id});
  };
  return <aside className="flex flex-col gap-3">
    {error&&<Alert variant="destructive"><AlertDescription>{t('manys.errors.service_unavailable')}</AlertDescription></Alert>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy} variant="outline" onClick={()=>{void call('screenshot');}}>{t('manys.screen')}</Button><Button disabled={busy} variant="outline" onClick={()=>{void call('snapshot');}}>{t('manys.snapshot')}</Button><Button disabled={busy} variant="outline" onClick={()=>{void call('files/list');}}>{t('manys.files')}</Button>
    <Button disabled={busy} onClick={()=>{void (control==='human'?release():take()).catch(()=>setError('service_unavailable'));}}>{t(control==='human'?'manys.releaseControl':'manys.takeControl')}</Button></div>
    {screen&&<button type="button" disabled={busy||control!=='human'} aria-label={t('manys.clickScreen')} onClick={e=>{const image=e.currentTarget.querySelector('img');if(!image)return;const bounds=image.getBoundingClientRect();const x=e.detail?(e.clientX-bounds.left)*screen.width/bounds.width:screen.width/2;const y=e.detail?(e.clientY-bounds.top)*screen.height/bounds.height:screen.height/2;void call('human/click',{x,y}).then(()=>call('screenshot'));}}><img src={`data:image/png;base64,${screen.base64}`} alt={t('manys.screen')} className="w-full"/></button>}
    {control==='snapshot_required'&&<p className="text-sm text-muted-foreground">{t('manys.snapshotHint')}</p>}
    <form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();void call('human/navigate',{url:new FormData(e.currentTarget).get('url')}).then(()=>call('screenshot'));}}><Field><FieldLabel>{t('manys.browserUrl')}</FieldLabel><Input name="url" type="url" required disabled={control!=='human'}/></Field><Button type="submit" disabled={busy||control!=='human'}>{t('manys.navigate')}</Button></form>
    <form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();const text=new FormData(e.currentTarget).get('text');e.currentTarget.reset();void call('human/type',{text}).then(()=>call('screenshot'));}}><Field><FieldLabel>{t('manys.typeText')}</FieldLabel><Input name="text" type="password" autoComplete="off" required disabled={control!=='human'}/></Field><Button type="submit" disabled={busy||control!=='human'}>{t('manys.type')}</Button></form>
    <div className="flex gap-2"><Button disabled={busy||control!=='human'} variant="outline" onClick={()=>{void call('human/key',{key:'Enter'}).then(()=>call('screenshot'));}}>{t('manys.enter')}</Button><Button disabled={busy||control!=='human'} variant="outline" onClick={()=>{void call('human/scroll',{deltaY:600}).then(()=>call('screenshot'));}}>{t('manys.scroll')}</Button></div>
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({...result,base64:undefined,computerId:undefined,generation:undefined},null,2)}</pre>
    <form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void call('human/exec',{command:form.get('command'),timeoutMs:10000});}}><Field><FieldLabel htmlFor="many-terminal">{t('manys.terminal')}</FieldLabel><Input id="many-terminal" name="command" disabled={control!=='human'} required/></Field><Button type="submit" disabled={busy||control!=='human'}>{t('manys.run')}</Button></form>
  </aside>;
}
