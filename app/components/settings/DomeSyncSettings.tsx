import { HugeiconsIcon } from '@hugeicons/react';
import {
  RefreshIcon as RefreshCw,
  Loading03Icon as Loader2,
  CloudCogIcon as CloudCog,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
import { useDomeSession } from '@/lib/hooks/useDomeSession';
import { showToast } from '@/lib/store/useToastStore';
import SubpageHeader from '@/components/shared/SubpageHeader';
import SettingsPanel from '@/components/settings/SettingsPanel';
import ListState from '@/components/shared/ListState';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

type DomainState = { enabled: boolean; lastPushAt: number };

/** Domains shown in settings, in restore order. Feature gates which appear. */
const DOMAIN_ROWS: Array<{ domain: string; labelKey: string; feature: 'cloud_sync' | 'social_cloud' | 'pipelines_cloud' }> = [
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

export default function DomeSyncSettings() {
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
    <SettingsPanel>
      <SubpageHeader className={"!border-0 p-0 bg-transparent"}>
        <SubpageHeader.Title>{"Dome Sync"}</SubpageHeader.Title>
        <SubpageHeader.Subtitle>{t('settings.domain_sync.subtitle')}</SubpageHeader.Subtitle>
      </SubpageHeader>

      {loading || session.loading ? (
        <ListState variant="loading" loadingLabel="Comprobando estado de sincronización…" compact />
      ) : !session.connected ? (
        /* ── No conectado ── */
        <div className="flex flex-col gap-4">
          <Card className="p-4 flex items-start gap-3">
            <HugeiconsIcon icon={CloudCog} className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">{t('settings.domain_sync.not_connected')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inicia sesión con tu cuenta Dome para activar la sincronización.
              </p>
            </div>
          </Card>

          <Button type="button"
  variant="outline"
  onClick={() => void handleConnect()}
  disabled={connectingOAuth}
  className="w-full !justify-start !h-auto py-3 px-4">{
              connectingOAuth
                ? <HugeiconsIcon icon={Loader2} className="animate-spin text-primary" />
                : <HugeiconsIcon icon={CloudCog} className="text-primary" />
            }
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium text-foreground">
                {connectingOAuth ? 'Conectando…' : 'Iniciar sesión en Dome'}
              </p>
              <p className="text-xs text-muted-foreground">{t('settings.domain_sync.oauth_pkce')}</p>
            </div>
          </Button>
        </div>
      ) : (
        /* ── Conectado ── */
        <div className="flex flex-col gap-6">
          {/* Primera sincronización en curso */}
          {progress && (
            <Card className="p-4 flex items-center gap-3">
              <HugeiconsIcon icon={Loader2} className="shrink-0 animate-spin text-primary" />
              <p className="text-sm text-foreground">
                {progress.phase === 'files'
                  ? t('settings.domain_sync.first_sync_files')
                  : t('settings.domain_sync.first_sync', { domain: progress.domain ?? '…' })}
              </p>
            </Card>
          )}

          {/* Estado */}
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
              Estado
            </p>
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">{t('settings.domain_sync.connection')}</span>
                <Badge variant="secondary" className="max-w-full text-primary"><span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><span className="truncate">{t('settings.domain_sync.active')}</span></Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('settings.domain_sync.last_sync')}</span>
                <span className="text-xs font-mono text-foreground">
                  {lastSyncAt > 0 ? new Date(lastSyncAt).toLocaleString() : '—'}
                </span>
              </div>
            </Card>
          </div>

          {/* Dominios */}
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('settings.domain_sync.title')}</p>
            <Card className="p-4 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">{t('settings.domain_sync.description')}</p>
              {visibleRows.map(({ domain, labelKey }) => (
                <label key={domain} className="flex items-center justify-between gap-3 text-sm">
                  <span>{t(labelKey)}</span>
                  <Checkbox
                    checked={domainState[domain]?.enabled !== false}
                    onCheckedChange={(checked) => void toggleDomain(domain, checked)}
                  />
                </label>
              ))}
              <Button type="button"
  variant="outline"
  disabled={domainSyncing}
  onClick={() => void syncDomainsNow()}
  size="sm">{domainSyncing ? <HugeiconsIcon icon={Loader2} className="size-4 animate-spin" /> : <HugeiconsIcon icon={RefreshCw} className="size-4" />}
                {t('settings.domain_sync.sync_now')}
              </Button>
            </Card>
          </div>

          {/* Desconectar */}
          <div>
            <Button type="button"
  variant="ghost"
  className="text-muted-foreground hover:text-destructive"
  onClick={async () => {
                const result = await window.electron?.domeAuth?.disconnect?.();
                if (result?.success) {
                  showToast('success', t('settings.domain_sync.disconnected_from_dome'));
                  void session.refresh();
                }
              }}
  size="sm">
              Desconectar cuenta
            </Button>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}
