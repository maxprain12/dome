import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsGroup, SettingsRow } from '../blocks';
import type { Provider, ResearchPolicy, ResearchRouting, ResearchStatus } from './types';

interface Props { status: ResearchStatus; onSaved: () => Promise<void>; onBusy: (busy: boolean) => void }
export default function ResearchProviders({ status, onSaved, onBusy }: Props) {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<ResearchPolicy>(status.policy);
  const [perRun, setPerRun] = useState(String(status.policy.perRunUsd));
  const [monthly, setMonthly] = useState(String(status.policy.monthlyUsd));
  const [preferences, setPreferences] = useState({ searchProvider: status.routing.searchProvider, webSource: status.routing.webSource });
  const routing = { ...status.routing, ...preferences };
  const [keys, setKeys] = useState<Partial<Record<Provider, string | null>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = JSON.stringify(policy) !== JSON.stringify(status.policy) || perRun !== String(status.policy.perRunUsd) || monthly !== String(status.policy.monthlyUsd) || preferences.searchProvider !== status.routing.searchProvider || preferences.webSource !== status.routing.webSource || Object.keys(keys).length > 0;
  const updatePolicy = (patch: Partial<ResearchPolicy>) => { setPolicy({ ...policy, ...patch }); setMessage(''); };
  const updateRouting = (patch: Partial<typeof preferences>) => { setPreferences({ ...preferences, ...patch }); setMessage(''); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); onBusy(true); setMessage('');
    try {
      const savedPolicy = { ...policy, perRunUsd: Number(perRun), monthlyUsd: Number(monthly) };
      const result = await window.electron.invoke('research:configure', { policy: savedPolicy, routing, keys });
      if (!result.success) throw new Error(result.error === 'provider_key_required' ? 'key_required' : result.error === 'encryption_unavailable' ? 'encryption_unavailable' : 'save_error');
      setKeys({}); setPolicy(savedPolicy); setPerRun(String(savedPolicy.perRunUsd)); setMonthly(String(savedPolicy.monthlyUsd));
      try { await onSaved(); setMessage('saved'); } catch { setMessage('saved_refresh_error'); }
    } catch (error) { setMessage(error instanceof Error && ['key_required', 'encryption_unavailable'].includes(error.message) ? error.message : 'save_error'); }
    finally { setBusy(false); onBusy(false); }
  };
  return <form onSubmit={save} className="flex min-w-0 flex-col gap-6">
    <fieldset disabled={busy} className="flex min-w-0 flex-col gap-6 border-0 p-0">
      <SettingsGroup title={t('research.providers_title')} description={t('research.providers_hint')}>
        {status.providers.map((provider) => <SettingsRow key={provider.name} title={t(`research.providers.${provider.name}`)}
          description={t('research.rate', { amount: provider.estimatedUsdPerSearch.toFixed(3) })}
          control={<label className="flex min-h-9 items-center gap-2 text-sm">
            <Checkbox checked={policy.enabledProviders.includes(provider.name)} onCheckedChange={(checked) => {
              updatePolicy({ enabledProviders: checked ? [...policy.enabledProviders, provider.name] : policy.enabledProviders.filter((name) => name !== provider.name) });
              if (!checked && routing.searchProvider === provider.name) updateRouting({ searchProvider: 'auto' });
            }} />{t('research.allow_provider')}</label>}>
          <Field><FieldLabel htmlFor={`research-key-${provider.name}`}>{t('research.api_key')}</FieldLabel>
            <Input id={`research-key-${provider.name}`} type="password" autoComplete="off" spellCheck={false}
              value={keys[provider.name] || ''} placeholder={t(provider.configured ? 'research.key_replace' : 'research.key_empty')}
              onChange={(event) => { setMessage(''); setKeys((previous) => {
                const next = { ...previous }; const value = event.target.value;
                if (value) next[provider.name] = value; else delete next[provider.name]; return next;
              }); }} />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>{t(provider.configured ? 'research.key_configured' : 'research.key_missing')}</p>
            {provider.configured && <label className="flex min-h-9 items-center gap-2"><Checkbox checked={keys[provider.name] === null} onCheckedChange={(checked) => {
              setMessage(''); setKeys((previous) => { const next = { ...previous }; if (checked) next[provider.name] = null; else delete next[provider.name]; return next; });
              if (checked) { updatePolicy({ enabledProviders: policy.enabledProviders.filter((name) => name !== provider.name) }); if (routing.searchProvider === provider.name) updateRouting({ searchProvider: 'auto' }); }
            }} />{t('research.remove_key')}</label>}
          </div>
        </SettingsRow>)}
      </SettingsGroup>
      <SettingsGroup title={t('research.routing_title')} description={t('research.routing_hint')}>
        <SettingsRow title={t('research.preferred_search')} htmlFor="research-provider">
          <Select value={routing.searchProvider} onValueChange={(value) => value && updateRouting({ searchProvider: value as ResearchRouting['searchProvider'] })}>
            <SelectTrigger id="research-provider" className="w-full"><SelectValue>{t(`research.providers.${routing.searchProvider}`)}</SelectValue></SelectTrigger>
            <SelectContent>{['auto', 'free', ...policy.enabledProviders].map((name) => <SelectItem key={name} value={name}>{t(`research.providers.${name}`)}</SelectItem>)}</SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow title={t('research.preferred_read')} htmlFor="research-read-source">
          <Select value={routing.webSource} onValueChange={(value) => value && updateRouting({ webSource: value as ResearchRouting['webSource'] })}>
            <SelectTrigger id="research-read-source" className="w-full"><SelectValue>{t(`research.read_sources.${routing.webSource}`)}</SelectValue></SelectTrigger>
            <SelectContent>{['http', 'browser'].map((name) => <SelectItem key={name} value={name}>{t(`research.read_sources.${name}`)}</SelectItem>)}</SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title={t('research.budget_title')} description={t('research.budget_hint')}>
        <SettingsRow title={t('research.run_limit')} htmlFor="research-run-limit"><Input id="research-run-limit" type="number" min="0" max="100" step="0.01" required value={perRun} onChange={(event) => { setPerRun(event.target.value); setMessage(''); }} /></SettingsRow>
        <SettingsRow title={t('research.month_limit')} htmlFor="research-month-limit"><Input id="research-month-limit" type="number" min="0" max="1000" step="0.01" required value={monthly} onChange={(event) => { setMonthly(event.target.value); setMessage(''); }} /></SettingsRow>
        <SettingsRow title={t('research.spend', { amount: status.usage.spent.toFixed(3) })} description={t('research.rates_date', { date: status.pricingAsOf })} />
      </SettingsGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!dirty || busy}>{t(busy ? 'research.saving' : 'research.save')}</Button>
        <p role={['save_error', 'saved_refresh_error', 'key_required', 'encryption_unavailable'].includes(message) ? 'alert' : 'status'} className="text-sm">{message ? t(`research.${message}`) : dirty ? t('research.unsaved') : ''}</p>
      </div>
    </fieldset>
  </form>;
}
