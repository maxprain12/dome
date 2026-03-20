
import { useState, useEffect, useCallback } from 'react';
import { Cloud, HardDrive, Trash2, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { showToast } from '@/lib/store/useToastStore';

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

interface CloudAccount {
  provider: 'google' | 'onedrive';
  accountId: string;
  email: string;
  connected: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google Drive',
  onedrive: 'OneDrive',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

export default function CloudStorageSettings() {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!window.electron?.cloud) return;
    setLoading(true);
    try {
      const result = await window.electron.cloud.getAccounts();
      if (result.success) setAccounts(result.accounts ?? []);
    } catch (err) {
      console.error('[CloudStorage] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();

    const cleanup = window.electron?.cloud?.onAuthResult?.((data: { success: boolean; provider: string; email?: string; error?: string }) => {
      if (data.success) {
        showToast('success', `${PROVIDER_LABELS[data.provider] ?? data.provider} conectado como ${data.email}`);
        loadAccounts();
      } else {
        showToast('error', data.error || 'Error de conexión');
      }
      setConnecting(null);
    });

    return () => cleanup?.();
  }, [loadAccounts]);

  const handleConnect = async (provider: 'google' | 'onedrive') => {
    if (!window.electron?.cloud) return;
    setConnecting(provider);
    try {
      const result = provider === 'google'
        ? await window.electron.cloud.authGoogle()
        : await window.electron.cloud.authOneDrive();
      if (!result.success) {
        showToast('error', result.error || 'Error al iniciar OAuth');
        setConnecting(null);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Error desconocido');
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!window.electron?.cloud) return;
    try {
      const result = await window.electron.cloud.disconnect(accountId);
      if (result.success) {
        showToast('success', 'Cuenta desconectada');
        setAccounts((prev) => prev.filter((a) => a.accountId !== accountId));
      } else {
        showToast('error', result.error || 'Error al desconectar');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const googleConnected = accounts.some((a) => a.provider === 'google');
  const onedriveConnected = accounts.some((a) => a.provider === 'onedrive');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>Cloud Storage</h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          Conecta Google Drive o OneDrive para explorar e importar archivos directamente en Dome.
        </p>
      </div>

      {/* Setup notice */}
      <SettingsCard className="p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: DOME_GREEN }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
            Para usar almacenamiento en la nube, configura las variables de entorno{' '}
            <code className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--dome-bg-hover)', fontFamily: 'monospace' }}>
              DOME_GOOGLE_DRIVE_CLIENT_ID
            </code>{' '}
            /{' '}
            <code className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--dome-bg-hover)', fontFamily: 'monospace' }}>
              DOME_GOOGLE_DRIVE_CLIENT_SECRET
            </code>{' '}
            para Google Drive, y{' '}
            <code className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--dome-bg-hover)', fontFamily: 'monospace' }}>
              DOME_ONEDRIVE_CLIENT_ID
            </code>{' '}
            para OneDrive. Registra{' '}
            <code className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--dome-bg-hover)', fontFamily: 'monospace' }}>
              dome://oauth/callback
            </code>{' '}
            como redirect URI en tu app OAuth.
          </p>
        </div>
      </SettingsCard>

      {/* Connected accounts */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando cuentas...
        </div>
      ) : accounts.length > 0 && (
        <div>
          <SectionLabel>Cuentas conectadas</SectionLabel>
          <div className="space-y-2">
            {accounts.map((account) => (
              <SettingsCard key={account.accountId} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: DOME_GREEN_LIGHT }}
                    >
                      {account.provider === 'google'
                        ? <Cloud className="w-4 h-4" style={{ color: DOME_GREEN }} />
                        : <HardDrive className="w-4 h-4" style={{ color: DOME_GREEN }} />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                        {PROVIDER_LABELS[account.provider] ?? account.provider}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{account.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: DOME_GREEN }} />
                    <button
                      onClick={() => handleDisconnect(account.accountId)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--dome-text-muted)' }}
                      title="Desconectar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </SettingsCard>
            ))}
          </div>
        </div>
      )}

      {/* Connect buttons */}
      <div>
        <SectionLabel>{accounts.length > 0 ? 'Añadir otra cuenta' : 'Conectar cuenta cloud'}</SectionLabel>
        <div className="space-y-2">
          <button
            onClick={() => handleConnect('google')}
            disabled={connecting === 'google'}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all disabled:opacity-60"
            style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
              {connecting === 'google'
                ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: DOME_GREEN }} />
                : <Cloud className="w-4 h-4" style={{ color: DOME_GREEN }} />
              }
            </div>
            <div>
              <p className="text-sm font-medium">{googleConnected ? 'Conectar otra cuenta de Google Drive' : 'Conectar Google Drive'}</p>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>OAuth 2.0 seguro</p>
            </div>
          </button>

          <button
            onClick={() => handleConnect('onedrive')}
            disabled={connecting === 'onedrive'}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all disabled:opacity-60"
            style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
              {connecting === 'onedrive'
                ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: DOME_GREEN }} />
                : <HardDrive className="w-4 h-4" style={{ color: DOME_GREEN }} />
              }
            </div>
            <div>
              <p className="text-sm font-medium">{onedriveConnected ? 'Conectar otra cuenta de OneDrive' : 'Conectar OneDrive'}</p>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Microsoft OAuth</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
