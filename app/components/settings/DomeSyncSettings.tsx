import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, CloudDownload, Loader2, CloudCog } from 'lucide-react';
import { showToast } from '@/lib/store/useToastStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeListState from '@/components/ui/DomeListState';

const DOME_GREEN = 'var(--dome-accent)';
const DOME_ORANGE = 'var(--warning, #f97316)';

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

export default function DomeSyncSettings() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [settings, setSettings] = useState<SyncSettings>({ auto_enabled: false, interval_minutes: 15 });
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);

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

  useEffect(() => {
    Promise.all([loadStatus(), loadSettings()]).finally(() => setLoading(false));
  }, [loadStatus, loadSettings]);

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

  const hasPendingPull = status ? status.currentRevision > status.localRevision : false;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 p-0 bg-transparent"
        title="Dome Sync"
        subtitle="Sincroniza tu biblioteca entre dispositivos con tu suscripción Dome Pro."
      />

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
    </div>
  );
}
