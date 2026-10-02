import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
type Prompt = { id: string; type: string; message: string; options?: { id: string; label: string }[] };
type Event = { type: string; url?: string; message?: string; instructions?: string; userCode?: string; verificationUri?: string };
type Flow = { state: string; events: Event[]; prompt: Prompt | null; error?: string };
export default function AIProviderLogin({ id, onFinished }: { id: string; onFinished: () => void }) {
  const { t } = useTranslation();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await window.electron.invoke('ai:provider-login-status', { id });
        if (!active) return;
        if (!result.success) { setError(result.error || ''); return; }
        const next = result.data as Flow; setFlow(next);
        if (next.state === 'complete') onFinished();
      } catch (error) { if (active) setError(String(error)); }
    };
    void poll(); const timer = setInterval(() => { void poll(); }, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [id, onFinished]);
  const answer = async () => {
    if (!flow?.prompt) return;
    const result = await window.electron.invoke('ai:provider-login-answer', { id, promptId: flow.prompt.id, value });
    if (!result.success) setError(result.error || ''); else setValue('');
  };
  return <div className="flex flex-col gap-3 rounded-lg border p-4">
    {flow?.events.map((event, index) => <div key={index} className="flex flex-col gap-1 text-sm">
      <p>{event.message || event.instructions || event.userCode}</p>
      {(event.url || event.verificationUri) && <Button variant="outline" className="self-start" onClick={() => { void window.electron.invoke('open-external-url', event.url || event.verificationUri); }}>{t('ai_capabilities.open_login')}</Button>}
    </div>)}
    {flow?.prompt && <Field><FieldLabel htmlFor="provider-login-value">{flow.prompt.message}</FieldLabel>
      {flow.prompt.type === 'select' ? <Select value={value} onValueChange={value => setValue(value || '')}><SelectTrigger id="provider-login-value"><SelectValue>{flow.prompt.options?.find(option => option.id === value)?.label || t('ai_capabilities.continue')}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{flow.prompt.options?.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
        : <Input id="provider-login-value" type={flow.prompt.type === 'secret' ? 'password' : 'text'} value={value} onChange={event => setValue(event.target.value)} />}
      <Button className="self-start" disabled={!value} onClick={() => { void answer().catch(error => setError(String(error))); }}>{t('ai_capabilities.continue')}</Button>
    </Field>}
    {(error || flow?.error) && <p role="alert" className="text-sm text-destructive">{error || flow?.error}</p>}
    <Button className="self-start" variant="ghost" onClick={() => { void window.electron.invoke('ai:provider-login-cancel', { id }).then(onFinished); }}>{t('common.cancel')}</Button>
  </div>;
}
