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

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Hide section when cloud UI is off and there is no Dome session — extracted for S3776. */
function shouldHideDomeSyncSection(
  entitlementsLoading: boolean,
  showCloudUi: boolean,
  sessionConnected: boolean,
): boolean {
  if (entitlementsLoading) return false;
  if (showCloudUi) return false;
  return !sessionConnected;
}

/** Latest push timestamp across domains — extracted for S3776. */
function maxLastPushAt(domainState: Record<string, DomainState>): number {
  return Math.max(0, ...Object.values(domainState).map((d) => d?.lastPushAt ?? 0));
}

/** Feature-gated domain rows — extracted for S3776. */
function visibleDomainRows(features: readonly string[]) {
  return DOMAIN_ROWS.filter((row) => features.includes(row.feature));
}

/** OAuth connect flow — extracted for S3776. */
async function connectDomeOAuth(
  t: Translate,
  onConnected: () => void,
): Promise<void> {
  if (!window.electron?.domeAuth) return;
  try {
    const result = await window.electron.domeAuth.startOAuthFlow();
    if (result.success) {
      showToast('success', t('settings.domain_sync.connected_to_dome'));
      onConnected();
      return;
    }
    showToast('error', result.error ?? t('settings.domain_sync.connect_error'));
  } catch (err) {
    showToast('error', err instanceof Error ? err.message : t('common.unknown_error'));
  }
}

/** Manual sync-now — extracted for S3776. */
async function runDomainSyncNow(
  t: Translate,
  onSuccess: () => Promise<void>,
): Promise<void> {
  if (!window.electron?.domainSync?.syncNow) return;
  const res = await window.electron.domainSync.syncNow({});
  if (!res?.success && !res?.skipped) {
    showToast('error', res?.error || t('settings.domain_sync.sync_error'));
    return;
  }
  showToast('success', t('settings.domain_sync.sync_ok'));
  await onSuccess();
}

/** Toggle a single domain — extracted for S3776. */
async function setDomainEnabledFlag(
  domain: string,
  enabled: boolean,
  onSuccess: () => Promise<void>,
): Promise<void> {
  if (!window.electron?.domainSync?.setDomainEnabled) return;
  const res = await window.electron.domainSync.setDomainEnabled({ domain, enabled });
  if (res?.success) await onSuccess();
}

/** Disconnect Dome account — extracted for S3776. */
async function disconnectDomeAccount(
  t: Translate,
  onDisconnected: () => void,
): Promise<void> {
  const result = await window.electron?.domeAuth?.disconnect?.();
  if (result?.success) {
    showToast('success', t('settings.domain_sync.disconnected_from_dome'));
    onDisconnected();
  }
}

function DomeSyncLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/** Not-connected empty state — extracted for S3776. */
function DomeSyncDisconnectedView({
  connectingOAuth,
  onConnect,
}: {
  connectingOAuth: boolean;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  return (
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
        <Button type="button" onClick={onConnect} disabled={connectingOAuth}>
          {connectingOAuth ? <Spinner data-icon="inline-start" /> : null}
          {connectingOAuth ? 'Conectando…' : 'Iniciar sesión en Dome'}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** First-sync progress banner — extracted for S3776. */
function DomeSyncProgressBanner({ progress }: { progress: NonNullable<SyncProgress> }) {
  const { t } = useTranslation();
  const label =
    progress.phase === 'files'
      ? t('settings.domain_sync.first_sync_files')
      : t('settings.domain_sync.first_sync', { domain: progress.domain ?? '…' });
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <Spinner className="shrink-0 text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Connected sync settings — extracted for S3776. */
function DomeSyncConnectedView({
  progress,
  lastSyncAt,
  visibleRows,
  domainState,
  domainSyncing,
  onSyncNow,
  onToggleDomain,
  onDisconnect,
}: {
  progress: SyncProgress;
  lastSyncAt: number;
  visibleRows: typeof DOMAIN_ROWS;
  domainState: Record<string, DomainState>;
  domainSyncing: boolean;
  onSyncNow: () => void;
  onToggleDomain: (domain: string, enabled: boolean) => void;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {progress ? <DomeSyncProgressBanner progress={progress} /> : null}

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
            onClick={onSyncNow}
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
                onCheckedChange={(checked) => onToggleDomain(domain, checked)}
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
          onClick={onDisconnect}
        >
          Desconectar cuenta
        </Button>
      </div>
    </>
  );
}

/** Body switch for loading / disconnected / connected — extracted for S3776. */
function DomeSyncSectionBody({
  loading,
  sessionLoading,
  sessionConnected,
  connectingOAuth,
  progress,
  lastSyncAt,
  visibleRows,
  domainState,
  domainSyncing,
  onConnect,
  onSyncNow,
  onToggleDomain,
  onDisconnect,
}: {
  loading: boolean;
  sessionLoading: boolean;
  sessionConnected: boolean;
  connectingOAuth: boolean;
  progress: SyncProgress;
  lastSyncAt: number;
  visibleRows: typeof DOMAIN_ROWS;
  domainState: Record<string, DomainState>;
  domainSyncing: boolean;
  onConnect: () => void;
  onSyncNow: () => void;
  onToggleDomain: (domain: string, enabled: boolean) => void;
  onDisconnect: () => void;
}) {
  if (loading || sessionLoading) return <DomeSyncLoadingSkeleton />;
  if (!sessionConnected) {
    return (
      <DomeSyncDisconnectedView connectingOAuth={connectingOAuth} onConnect={onConnect} />
    );
  }
  return (
    <DomeSyncConnectedView
      progress={progress}
      lastSyncAt={lastSyncAt}
      visibleRows={visibleRows}
      domainState={domainState}
      domainSyncing={domainSyncing}
      onSyncNow={onSyncNow}
      onToggleDomain={onToggleDomain}
      onDisconnect={onDisconnect}
    />
  );
}

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
    loadDomainStatus().finally(() => setLoading(false));
  }, [loadDomainStatus]);

  useEffect(() => {
    const unsub = window.electron?.domainSync?.onProgress?.((data: SyncProgress) => {
      setProgress(data?.phase === 'done' ? null : data);
      if (data?.phase === 'done') {
        loadDomainStatus().catch(() => {});
      }
    });
    return () => unsub?.();
  }, [loadDomainStatus]);

  if (
    shouldHideDomeSyncSection(
      cloudEntitlements.loading,
      cloudEntitlements.showCloudUi,
      session.connected,
    )
  ) {
    return null;
  }

  const handleConnect = () => {
    setConnectingOAuth(true);
    connectDomeOAuth(t, () => {
      session.refresh();
      loadDomainStatus().catch(() => {});
    })
      .catch(() => {})
      .finally(() => setConnectingOAuth(false));
  };

  const handleSyncNow = () => {
    setDomainSyncing(true);
    runDomainSyncNow(t, loadDomainStatus)
      .catch(() => {})
      .finally(() => setDomainSyncing(false));
  };

  const handleToggleDomain = (domain: string, enabled: boolean) => {
    setDomainEnabledFlag(domain, enabled, loadDomainStatus).catch(() => {});
  };

  const handleDisconnect = () => {
    disconnectDomeAccount(t, () => session.refresh()).catch(() => {});
  };

  return (
    <SettingsSurface
      icon={CloudCogIcon}
      title="Dome Sync"
      description={t('settings.domain_sync.subtitle')}
    >
      <DomeSyncSectionBody
        loading={loading}
        sessionLoading={session.loading}
        sessionConnected={session.connected}
        connectingOAuth={connectingOAuth}
        progress={progress}
        lastSyncAt={maxLastPushAt(domainState)}
        visibleRows={visibleDomainRows(cloudEntitlements.features)}
        domainState={domainState}
        domainSyncing={domainSyncing}
        onConnect={handleConnect}
        onSyncNow={handleSyncNow}
        onToggleDomain={handleToggleDomain}
        onDisconnect={handleDisconnect}
      />
    </SettingsSurface>
  );
}
