import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CloudCogIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { FeatureAccessNotice } from '@/components/account/FeatureAccessNotice';
import { useCloudEntitlements, type CloudFeature } from '@/lib/hooks/useCloudEntitlements';

type DomainState = { enabled: boolean; lastPushAt: number; lastError?: string | null };
const DOMAIN_ROWS: Array<{ domain: string; labelKey: string; feature: CloudFeature }> = [
  { domain: 'library', labelKey: 'settings.domain_sync.library', feature: 'cloud_sync' },
  { domain: 'files', labelKey: 'settings.domain_sync.files', feature: 'cloud_sync' },
  { domain: 'conversations', labelKey: 'settings.domain_sync.conversations', feature: 'cloud_sync' },
  { domain: 'agents', labelKey: 'settings.domain_sync.agents', feature: 'cloud_sync' },
  { domain: 'learn', labelKey: 'settings.domain_sync.learn', feature: 'cloud_sync' },
  { domain: 'settings', labelKey: 'settings.domain_sync.settings_domain', feature: 'cloud_sync' },
  { domain: 'social', labelKey: 'settings.domain_sync.social', feature: 'social_cloud' },
  { domain: 'pipelines', labelKey: 'settings.domain_sync.pipelines', feature: 'pipelines_cloud' },
  { domain: 'calendar', labelKey: 'settings.domain_sync.calendar', feature: 'cloud_sync' },
];
type SyncProgress = { phase: string; domain?: string } | null;

export default function DomeSyncSection() {
  const { t } = useTranslation();
  const access = useCloudEntitlements();
  const [domains, setDomains] = useState<Record<string, DomainState>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>(null);
  const load = useCallback(async () => {
    const result = await window.electron.domainSync.getStatus();
    if (!result.success) throw new Error('status_failed');
    setDomains((result.domains ?? {}) as Record<string, DomainState>);
  }, []);
  useEffect(() => {
    if (!access.showCloudUi) return;
    setLoading(true); setError(false);
    load().catch(() => setError(true)).finally(() => setLoading(false));
    const unsub = window.electron.domainSync.onProgress?.((data: SyncProgress) => {
      setProgress(data?.phase === 'done' ? null : data);
      if (data?.phase === 'done') load().catch(() => setError(true));
    });
    return () => unsub?.();
  }, [access.showCloudUi, load]);
  async function run(action: () => Promise<{ success?: boolean }>) {
    setBusy(true); setError(false);
    try {
      const result = await action();
      if (!result.success) throw new Error('sync_failed');
      await load();
    } catch { setError(true); } finally { setBusy(false); }
  }
  const rows = DOMAIN_ROWS.filter((row) => access.features.includes(row.feature));
  const lastSync = Math.max(0, ...Object.values(domains).map((domain) => domain.lastPushAt ?? 0));
  return <SettingsSurface icon={CloudCogIcon} title="Dome Sync" description={t('settings.domain_sync.subtitle')}>
    {!access.showCloudUi ? <FeatureAccessNotice feature="cloud_sync" /> : <>
      {error && <Alert variant="destructive"><AlertDescription>{t('settings.domain_sync.sync_error')}<Button variant="outline" size="sm" disabled={busy} onClick={() => { void run(async () => { await load(); return { success: true }; }); }}>{t('access.retry')}</Button></AlertDescription></Alert>}
      {loading ? <div role="status" className="flex items-center gap-2"><Spinner />{t('common.loading')}</div> : <>
        {progress && <p role="status" className="flex items-center gap-2 text-sm"><Spinner />{t('settings.domain_sync.first_sync', { domain: progress.domain ?? '' })}</p>}
        <SettingsGroup title={t('settings.domain_sync.connection')}>
          <SettingsRow title={t('settings.domain_sync.last_sync')} control={<span className="text-xs tabular-nums">{lastSync ? new Date(lastSync).toLocaleString() : '—'}</span>} />
        </SettingsGroup>
        <SettingsGroup title={t('settings.domain_sync.title')} description={t('settings.domain_sync.description')} actions={
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { void run(() => window.electron.domainSync.syncNow({})); }}><HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />{t('settings.domain_sync.sync_now')}</Button>
        }>
          {rows.map(({ domain, labelKey }) => <SettingsRow key={domain} title={t(labelKey)} description={domains[domain]?.lastError || undefined} control={
            <Switch checked={domains[domain]?.enabled !== false} disabled={busy} aria-label={t(labelKey)} onCheckedChange={(enabled) => { void run(() => window.electron.domainSync.setDomainEnabled({ domain, enabled })); }} />
          } />)}
        </SettingsGroup>
      </>}
    </>}
  </SettingsSurface>;
}
