import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import AIProviderLogin from './AIProviderLogin';
type Selection = { provider: string; model: string };
type Catalog = { models: { id: string; name: string; provider: string; type: string; available: boolean }[]; providers: { id: string; name: string; oauth: boolean; apiKey: boolean }[]; selected: { image: Selection; classifier: Selection }; diagnostics: { provider: string; error: string }[] };
const modelKey = (value: Selection) => value.provider && value.model ? `${value.provider}:${value.model}` : '';
export default function AICapabilitySettings() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState({ image: '', classifier: '' });
  const [provider, setProvider] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ id: '', name: '', url: '', model: '', api: 'openai-completions', type: 'chat', apiKey: '' });
  const load = useCallback(async (refresh = false) => {
    const result = await window.electron.invoke('ai:capability-catalog', { refresh });
    if (!result.success) throw new Error(result.error);
    const data = result.data as Catalog; setCatalog(data);
    setSelected({ image: modelKey(data.selected.image), classifier: modelKey(data.selected.classifier) });
  }, []);
  useEffect(() => { void load().catch(error => setMessage(String(error.message))); }, [load]);
  const finishLogin = useCallback(() => { setLogin(null); void load().catch(error => setMessage(String(error.message))); }, [load]);
  const action = async (fn: () => Promise<void>) => { setBusy(true); setMessage(''); try { await fn(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const save = async () => {
    const configuration: Partial<Record<'image' | 'classifier', Selection>> = {};
    for (const type of ['image', 'classifier'] as const) {
      const key = selected[type]; const separator = key.indexOf(':');
      if (separator > 0) configuration[type] = { provider: key.slice(0, separator), model: key.slice(separator + 1) };
    }
    const result = await window.electron.invoke('ai:capability-configure', configuration);
    if (!result.success) throw new Error(result.error);
    setMessage(t('ai_capabilities.saved'));
  };
  const startLogin = async (type: 'api_key' | 'oauth') => {
    const result = await window.electron.invoke('ai:provider-login', { provider, type });
    if (!result.success) throw new Error(result.error);
    setLogin((result.data as { id: string }).id);
  };
  const addProvider = async () => {
    const result = await window.electron.invoke('ai:provider-configure', { id: custom.id, name: custom.name, apiKey: custom.apiKey || undefined,
      models: [{ id: custom.model, name: custom.model, type: custom.type, api: custom.api, baseUrl: custom.url, input: ['text'],
        ...(custom.type === 'image' ? { output: ['image'] } : {}) }] });
    if (!result.success) throw new Error(result.error);
    setCustom(current => ({ ...current, apiKey: '' })); setCustomOpen(false); await load();
  };
  const currentProvider = catalog?.providers.find(item => item.id === provider);
  return <div className="flex max-w-2xl flex-col gap-6">
    <FieldGroup>
      {(['image', 'classifier'] as const).map(type => <Field key={type}><FieldLabel htmlFor={`ai-capability-${type}`}>{t(`ai_capabilities.${type}`)}</FieldLabel>
        <Select value={selected[type]} onValueChange={value => setSelected(current => ({ ...current, [type]: value || '' }))}>
          <SelectTrigger id={`ai-capability-${type}`} className="w-full"><SelectValue placeholder={t('ai_capabilities.select_model')}>{catalog?.models.find(model => `${model.provider}:${model.id}` === selected[type])?.name || t('ai_capabilities.select_model')}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{catalog?.models.filter(model => model.type === type).map(model => <SelectItem key={`${model.provider}:${model.id}`} value={`${model.provider}:${model.id}`}>
            {model.name} · {model.provider}{model.available ? '' : ` · ${t('ai_capabilities.needs_account')}`}
          </SelectItem>)}</SelectGroup></SelectContent>
        </Select><FieldDescription>{t(`ai_capabilities.${type}_help`)}</FieldDescription>
      </Field>)}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !catalog} onClick={() => { void action(save); }}>{t('common.save')}</Button>
        <Button variant="outline" disabled={busy} onClick={() => { void action(() => load(true)); }}>{t('ai_capabilities.refresh')}</Button></div>
    </FieldGroup>
    <FieldGroup><Field><FieldLabel htmlFor="ai-capability-provider">{t('ai_capabilities.account')}</FieldLabel>
      <Select value={provider} onValueChange={value => { setProvider(value || ''); setChatModel(''); }}><SelectTrigger id="ai-capability-provider" className="w-full"><SelectValue>{currentProvider?.name || t('ai_capabilities.account')}</SelectValue></SelectTrigger><SelectContent><SelectGroup>
        {catalog?.providers.map(provider => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}
      </SelectGroup></SelectContent></Select>
      <FieldDescription>{t('ai_capabilities.account_help')}</FieldDescription></Field>
      <div className="flex flex-wrap gap-2">
        {currentProvider?.oauth && <Button disabled={busy || Boolean(login)} onClick={() => { void action(() => startLogin('oauth')); }}>{t('ai_capabilities.connect')}</Button>}
        {currentProvider?.apiKey && <Button variant="outline" disabled={busy || Boolean(login)} onClick={() => { void action(() => startLogin('api_key')); }}>{t('ai_capabilities.enter_key')}</Button>}
      </div>
    </FieldGroup>
    {provider && <Field><FieldLabel htmlFor="capability-chat-model">{t('ai_capabilities.chat_model')}</FieldLabel>
      <Select value={chatModel} onValueChange={value => setChatModel(value || '')}><SelectTrigger id="capability-chat-model" className="w-full"><SelectValue>{catalog?.models.find(model => model.provider === provider && model.id === chatModel)?.name || t('ai_capabilities.select_model')}</SelectValue></SelectTrigger><SelectContent><SelectGroup>
        {catalog?.models.filter(model => model.type === 'chat' && model.provider === provider).map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}
      </SelectGroup></SelectContent></Select>
      <Button className="self-start" disabled={busy || !chatModel} onClick={() => { void action(async () => {
        const result = await window.electron.invoke('ai:chat-model-select', { provider, model: chatModel });
        if (!result.success) throw new Error(result.error);
        window.dispatchEvent(new Event('dome:ai-config-changed'));
        setMessage(t('ai_capabilities.saved'));
      }); }}>{t('ai_capabilities.use_chat')}</Button>
    </Field>}
    {login && <AIProviderLogin id={login} onFinished={finishLogin} />}
    <Dialog open={customOpen} onOpenChange={setCustomOpen}><DialogTrigger render={<Button variant="outline" className="self-start" />}>{t('ai_capabilities.add_provider')}</DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>{t('ai_capabilities.add_provider')}</DialogTitle></DialogHeader><FieldGroup>
        {(['id', 'name', 'url', 'model', 'apiKey'] as const).map(key => <Field key={key}><FieldLabel htmlFor={`ai-custom-${key}`}>{t(`ai_capabilities.provider_${key}`)}</FieldLabel>
          <Input id={`ai-custom-${key}`} type={key === 'apiKey' ? 'password' : 'text'} value={custom[key]} onChange={event => setCustom(current => ({ ...current, [key]: event.target.value }))} /></Field>)}
        <Field><FieldLabel htmlFor="ai-custom-api">{t('ai_capabilities.protocol')}</FieldLabel><Select value={custom.api} onValueChange={value => { if (value) setCustom(current => ({ ...current, api: value, type: value === 'openrouter-images' ? 'image' : value.includes('classify') || value.includes('system-one') ? 'classifier' : 'chat' })); }}>
          <SelectTrigger id="ai-custom-api" className="w-full"><SelectValue>{custom.api}</SelectValue></SelectTrigger><SelectContent><SelectGroup>
            {['openai-completions', 'openai-responses', 'anthropic-messages', 'openrouter-images', 'llama-cpp-classify', 'typesafe-system-one'].map(api => <SelectItem key={api} value={api}>{api}</SelectItem>)}
          </SelectGroup></SelectContent></Select></Field>
        <Button disabled={busy || !custom.id || !custom.name || !custom.model || !custom.url} onClick={() => { void action(addProvider); }}>{t('common.save')}</Button>
      </FieldGroup></DialogContent>
    </Dialog>
    {catalog?.diagnostics.map(item => <p key={item.provider} className="text-sm text-destructive">{item.provider}: {item.error}</p>)}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </div>;
}
