import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { request, type ManyDetail } from '@/lib/manys/api';
export default function ManyReview({detail,busy,perform}:{detail:ManyDetail;busy:boolean;perform:(fn:()=>Promise<unknown>)=>Promise<void>}) {
  const {t}=useTranslation();const many=detail.many.id;
  return <div className="flex flex-col gap-4">
    {detail.actions.map(action=><article key={action.id} className="flex flex-col gap-2 border-b border-border pb-4">
      <Badge variant="outline">{t(`manys.actions.${action.state}`)}</Badge><pre className="overflow-auto text-xs">{JSON.stringify(action.proposal,null,2)}</pre>
      {action.state==='pending'&&<div className="flex gap-2">{[true,false].map(approve=><Button key={String(approve)} disabled={busy} variant={approve?'default':'outline'} onClick={()=>{void perform(()=>request(`/${many}/actions/${action.id}`,'PATCH',{approve,digest:action.digest}));}}>{t(approve?'manys.approve':'manys.reject')}</Button>)}</div>}
      {action.state==='outcome_unknown'&&<form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void perform(()=>request(`/${many}/actions/${action.id}`,'PATCH',{outcome:(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')??'succeeded',evidence:data.get('evidence')}));}}>
        <p className="text-sm text-muted-foreground">{t('manys.reconcileHint')}</p><Field><FieldLabel>{t('manys.evidence')}</FieldLabel><Input name="evidence" required maxLength={10000}/></Field>
        <div className="flex gap-2"><Button type="submit" disabled={busy} value="succeeded">{t('manys.confirmSucceeded')}</Button><Button type="submit" variant="outline" disabled={busy} value="failed">{t('manys.confirmFailed')}</Button></div>
      </form>}
      {action.receipt!=null&&<pre className="overflow-auto text-xs">{JSON.stringify(action.receipt,null,2)}</pre>}
    </article>)}
    {(detail.conflicts??[]).map(conflict=><article key={conflict.id} className="flex flex-col gap-2 border-b border-border pb-4"><h3 className="font-medium">{t('manys.conflict')}: {conflict.title??t('manys.openResource')}</h3><pre className="max-h-48 overflow-auto text-xs">{JSON.stringify(conflict.proposal,null,2)}</pre><div className="flex gap-2">{[true,false].map(apply=><Button key={String(apply)} variant={apply?'default':'outline'} disabled={busy} onClick={()=>{void perform(()=>request(`/${many}/conflicts/${conflict.id}`,'PATCH',{apply,expectedRevision:Number(conflict.current_revision)}));}}>{t(apply?'manys.applyProposal':'manys.keepCurrent')}</Button>)}</div></article>)}
  </div>;
}
