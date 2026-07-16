import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CloudCogIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
import { useDomeSession } from '@/lib/hooks/useDomeSession';
import { showToast } from '@/lib/store/useToastStore';

type DomainState = { enabled: boolean; lastPushAt: number };

/** Domains shown in settings, in restore order. Feature gates which appear. */
const DOMAIN_ROWS: Array<{
  domain: string;
  labelKey: string;
  feature: 'cloud_sync' | 'social_cloud' | 'pipelines_cloud';
}> = [
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

type SyncProgress = { phase: string; domain?: string; index?: number; total?: number } | null;

export default function DomeSyncSection() {
  const { t } = useTranslation();
  const cloudEntitlements = useCloudEntitlements();
  const session = useDomeSession();
  const [loading, setLoading] = useState(true);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [domainSyncing, setDomainSyncing] = useState(false);
  const [domainState, setDomainState] = useState<Record<string, DomainState>>({});
  const [progress, setProgress] = useState<SyncProgress>(null);

  const loadDomainStatus = useCallback(async () => {
    if (!window.electron?.domainSync?.getStatus) return;
    const result = await window.electron.domainSync.getStatus();
    if (result.success && result.domains) {
      setDomainState(result.domains as Record<string, DomainState>);
    }
  }, []);

  useEffect(() => {
    void loadDomainStatus().finally(() => setLoading(false));
  }, [loadDomainStatus]);

  useEffect(() => {
    const unsub = window.electron?.domainSync?.onProgress?.((data: SyncProgress) => {
      setProgress(data?.phase === 'done' ? null : data);
      if (data?.phase === 'done') void loadDomainStatus();
    });
    return () => unsub?.();
  }, [loadDomainStatus]);

  const handleConnect = async () => {
    if (!window.electron?.domeAuth) return;
    setConnectingOAuth(true);
    try {
      const result = await window.electron.domeAuth.startOAuthFlow();
      if (result.success) {
        showToast('success', t('settings.domain_sync.connected_to_dome'));
        void session.refresh();
        void loadDomainStatus();
      } else {
        showToast('error', result.error ?? t('settings.domain_sync.connect_error'));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      setConnectingOAuth(false);
    }
  };

  if (!cloudEntitlements.loading && !cloudEntitlements.showCloudUi && !session.connected) {
    return null;
  }

  const featureAvailable = (feature: string) => cloudEntitlements.features.includes(feature);

  const toggleDomain = async (domain: string, enabled: boolean) => {
    if (!window.electron?.domainSync?.setDomainEnabled) return;
    const res = await window.electron.domainSync.setDomainEnabled({ domain, enabled });
    if (res?.success) await loadDomainStatus();
  };

  const syncDomainsNow = async () => {
    if (!window.electron?.domainSync?.syncNow) return;
    setDomainSyncing(true);
    try {
      const res = await window.electron.domainSync.syncNow({});
      if (!res?.success && !res?.skipped) {
        showToast('error', res?.error || t('settings.domain_sync.sync_error'));
      } else {
        showToast('success', t('settings.domain_sync.sync_ok'));
        await loadDomainStatus();
      }
    } finally {
      setDomainSyncing(false);
    }
  };

  const lastSyncAt = Math.max(0, ...Object.values(domainState).map((d) => d?.lastPushAt ?? 0));
  const visibleRows = DOMAIN_ROWS.filter((row) => featureAvailable(row.feature));

  return (
    <SettingsSurface
      icon={CloudCogIcon}
      title="Dome Sync"
      description={t('settings.domain_sync.subtitle')}
    >
      {loading || session.loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !session.connected ? (
        <Empty className="rounded-xl border bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={CloudCogIcon} />
            </EmptyMedia>
            <EmptyTitle>{t('settings.domain_sync.not_connected')}</EmptyTitle>
            <EmptyDescription>
              Inicia sesión con tu cuenta Dome para activar la sincronización.{' '}
              {t('settings.domain_sync.oauth_pkce')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => void handleConnect()} disabled={connectingOAuth}>
              {connectingOAuth ? <Spinner data-icon="inline-start" /> : null}
              {connectingOAuth ? 'Conectando…' : 'Iniciar sesión en Dome'}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {progress ? (
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
              <Spinner className="shrink-0 text-primary" />
              <p className="text-sm">
                {progress.phase === 'files'
                  ? t('settings.domain_sync.first_sync_files')
                  : t('settings.domain_sync.first_sync', { domain: progress.domain ?? '…' })}
              </p>
            </div>
          ) : null}

          <SettingsGroup title={t('settings.domain_sync.connection')}>
            <SettingsRow
              title={t('settings.domain_sync.connection')}
              control={
                <Badge variant="secondary" className="text-primary">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {t('settings.domain_sync.active')}
                </Badge>
              }
            />
            <SettingsRow
              title={t('settings.domain_sync.last_sync')}
              control={
                <span className="font-mono text-xs">
                  {lastSyncAt > 0 ? new Date(lastSyncAt).toLocaleString() : '—'}
                </span>
              }
            />
          </SettingsGroup>

          <SettingsGroup
            title={t('settings.domain_sync.title')}
            description={t('settings.domain_sync.description')}
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={domainSyncing}
                onClick={() => void syncDomainsNow()}
              >
                {domainSyncing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
                )}
                {t('settings.domain_sync.sync_now')}
              </Button>
            }
          >
            {visibleRows.map(({ domain, labelKey }) => (
              <SettingsRow
                key={domain}
                title={t(labelKey)}
                control={
                  <Switch
                    checked={domainState[domain]?.enabled !== false}
                    onCheckedChange={(checked) => void toggleDomain(domain, checked)}
                    aria-label={t(labelKey)}
                  />
                }
              />
            ))}
          </SettingsGroup>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={async () => {
                const result = await window.electron?.domeAuth?.disconnect?.();
                if (result?.success) {
                  showToast('success', t('settings.domain_sync.disconnected_from_dome'));
                  void session.refresh();
                }
              }}
            >
              Desconectar cuenta
            </Button>
          </div>
        </>
      )}
    </SettingsSurface>
  );
}
