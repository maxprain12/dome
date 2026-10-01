import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsGroup, SettingsSurface } from '../blocks';
import ResearchProviders from '../research/ResearchProviders';
import ResearchSourceDetail from '../research/ResearchSourceDetail';
import type { ResearchStatus } from '../research/types';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export default function ResearchSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('web');
  const [copied, setCopied] = useState(false);
  const openProviders = () => {
    const panel = document.getElementById('research-provider-settings') as HTMLDetailsElement | null;
    if (panel) { panel.open = true; panel.scrollIntoView({ block: 'start' }); }
  };
  const refresh = useCallback(async () => {
    const result = await window.electron.invoke('research:status') as unknown as ResearchStatus;
    if (!result.success) throw new Error('status');
    setStatus(result); setError('');
  }, []);
  useEffect(() => { refresh().catch(() => setError('load_error')); }, [refresh]);
  const report = async () => {
    try {
      const result = await window.electron.invoke('research:report');
      if (!result.success) throw new Error('report');
      await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2)); setCopied(true);
    } catch { setError('report_error'); }
  };
  const channel = status?.channels.find((item) => item.platform === platform);
  const filtered = status?.channels.filter((item) => normalize([t(`research.platforms.${item.platform}`), t(`research.groups.${item.group}`), ...item.upstream].join(' ')).includes(normalize(query))) || [];
  return <SettingsSurface section="research" icon={Search01Icon} title={t('settings.tabs.research')} description={t('settingsGuide.sections.research.description')}
    actions={<><Button variant="outline" disabled={!status || busy} onClick={openProviders}>{t('research.configure_providers')}</Button>
      <Button variant="outline" disabled={busy} onClick={() => { refresh().catch(() => setError('load_error')); }}>{t('research.doctor')}</Button>
      <Button variant="outline" disabled={!status || busy} onClick={() => { report().catch(() => setError('report_error')); }}>{t(copied ? 'research.report_copied' : 'research.copy_report')}</Button></>}>
    {error && <Alert variant="destructive"><AlertDescription>{t(`research.${error}`)}</AlertDescription></Alert>}
    {!status && !error && <p role="status">{t('research.loading')}</p>}
    {status && <>
      <p className="text-sm text-muted-foreground">{t('research.doctor_hint')}</p>
      <SettingsGroup title={t('research.sources_title')} bare>
        <Input aria-label={t('research.search_sources')} placeholder={t('research.search_sources')} value={query} disabled={busy} onChange={(event) => setQuery(event.target.value)} />
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
          <div className="lg:hidden">
            <Select value={platform} onValueChange={(value) => value && setPlatform(value)} disabled={busy}>
              <SelectTrigger aria-label={t('research.source_detail')} className="w-full"><SelectValue>{t(`research.platforms.${platform}`)}</SelectValue></SelectTrigger>
              <SelectContent>{filtered.map((item) => <SelectItem key={item.platform} value={item.platform}>{t(`research.platforms.${item.platform}`)} · {t(`research.states.${item.readiness}`)}</SelectItem>)}</SelectContent>
            </Select>
            {!filtered.length && <p role="status" className="mt-2 text-sm text-muted-foreground">{t('research.no_sources')}</p>}
          </div>
          <nav aria-label={t('research.sources_title')} className="hidden min-w-0 gap-2 lg:grid lg:max-h-[34rem] lg:grid-cols-1 lg:overflow-y-auto">
            {filtered.map((item) => <Button variant={platform === item.platform ? 'secondary' : 'outline'} key={item.platform}
              disabled={busy} aria-pressed={platform === item.platform} aria-controls="research-source-detail" onClick={() => setPlatform(item.platform)}
              className="h-auto min-h-12 min-w-0 flex-col items-start gap-2 whitespace-normal p-3 text-left">
              <span className="text-sm font-medium">{t(`research.platforms.${item.platform}`)}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
                {t(`research.groups.${item.group}`)}<Badge variant="secondary" className="whitespace-normal">{t(`research.states.${item.readiness}`)}</Badge>
              </span>
            </Button>)}
            {!filtered.length && <p role="status" className="text-sm text-muted-foreground">{t('research.no_sources')}</p>}
          </nav>
          {channel && <ResearchSourceDetail channel={channel} status={status} onRefresh={refresh} onBusy={setBusy} externallyBusy={busy} />}
        </div>
      </SettingsGroup>
      <details id="research-provider-settings" className="min-w-0 rounded-xl border p-5"><summary className="cursor-pointer py-2 text-base font-semibold">{t('research.configuration_title')}</summary>
        <fieldset disabled={busy} className="mt-5 min-w-0 border-0 p-0"><ResearchProviders status={status} onSaved={refresh} onBusy={setBusy} /></fieldset>
      </details>
      <SettingsGroup title={t('research.integration_title')} description={t('research.integration_hint')} bare>
        <p className="text-sm text-muted-foreground">{t('research.version', { commit: status.upstream.commit.slice(0, 7) })}</p>
        <a className="text-sm underline underline-offset-4" href={`${status.upstream.repository}/tree/${status.upstream.commit}`} target="_blank" rel="noreferrer">{t('research.upstream_source')}</a>
      </SettingsGroup>
    </>}
  </SettingsSurface>;
}
