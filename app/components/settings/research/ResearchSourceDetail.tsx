import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsUiStore } from '@/lib/store/useSettingsUiStore';
import { openDomeHref } from '@/lib/links/openDomeHref';
import type { SettingsSection } from '../registry';
import type { ProbeResult, ResearchChannel, ResearchStatus } from './types';

interface Draft { url: string; text: string; title: string; operation: string }
const EMPTY: Draft = { url: '', text: '', title: '', operation: '' };
interface Props { channel: ResearchChannel; status: ResearchStatus; onRefresh: () => Promise<void>; onBusy: (busy: boolean) => void; externallyBusy: boolean }
export default function ResearchSourceDetail({ channel, status, onRefresh, onBusy, externallyBusy }: Props) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [results, setResults] = useState<Record<string, ProbeResult>>({});
  const [busy, setBusy] = useState(false);
  const locked = busy || externallyBusy;
  const [notice, setNotice] = useState('');
  const pending = useRef<string | null>(null);
  useEffect(() => () => {
    if (pending.current) window.electron.invoke('research:cancel', { id: pending.current }).catch(() => {});
  }, []);
  const draft = drafts[channel.platform] || EMPTY;
  const operation = channel.operations.includes(draft.operation) ? draft.operation : channel.operations[0];
  const result = results[channel.platform];
  const change = (patch: Partial<Draft>) => { setDrafts((previous) => ({ ...previous, [channel.platform]: { ...(previous[channel.platform] || EMPTY), ...patch } })); setNotice(''); };
  const lock = (value: boolean) => { setBusy(value); onBusy(value); };
  const toggle = async (enabled: boolean) => {
    lock(true); setNotice('');
    try {
      const disabledPlatforms = enabled ? status.routing.disabledPlatforms.filter((name) => name !== channel.platform) : [...new Set([...status.routing.disabledPlatforms, channel.platform])];
      const response = await window.electron.invoke('research:configure', { policy: status.policy, routing: { ...status.routing, disabledPlatforms }, keys: {} });
      if (!response.success) throw new Error('save');
      try { await onRefresh(); setNotice('saved'); } catch { setNotice('saved_refresh_error'); }
    } catch { setNotice('save_error'); } finally { lock(false); }
  };
  const test = async (event: React.FormEvent) => {
    event.preventDefault(); const id = crypto.randomUUID(); pending.current = id;
    lock(true); setNotice('');
    try {
      const response = await window.electron.invoke('research:test', { requestId: id, name: `research_${operation}`,
        input: { platform: channel.platform, ...(operation === 'search' ? { query: draft.url } : { url: draft.url }),
          ...(channel.platform === 'web' ? { source: status.routing.webSource } : {}) } }) as unknown as ProbeResult;
      setResults((previous) => ({ ...previous, [channel.platform]: response }));
      try { await onRefresh(); } catch { setNotice('load_error'); }
    } catch { setResults((previous) => ({ ...previous, [channel.platform]: { success: false, error: 'probe_failed' } })); }
    finally { pending.current = null; lock(false); }
  };
  const importText = async (event: React.FormEvent) => {
    event.preventDefault(); lock(true); setNotice('');
    try {
      const response = await window.electron.invoke('research:import', { platform: channel.platform, url: draft.url, title: draft.title, text: draft.text }) as unknown as ProbeResult;
      if (!response.success) throw new Error('import');
      setResults((previous) => ({ ...previous, [channel.platform]: response })); change({ text: '' }); setNotice('imported');
    } catch { setNotice('import_error'); } finally { lock(false); }
  };
  return <section id="research-source-detail" aria-label={t('research.source_detail')} className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{t(`research.platforms.${channel.platform}`)}</h2>
      <Badge variant="secondary">{t(`research.states.${channel.readiness}`)}</Badge>
    </div>
    <p className="text-sm leading-relaxed text-muted-foreground">{t(`research.descriptions.${channel.platform}`)}</p>
    <label className="flex min-h-9 items-center gap-2 text-sm"><Checkbox disabled={locked} checked={channel.accessStatus !== 'disabled'} onCheckedChange={(checked) => { toggle(Boolean(checked)).catch(() => {}); }} />{t('research.allow_source')}</label>
    <p className="text-sm">{t('research.available_operations')} {channel.operations.length ? channel.operations.map((value) => t(`research.operations.${value}`)).join(' · ') : t('research.import_only')}</p>
    <p className="text-sm">{t('research.dome_routes')} {channel.backends.map((value) => t(`research.backends.${value}`)).join(' · ')}</p>
    {channel.accessStatus === 'pending_enablement' && <Alert role="note"><AlertDescription>{t('research.pending_hint')}</AlertDescription></Alert>}
    {channel.setup && channel.setup !== 'research' && <Button variant="outline" disabled={locked} onClick={() => useSettingsUiStore.getState().setActiveSection(channel.setup as SettingsSection)}>{t('research.open_setup', { section: t(`settings.tabs.${channel.setup}`) })}</Button>}
    {channel.operations.length > 0 && <form onSubmit={test} className="flex min-w-0 flex-col gap-3 border-t pt-4">
      <h3 className="text-sm font-semibold">{t('research.test_title')}</h3>
      <p className="text-sm text-muted-foreground">{t('research.test_hint')}</p>
      <Field><FieldLabel htmlFor="research-test-operation">{t('research.operation')}</FieldLabel>
        <Select value={operation} onValueChange={(value) => value && change({ operation: value })} disabled={locked}>
          <SelectTrigger id="research-test-operation" className="w-full"><SelectValue>{t(`research.operations.${operation}`)}</SelectValue></SelectTrigger>
          <SelectContent>{channel.operations.map((value) => <SelectItem key={value} value={value}>{t(`research.operations.${value}`)}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field><FieldLabel htmlFor="research-test-target">{t(operation === 'search' ? 'research.query' : 'research.url')}</FieldLabel>
        <Input id="research-test-target" required disabled={locked} maxLength={operation === 'search' ? 1000 : 4000} type={operation === 'search' ? 'text' : 'url'} value={draft.url} onChange={(event) => change({ url: event.target.value })} /></Field>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={locked || !draft.url.trim()}>{t(busy ? 'research.testing' : 'research.test')}</Button>
        {pending.current && <Button type="button" variant="outline" onClick={() => { window.electron.invoke('research:cancel', { id: pending.current }).catch(() => {}); }}>{t('research.cancel')}</Button>}
      </div>
    </form>}
    {result && <Alert role={result.success ? 'status' : 'alert'} variant={result.success ? 'default' : 'destructive'}><AlertDescription>
      <p>{result.success ? t(result.resourceId ? 'research.imported' : 'research.test_passed', { count: result.evidence?.length || 0 }) : t('research.test_failed')}</p>
      {!result.success && <p className="mt-1 text-sm">{t(`research.errors.${result.error}`, { defaultValue: t('research.probe_failed') })}</p>}
      {result.check && <p className="mt-1 text-sm">{t('research.checked', { operation: t(`research.operations.${result.check.operation}`), date: new Date(result.check.checkedAt).toLocaleString() })}</p>}
      {result.resourceId && <Button className="mt-2" variant="outline" onClick={() => { openDomeHref(`dome://resource/${encodeURIComponent(result.resourceId!)}`).catch(() => {}); }}>{t('research.open_note')}</Button>}
    </AlertDescription></Alert>}
    {result?.evidence?.length ? <details className="min-w-0 border-t pt-4"><summary className="cursor-pointer py-2 text-sm font-medium">{t('research.preview')}</summary>
      <ul className="mt-3 flex flex-col gap-3 text-sm">{result.evidence.map((item) => <li key={item.id} className="min-w-0">
        <a className="break-words underline underline-offset-4" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
        <p className="mt-1 break-words text-muted-foreground">{item.text.slice(0, 600)}</p>
      </li>)}</ul>
    </details> : null}
    <details className="min-w-0 border-t pt-4">
      <summary className="cursor-pointer py-2 text-sm font-medium">{t('research.import_title')}</summary>
      <form onSubmit={importText} className="mt-3 flex min-w-0 flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('research.import_hint')}</p>
        <Field><FieldLabel htmlFor="research-import-url">{t('research.url')}</FieldLabel><Input id="research-import-url" type="url" maxLength={4000} required disabled={locked} value={draft.url} onChange={(event) => change({ url: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="research-import-title">{t('research.note_title')}</FieldLabel><Input id="research-import-title" required maxLength={200} disabled={locked} value={draft.title} onChange={(event) => change({ title: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="research-import-text">{t('research.evidence_text')}</FieldLabel><Textarea id="research-import-text" rows={6} maxLength={20000} required disabled={locked} value={draft.text} onChange={(event) => change({ text: event.target.value })} /></Field>
        <Button type="submit" disabled={locked || !draft.url.trim() || !draft.title.trim() || !draft.text.trim()}>{t('research.import_save')}</Button>
      </form>
    </details>
    <details className="min-w-0 border-t pt-4"><summary className="cursor-pointer py-2 text-sm font-medium">{t('research.upstream_routes')}</summary>
      <p className="mt-2 break-words text-sm text-muted-foreground">{channel.upstream.join(' → ')}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t('research.upstream_hint')}</p>
      <p className="mt-2 text-sm">{t('research.upstream_operations')} {channel.wanted.map((value) => t(`research.operations.${value}`)).join(' · ')}</p>
    </details>
    {notice && <p role={notice.endsWith('error') ? 'alert' : 'status'} className="text-sm">{t(`research.${notice}`)}</p>}
  </section>;
}
