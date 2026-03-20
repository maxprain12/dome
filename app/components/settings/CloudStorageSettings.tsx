
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        showToast('success', t('settings.cloud.toast_connected', { provider: PROVIDER_LABELS[data.provider] ?? data.provider, email: data.email }));
        loadAccounts();
      } else {
        showToast('error', data.error || t('settings.cloud.toast_error'));
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
        showToast('error', result.error || t('settings.cloud.toast_error'));
        setConnecting(null);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('settings.cloud.toast_error'));
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!window.electron?.cloud) return;
    try {
      const result = await window.electron.cloud.disconnect(accountId);
      if (result.success) {
        showToast('success', t('settings.cloud.toast_disconnected'));
        setAccounts((prev) => prev.filter((a) => a.accountId !== accountId));
      } else {
        showToast('error', result.error || t('settings.cloud.toast_disconnect_error'));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('settings.cloud.toast_disconnect_error'));
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
            {t('settings.cloud.setup_notice')}
          </p>
        </div>
      </SettingsCard>

      {/* Connected accounts */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('settings.cloud.loading_accounts')}
        </div>
      ) : accounts.length > 0 && (
        <div>
          <SectionLabel>{t('settings.cloud.section_connected')}</SectionLabel>
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
                      title={t('settings.cloud.disconnect')}
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
        <SectionLabel>{accounts.length > 0 ? t('settings.cloud.section_add') : t('settings.cloud.section_connect')}</SectionLabel>
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
              <p className="text-sm font-medium">{googleConnected ? t('settings.cloud.connect_google_another') : t('settings.cloud.connect_google')}</p>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.cloud.oauth_google')}</p>
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
              <p className="text-sm font-medium">{onedriveConnected ? t('settings.cloud.connect_onedrive_another') : t('settings.cloud.connect_onedrive')}</p>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.cloud.oauth_microsoft')}</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
