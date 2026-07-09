import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, CloudDownload, Loader2, CloudCog } from 'lucide-react';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
import { showToast } from '@/lib/store/useToastStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import SettingsPanel from '@/components/settings/SettingsPanel';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeListState from '@/components/ui/DomeListState';

const DOME_GREEN = 'var(--dome-accent)';
const DOME_ORANGE = 'var(--warning)';

const INTERVAL_OPTIONS = [5, 15, 30, 60] as const;

type SyncStatus = {
  connected: boolean;
  localRevision: number;
  currentRevision: number;
  syncSchemaVersion: number;
  error?: string;
};

type SyncSettings = {
  auto_enabled: boolean;
  interval_minutes: number;
};

type DomainSyncState = {
  social: { enabled: boolean; lastPushAt: number };
  pipelines: { enabled: boolean; lastPushAt: number };
  calendar: { enabled: boolean; lastPushAt: number };
};

export default function DomeSyncSettings() {
  const { t } = useTranslation();
  const cloudEntitlements = useCloudEntitlements();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [settings, setSettings] = useState<SyncSettings>({ auto_enabled: false, interval_minutes: 15 });
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [domainSyncing, setDomainSyncing] = useState(false);
  const [domainState, setDomainState] = useState<DomainSyncState | null>(null);

  const autoSyncTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    if (!window.electron?.cloudSync) return;
    const result = await window.electron.cloudSync.getStatus();
    if (result.success) {
      setStatus({
        connected: result.connected ?? false,
        localRevision: result.localRevision ?? 0,
        currentRevision: result.currentRevision ?? 0,
        syncSchemaVersion: result.syncSchemaVersion ?? 1,
      });
    } else {
      setStatus({ connected: false, localRevision: 0, currentRevision: 0, syncSchemaVersion: 1, error: result.error });
    }
  }, []);

  const loadSettings = useCallback(async () => {
    if (!window.electron?.cloudSync) return;
    const result = await window.electron.cloudSync.getSettings();
    if (result.success && result.settings) {
      setSettings(result.settings);
    }
  }, []);

  const loadDomainStatus = useCallback(async () => {
    if (!window.electron?.domainSync?.getStatus) return;
    const result = await window.electron.domainSync.getStatus();
    if (result.success && result.domains) {
      const d = result.domains as Record<string, { enabled: boolean; lastPushAt: number }>;
      setDomainState({
        social: { enabled: d.social?.enabled !== false, lastPushAt: d.social?.lastPushAt ?? 0 },
        pipelines: { enabled: d.pipelines?.enabled !== false, lastPushAt: d.pipelines?.lastPushAt ?? 0 },
        calendar: { enabled: d.calendar?.enabled !== false, lastPushAt: d.calendar?.lastPushAt ?? 0 },
      });
    }
  }, []);

  useEffect(() => {
    Promise.all([loadStatus(), loadSettings(), loadDomainStatus()]).finally(() => setLoading(false));
  }, [loadStatus, loadSettings, loadDomainStatus]);

  // SSE revision watcher
  useEffect(() => {
    if (!window.electron?.cloudSync) return;
    void window.electron.cloudSync.startRevisionWatcher();

    const unsubRevision = window.electron.cloudSync.onRevision(({ revision }) => {
      setStatus((prev) => prev ? { ...prev, currentRevision: revision } : prev);
    });

    const unsubPull = window.electron.cloudSync.onPullDone(({ revision }) => {
      setStatus((prev) => prev ? { ...prev, localRevision: revision, currentRevision: revision } : prev);
    });

    return () => {
      void window.electron.cloudSync.stopRevisionWatcher();
      unsubRevision();
      unsubPull();
    };
  }, []);

  // Auto-sync timer (renderer-side interval, settings stored in SQLite)
  useEffect(() => {
    if (autoSyncTimer.current) clearInterval(autoSyncTimer.current);
    if (!settings.auto_enabled || !status?.connected) return;

    autoSyncTimer.current = setInterval(async () => {
      if (!window.electron?.cloudSync) return;
      await window.electron.cloudSync.push();
      await window.electron.cloudSync.pull();
      void loadStatus();
    }, settings.interval_minutes * 60 * 1000);

    return () => {
      if (autoSyncTimer.current) clearInterval(autoSyncTimer.current);
    };
  }, [settings.auto_enabled, settings.interval_minutes, status?.connected, loadStatus]);

  const saveSettings = async (patch: Partial<SyncSettings>) => {
    if (!window.electron?.cloudSync) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await window.electron.cloudSync.setSettings(patch);
  };

  const handleConnect = async () => {
    if (!window.electron?.domeAuth) return;
    setConnectingOAuth(true);
    try {
      const result = await window.electron.domeAuth.startOAuthFlow();
      if (result.success) {
        showToast('success', 'Conectado a Dome Pro');
        void loadStatus();
      } else {
        showToast('error', result.error ?? 'Error al conectar');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleSyncNow = async () => {
    if (!window.electron?.cloudSync) return;
    setSyncing(true);
    try {
      const pushResult = await window.electron.cloudSync.push();
      if (!pushResult.success) throw new Error(pushResult.error ?? 'Push fallido');
      const pullResult = await window.electron.cloudSync.pull();
      if (!pullResult.success) throw new Error(pullResult.error ?? 'Pull fallido');
      showToast('success', `Sincronizado — revisión ${pullResult.revision ?? pushResult.newRevision}`);
      void loadStatus();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Error de sincronización');
    } finally {
      setSyncing(false);
    }
  };

  const handleForcePull = async () => {
    if (!window.electron?.cloudSync) return;
    setPulling(true);
    try {
      const result = await window.electron.cloudSync.pull();
      if (!result.success) throw new Error(result.error ?? 'Pull fallido');
      showToast('success', `Datos descargados — revisión ${result.revision}`);
      void loadStatus();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Error al descargar');
    } finally {
      setPulling(false);
    }
  };

  if (!cloudEntitlements.loading && !cloudEntitlements.showCloudUi) {
    return null;
  }

  const toggleDomain = async (domain: 'social' | 'pipelines' | 'calendar', enabled: boolean) => {
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

  const hasPendingPull = status ? status.currentRevision > status.localRevision : false;

  return (
    <SettingsPanel>
      <DomeSubpageHeader className={"!border-0 p-0 bg-transparent"}>
  <DomeSubpageHeader.Title>{"Dome Sync"}</DomeSubpageHeader.Title>
  <DomeSubpageHeader.Subtitle>{"Sincroniza tu biblioteca entre dispositivos con tu suscripción Dome Pro."}</DomeSubpageHeader.Subtitle>
</DomeSubpageHeader>

      {loading ? (
        <DomeListState variant="loading" loadingLabel="Comprobando estado de sincronización…" compact />
      ) : !status?.connected ? (
        /* ── No conectado ── */
        <div className="space-y-4">
          {status?.error === 'cloud_sync_not_in_plan' ? (
            <DomeCard className="flex items-start gap-3 !bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]">
              <span className="mt-0.5 shrink-0">⚠</span>
              <div>
                <p className="text-sm font-medium text-[var(--dome-text)]">Requiere Dome Pro</p>
                <p className="text-xs text-[var(--dome-text-muted)] mt-0.5">
                  La sincronización en la nube está disponible con una suscripción activa Dome Pro.{' '}
                  <button
                    type="button"
                    className="underline text-[var(--dome-accent)]"
                    onClick={() => void window.electron?.domeAuth?.openDashboard?.()}
                  >
                    Ver planes
                  </button>
                </p>
              </div>
            </DomeCard>
          ) : (
            <DomeCard className="flex items-start gap-3">
              <CloudCog className="size-4 mt-0.5 shrink-0 text-[var(--dome-text-muted)]" />
              <div>
                <p className="text-sm font-medium text-[var(--dome-text)]">No conectado</p>
                <p className="text-xs text-[var(--dome-text-muted)] mt-0.5">
                  Inicia sesión con tu cuenta Dome Pro para activar la sincronización.
                </p>
              </div>
            </DomeCard>
          )}

          <DomeButton
            type="button"
            variant="outline"
            size="md"
            onClick={() => void handleConnect()}
            disabled={connectingOAuth}
            className="w-full !justify-start !h-auto py-3 px-4"
            leftIcon={
              connectingOAuth
                ? <Loader2 className="size-4 animate-spin" style={{ color: DOME_GREEN }} />
                : <CloudCog className="size-4" style={{ color: DOME_GREEN }} />
            }
          >
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium text-[var(--dome-text)]">
                {connectingOAuth ? 'Conectando…' : 'Iniciar sesión en Dome Pro'}
              </p>
              <p className="text-xs text-[var(--dome-text-muted)]">Autoriza vía OAuth PKCE</p>
            </div>
          </DomeButton>
        </div>
      ) : (
        /* ── Conectado ── */
        <div className="space-y-6">
          {/* Estado */}
          <div>
            <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
              Estado
            </DomeSectionLabel>
            <DomeCard>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[var(--dome-text)]">Conexión</span>
                <DomeBadge label="Activa" dot color={DOME_GREEN} size="xs" />
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--dome-text-muted)]">Revisión local</span>
                <span className="text-xs font-mono text-[var(--dome-text)]">{status.localRevision}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--dome-text-muted)]">Revisión servidor</span>
                <span className="text-xs font-mono text-[var(--dome-text)]">{status.currentRevision}</span>
              </div>
              {hasPendingPull && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2">
                  <DomeBadge
                    label={`${status.currentRevision - status.localRevision} cambios pendientes`}
                    color={DOME_ORANGE}
                    dot
                    size="xs"
                  />
                </div>
              )}
            </DomeCard>
          </div>

          {/* Acciones manuales */}
          <div>
            <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
              Acciones
            </DomeSectionLabel>
            <div className="flex gap-2">
              <DomeButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleSyncNow()}
                disabled={syncing || pulling}
                leftIcon={syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              >
                {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
              </DomeButton>
              <DomeButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleForcePull()}
                disabled={syncing || pulling}
                leftIcon={pulling ? <Loader2 className="size-3.5 animate-spin" /> : <CloudDownload className="size-3.5" />}
              >
                {pulling ? 'Descargando…' : 'Forzar descarga'}
              </DomeButton>
            </div>
          </div>

          {/* Auto-sync */}
          <div>
            <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
              Sincronización automática
            </DomeSectionLabel>
            <DomeCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--dome-text)]">Activar auto-sync</p>
                  <p className="text-xs text-[var(--dome-text-muted)] mt-0.5">
                    Sincroniza en segundo plano mientras Dome está abierto.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Activar auto-sync"
                  aria-checked={settings.auto_enabled}
                  onClick={() => void saveSettings({ auto_enabled: !settings.auto_enabled })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                    settings.auto_enabled ? 'bg-[var(--dome-accent)]' : 'bg-[var(--dome-text-muted)]'
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      settings.auto_enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.auto_enabled && (
                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                  <p className="text-xs text-[var(--dome-text-muted)] mb-2">Intervalo</p>
                  <div className="flex gap-2 flex-wrap">
                    {INTERVAL_OPTIONS.map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => void saveSettings({ interval_minutes: min })}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          settings.interval_minutes === min
                            ? 'bg-[var(--dome-accent)] text-white'
                            : 'bg-[var(--dome-bg-hover)] text-[var(--dome-text-muted)] hover:text-[var(--dome-text)]'
                        }`}
                      >
                        {min} min
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </DomeCard>
          </div>

          {(cloudEntitlements.hasSocialCloud || cloudEntitlements.hasPipelinesCloud || cloudEntitlements.hasCloudSync) && domainState && (
            <div className="space-y-3">
              <DomeSectionLabel>{t('settings.domain_sync.title')}</DomeSectionLabel>
              <DomeCard className="space-y-3">
                <p className="text-xs text-[var(--dome-text-muted)]">{t('settings.domain_sync.description')}</p>
                {cloudEntitlements.hasSocialCloud && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>{t('settings.domain_sync.social')}</span>
                    <input
                      type="checkbox"
                      checked={domainState.social.enabled}
                      onChange={(e) => void toggleDomain('social', e.target.checked)}
                    />
                  </label>
                )}
                {cloudEntitlements.hasPipelinesCloud && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>{t('settings.domain_sync.pipelines')}</span>
                    <input
                      type="checkbox"
                      checked={domainState.pipelines.enabled}
                      onChange={(e) => void toggleDomain('pipelines', e.target.checked)}
                    />
                  </label>
                )}
                {cloudEntitlements.hasCloudSync && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>{t('settings.domain_sync.calendar')}</span>
                    <input
                      type="checkbox"
                      checked={domainState.calendar.enabled}
                      onChange={(e) => void toggleDomain('calendar', e.target.checked)}
                    />
                  </label>
                )}
                <DomeButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={domainSyncing}
                  onClick={() => void syncDomainsNow()}
                  leftIcon={domainSyncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                >
                  {t('settings.domain_sync.sync_now')}
                </DomeButton>
              </DomeCard>
            </div>
          )}

          {/* Desconectar */}
          <div>
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              className="text-[var(--dome-text-muted)] hover:text-[var(--destructive)]"
              onClick={async () => {
                const result = await window.electron?.domeAuth?.disconnect?.();
                if (result?.success) {
                  showToast('success', 'Desconectado de Dome Pro');
                  void loadStatus();
                }
              }}
            >
              Desconectar cuenta
            </DomeButton>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}
