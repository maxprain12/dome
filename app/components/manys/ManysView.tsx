import { useCallback, useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Message, MessageContent } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { MessageScroller, MessageScrollerProvider, MessageScrollerViewport, MessageScrollerContent } from '@/components/ui/message-scroller';
import { Skeleton } from '@/components/ui/skeleton';
import { request, delegateToMany, type CloudMany, type ManyDetail } from '@/lib/manys/api';
import { useAppStore } from '@/lib/store/useAppStore';
import type {Resource} from '@/types';
import { useTabStore } from '@/lib/store/useTabStore';
import {useManyStore} from '@/lib/store/useManyStore';
import ManySettings from './ManySettings';
import ManyComputer from './ManyComputer';
import ManyReview from './ManyReview';

export default function ManysView() {
  const {t}=useTranslation();
  const [manys,setManys]=useState<CloudMany[]>([]);const [selected,setSelected]=useState('');
  const [detail,setDetail]=useState<ManyDetail|null>(null);const [error,setError]=useState('');
  const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [loaded,setLoaded]=useState(false);
  const currentSelected=useRef(selected);currentSelected.current=selected;
  const [draft,setDraft]=useState('');const [computerOpen,setComputerOpen]=useState(false);
  const refresh=useCallback(async()=>{
    try {const result=await request<{manys:CloudMany[]}>('');setManys(result.manys);setLoaded(true);if(selected){const value=await request<ManyDetail>(`/${selected}`);if(currentSelected.current===selected)setDetail(value);}setError('');}
    catch(e){setError(e instanceof Error?e.message:'service_unavailable');setLoaded(true);}
  },[selected]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>{void refresh();},5000);return()=>clearInterval(timer);},[refresh]);
  useEffect(()=>{setDetail(null);setDraft(localStorage.getItem(`manys:draft:${selected}`)??'');},[selected]);
  const perform=async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();await refresh();}catch(e){setError(e instanceof Error?e.message:'service_unavailable');}finally{setBusy(false);}};
  const openResource=(id:string)=>perform(async()=>{
    const sync=await window.electron.domainSync.syncNow({domain:'library'});if(!sync.success)throw new Error('service_unavailable');
    const loaded=await window.electron.db.resources.getById(id) as {success:boolean;data?:Resource};
    if(!loaded.success||!loaded.data)throw new Error('resource_not_found');const resource=loaded.data;
    useAppStore.getState().addResource(resource);useTabStore.getState().openResourceTab(resource.id,resource.type,resource.title);
  });
  const send=()=>perform(async()=>{await delegateToMany(selected,draft);localStorage.removeItem(`manys:draft:${selected}`);setDraft('');});
  return <div className="flex h-full min-h-0 flex-col bg-background md:flex-row">
    <aside className="flex shrink-0 flex-col gap-3 border-b border-border p-4 md:w-60 md:border-r md:border-b-0">
      <h1 className="text-lg font-semibold">{t('manys.title')}</h1>
      <Button variant="outline" onClick={()=>useManyStore.getState().setOpen(true)}>{t('manys.local')}</Button>
      {!loaded&&<Skeleton className="h-20"/>}
      <nav aria-label={t('manys.title')} className="flex flex-col gap-1 overflow-auto">
        {manys.map(many=><Button key={many.id} variant={selected===many.id?'secondary':'ghost'} onClick={()=>setSelected(many.id)} className="justify-start truncate">{many.name}</Button>)}
      </nav>
      <form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();void perform(async()=>{const many=await request<CloudMany>('','POST',{name});setName('');setSelected(many.id);});}}>
        <Field><FieldLabel htmlFor="many-name">{t('manys.name')}</FieldLabel><Input id="many-name" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></Field>
        <Button disabled={busy||!name.trim()} type="submit">{t('manys.create')}</Button>
      </form>
    </aside>
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
      {error&&<Alert variant="destructive"><AlertDescription>{t(`manys.errors.${error}`,{defaultValue:t('manys.errors.service_unavailable')})} <Button size="sm" variant="outline" onClick={()=>{void refresh();}}>{t('manys.retry')}</Button></AlertDescription></Alert>}
      {!selected&&<p className="text-muted-foreground">{t('manys.intro')}</p>}
      {selected&&!detail&&!error&&<Skeleton className="h-48"/>}
      {detail&&<Tabs defaultValue="conversation" className="flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{detail.many.name}</h2><Badge variant="outline">{t('manys.cloud')}</Badge><Button variant="outline" onClick={()=>setComputerOpen(value=>!value)}>{t('manys.computer')}</Button></header>
        <TabsList><TabsTrigger value="conversation">{t('manys.conversation')}</TabsTrigger><TabsTrigger value="tasks">{t('manys.tasks')}</TabsTrigger><TabsTrigger value="recurrences">{t('manys.recurrences')}</TabsTrigger><TabsTrigger value="context">{t('manys.context')}</TabsTrigger></TabsList>
        <TabsContent value="conversation" className="flex min-h-0 flex-1 flex-col gap-3">
          <MessageScrollerProvider><MessageScroller><MessageScrollerViewport><MessageScrollerContent>
            {detail.messages.map(message=><Message key={message.id} align={message.role==='user'?'end':'start'}><MessageContent><Bubble variant="muted"><BubbleContent className="whitespace-pre-wrap">{message.content}</BubbleContent></Bubble>{detail.tasks.find(task=>task.id===message.task_id)?.state==='queued'&&<Badge variant="outline">{t('manys.states.queued')}</Badge>}</MessageContent></Message>)}
          </MessageScrollerContent></MessageScrollerViewport></MessageScroller></MessageScrollerProvider>
          <form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();void send();}}>
            <Field><FieldLabel htmlFor="many-message">{t('manys.message')}</FieldLabel><Textarea id="many-message" value={draft} maxLength={50000} onChange={e=>{setDraft(e.target.value);localStorage.setItem(`manys:draft:${selected}`,e.target.value);}}/></Field>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||!draft.trim()}>{t('manys.send')}</Button>{detail.tasks.filter(task=>task.state==='running').map(task=><Button key={task.id} variant="outline" onClick={()=>{void perform(()=>request(`/${selected}/tasks/${task.id}`,'PATCH',{action:'pause'}));}}>{t('manys.stopReply')}</Button>)}</div>
          </form>
        </TabsContent>
        <TabsContent value="tasks" className="overflow-auto">
          <div className="flex flex-col gap-4">{detail.tasks.map(task=><article key={task.id} className="flex flex-col gap-2 border-b border-border pb-4">
            <div className="flex items-start justify-between gap-3"><p className="whitespace-pre-wrap">{task.prompt}</p><Badge variant="outline">{t(`manys.states.${task.state}`)}</Badge></div>
            {task.checkpoint?.reason&&<p className="text-sm text-muted-foreground">{t(`manys.errors.${task.checkpoint.reason}`,{defaultValue:task.checkpoint.reason})}</p>}
            {task.result?.text&&<p className="whitespace-pre-wrap">{task.result.text}</p>}
            {task.result?.resources?.map(id=><Button key={id} variant="link" onClick={()=>{void openResource(id);}}>{t('manys.openResource')}</Button>)}
            {task.question&&<form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void perform(()=>request(`/${selected}/tasks/${task.id}`,'PATCH',{action:'answer',answer:form.get('answer')}));}} className="flex flex-col gap-2"><Field><FieldLabel>{task.question}</FieldLabel><Input name="answer" required /></Field><Button type="submit" disabled={busy}>{t('manys.answer')}</Button></form>}
            <div className="flex gap-2">{task.state==='paused'&&<Button disabled={busy} onClick={()=>{void perform(()=>request(`/${selected}/tasks/${task.id}`,'PATCH',{action:'resume'}));}}>{t('manys.resume')}</Button>}{!['completed','failed','cancelled'].includes(task.state)&&<Button disabled={busy} variant="outline" onClick={()=>{void perform(()=>request(`/${selected}/tasks/${task.id}`,'PATCH',{action:'cancel'}));}}>{t('manys.cancelTask')}</Button>}</div>
          </article>)}
          <ManyReview detail={detail} busy={busy} perform={perform}/>
          </div>
        </TabsContent>
        <TabsContent value="context"><ManySettings key={selected} many={detail.many} onSave={value=>perform(()=>request(`/${selected}`,'PATCH',value))}/></TabsContent>
        <TabsContent value="recurrences"><FieldGroup><form className="flex flex-col gap-3" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void perform(()=>request(`/${selected}/recurrences`,'POST',{conversationId:detail.conversations[0].id,prompt:form.get('prompt'),intervalSeconds:Number(form.get('interval')),nextAt:new Date(Date.now()+300000).toISOString()}));}}><Field><FieldLabel>{t('manys.message')}</FieldLabel><Textarea name="prompt" required /></Field><Field><FieldLabel>{t('manys.interval')}</FieldLabel><Input name="interval" type="number" min={300} max={31536000} defaultValue={86400}/></Field><Button type="submit" disabled={busy}>{t('manys.create')}</Button></form>{detail.recurrences.map(r=><article key={r.id} className="flex items-center gap-2"><p className="flex-1">{r.prompt} · {new Date(r.next_at).toLocaleString()}</p><Button variant="outline" disabled={busy} onClick={()=>{void perform(()=>request(`/${selected}/recurrences/${r.id}`,'DELETE'));}}>{t('manys.remove')}</Button></article>)}</FieldGroup></TabsContent>

      </Tabs>}
    </main>
    {detail&&computerOpen&&<aside className="w-full overflow-auto border-l border-border p-4 lg:w-96 lg:shrink-0"><ManyComputer key={selected} manyId={selected} control={detail.computer?.control??'agent'}/></aside>}
  </div>;
}
