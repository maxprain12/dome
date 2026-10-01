import { Checkbox } from '@/components/ui/checkbox';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { db } from '@/lib/db/client';

interface ResearchStatus {
  success: boolean;
  channels: Array<{ platform: string; accessStatus: string; technicalStatus: string }>;
  policy: { enabledProviders: string[]; perRunUsd: number; monthlyUsd: number };
  usage: { spent: number };
}
export default function ResearchSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [perRun, setPerRun] = useState('0.25');
  const [monthly, setMonthly] = useState('10');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const refresh = async () => {
    const result = await window.electron.invoke('research:status') as ResearchStatus;
    if (!result.success) throw new Error('unavailable');
    setStatus(result); setProviders(result.policy.enabledProviders);
    setPerRun(String(result.policy.perRunUsd)); setMonthly(String(result.policy.monthlyUsd));
  };
  useEffect(() => { void refresh().catch(() => setMessage('error')); }, []);
  const save = async () => {
    try {
      const result = await window.electron.invoke('research:policy', { enabledProviders: providers,
        perRunUsd: Number(perRun), monthlyUsd: Number(monthly) });
      if (!result.success) throw new Error('invalid_policy');
      if (key) { const saved = await db.setSetting('web_search_exa_api_key', key); if (!saved.success) throw new Error('key_save_failed'); setKey(''); }
      await refresh(); setMessage('saved');
    } catch { setMessage('error'); }
  };
  return <section className="rounded-lg border p-4 flex flex-col gap-4" aria-label={t('settings.ai.research.title')}>
    <h3 className="font-medium">{t('settings.ai.research.title')}</h3>
    <p className="text-sm text-muted-foreground">{t('settings.ai.research.hint')}</p>
    <p className="text-sm text-muted-foreground">{t('settings.ai.research.rates')}</p>
    <Field><FieldLabel htmlFor="research-exa-key">{t('settings.ai.research.exa_key')}</FieldLabel>
      <Input id="research-exa-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} /></Field>
    <div className="flex gap-4">{['brave','tavily','exa'].map((provider) => <label key={provider} className="text-sm flex gap-2 items-center">
      <Checkbox checked={providers.includes(provider)} onCheckedChange={(checked) => setProviders(checked ? [...providers, provider] : providers.filter((value) => value !== provider))} />
      {t('settings.ai.research.enable', { provider })}
    </label>)}</div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field><FieldLabel htmlFor="research-run-limit">{t('settings.ai.research.run_limit')}</FieldLabel><Input id="research-run-limit" type="number" min="0" max="100" step="0.01" value={perRun} onChange={(event) => setPerRun(event.target.value)} /></Field>
      <Field><FieldLabel htmlFor="research-month-limit">{t('settings.ai.research.month_limit')}</FieldLabel><Input id="research-month-limit" type="number" min="0" max="1000" step="0.01" value={monthly} onChange={(event) => setMonthly(event.target.value)} /></Field>
    </div>
    <p className="text-sm">{t('settings.ai.research.spend', { amount: status?.usage.spent.toFixed(3) || '0.000' })}</p>
    <details><summary>{t('settings.ai.research.sources')}</summary><ul className="text-sm flex flex-col gap-1 mt-2">{status?.channels.map((item) => <li key={item.platform}>
      {item.platform} · {t(`settings.ai.research.${item.accessStatus}`)} · {t(`settings.ai.research.${item.technicalStatus}`)}
    </li>)}</ul></details>
    <Button onClick={() => { void save(); }}>{t('settings.ai.save_config')}</Button>
    {message && <p role="status">{t(`settings.ai.research.${message}`)}</p>}
  </section>;
}
