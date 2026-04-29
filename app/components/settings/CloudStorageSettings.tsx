
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Trash2, Loader2 } from 'lucide-react';
import { showToast } from '@/lib/store/useToastStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeListState from '@/components/ui/DomeListState';

const DOME_GREEN = 'var(--dome-accent)';
const DOME_GREEN_LIGHT = 'var(--success-bg)';

interface CloudAccount {
  provider: 'google';
  accountId: string;
  email: string;
  connected: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google Drive',
};

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
        showToast('success', `${PROVIDER_LABELS[data.provider] ?? data.provider} conectado: ${data.email}`);
        loadAccounts();
      } else {
        showToast('error', data.error || t('settings.cloud.toast_error'));
      }
      setConnecting(null);
    });

    return () => cleanup?.();
  }, [loadAccounts, t]);

  // Start polling when a connect action is in progress
  useEffect(() => {
    if (!connecting) return;
    const interval = setInterval(async () => {
      if (!window.electron?.cloud) return;
      const result = await window.electron.cloud.getAccounts();
      if (result.success && (result.accounts ?? []).length > 0) {
        setAccounts(result.accounts ?? []);
        setConnecting(null);
      }
    }, 1500);
    const timeout = setTimeout(() => clearInterval(interval), 90_000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [connecting]);

  const handleConnect = async () => {
    if (!window.electron?.cloud) return;
    setConnecting('google');
    try {
      const result = await window.electron.cloud.authGoogle();
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title="Cloud Storage"
        subtitle="Conecta Google Drive para explorar e importar archivos directamente en Dome."
      />

      {/* Connected accounts */}
      {loading ? (
        <DomeListState variant="loading" loadingLabel={t('settings.cloud.loading_accounts')} compact />
      ) : accounts.length > 0 ? (
        <div>
          <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.cloud.section_connected')}</DomeSectionLabel>
          <div className="space-y-2">
            {accounts.map((account) => (
              <DomeCard key={account.accountId} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <DomeIconBox size="md" className="!w-8 !h-8" background={DOME_GREEN_LIGHT}>
                      <Cloud className="w-4 h-4" style={{ color: DOME_GREEN }} />
                    </DomeIconBox>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                        {PROVIDER_LABELS[account.provider] ?? account.provider}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{account.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <DomeBadge label="Conectado" size="xs" color={DOME_GREEN} />
                    <DomeButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={() => void handleDisconnect(account.accountId)}
                      className="text-[var(--dome-text-muted)]"
                      title={t('settings.cloud.disconnect')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </DomeButton>
                  </div>
                </div>
              </DomeCard>
            ))}
          </div>
        </div>
      ) : null}

      {/* Connect button */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{googleConnected ? t('settings.cloud.section_add') : t('settings.cloud.section_connect')}</DomeSectionLabel>
        <DomeButton
          type="button"
          variant="outline"
          size="md"
          onClick={() => void handleConnect()}
          disabled={connecting === 'google'}
          className="w-full !justify-start !h-auto py-3 px-4 text-left"
          leftIcon={
            <DomeIconBox size="md" className="!w-8 !h-8" background="var(--dome-bg-hover)">
              {connecting === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: DOME_GREEN }} aria-hidden />
              ) : (
                <Cloud className="w-4 h-4" style={{ color: DOME_GREEN }} aria-hidden />
              )}
            </DomeIconBox>
          }
        >
          <div className="min-w-0 text-left">
            <p className="text-sm font-medium text-[var(--dome-text)]">
              {googleConnected ? t('settings.cloud.connect_google_another') : t('settings.cloud.connect_google')}
            </p>
            <p className="text-xs text-[var(--dome-text-muted)]">{t('settings.cloud.oauth_google')}</p>
          </div>
        </DomeButton>
      </div>
    </div>
  );
}
