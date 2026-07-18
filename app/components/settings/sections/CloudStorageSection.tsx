import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CloudIcon, Delete02Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { showToast } from '@/lib/store/useToastStore';

interface CloudAccount {
  provider: 'google';
  accountId: string;
  email: string;
  connected: boolean;
}

const PROVIDER_LABELS: Record<string, string> = { google: 'Google Drive' };

export default function CloudStorageSection() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<CloudAccount | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!window.electron?.cloud) return;
    setLoading(true);
    try {
      const result = await window.electron.cloud.getAccounts();
      if (result.success) setAccounts(result.accounts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
    const cleanup = window.electron?.cloud?.onAuthResult?.(
      (data: { success: boolean; provider: string; email?: string; error?: string }) => {
        if (data.success) {
          showToast(
            'success',
            t('settings.cloud.toast_connected', {
              provider: PROVIDER_LABELS[data.provider] ?? data.provider,
              email: data.email,
            }),
          );
          void loadAccounts();
        } else {
          showToast('error', data.error || t('settings.cloud.toast_error'));
        }
        setConnecting(null);
      },
    );
    return () => cleanup?.();
  }, [loadAccounts, t]);

  // While the OAuth tab is open in the browser, poll until the account lands.
  useEffect(() => {
    if (!connecting) return;
    const interval = window.setInterval(async () => {
      const result = await window.electron?.cloud?.getAccounts();
      if (result?.success && (result.accounts ?? []).length > 0) {
        setAccounts(result.accounts ?? []);
        setConnecting(null);
      }
    }, 1500);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 90_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
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
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : t('settings.cloud.toast_error'));
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    if (!pendingDisconnect || !window.electron?.cloud) return;
    const result = await window.electron.cloud.disconnect(pendingDisconnect.accountId);
    if (result.success) {
      showToast('success', t('settings.cloud.toast_disconnected'));
      setAccounts((current) =>
        current.filter((account) => account.accountId !== pendingDisconnect.accountId),
      );
    } else {
      showToast('error', result.error || t('settings.cloud.toast_disconnect_error'));
    }
    setPendingDisconnect(null);
  };

  return (
    <SettingsSurface
      icon={CloudIcon}
      title={t('settings.cloud.title', 'Cloud Storage')}
      description={t(
        'settings.cloud.description',
        'Connect Google Drive to browse and import files directly into Dome.',
      )}
    >
      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : accounts.length ? (
        <SettingsGroup title={t('settings.cloud.connected')}>
          {accounts.map((account) => (
            <SettingsRow
              key={account.accountId}
              title={
                <span className="flex items-center gap-2">
                  <HugeiconsIcon icon={CloudIcon} className="text-muted-foreground" />
                  {PROVIDER_LABELS[account.provider] ?? account.provider}
                  <Badge variant="secondary">{t('settings.cloud.connected')}</Badge>
                </span>
              }
              description={`${account.email} · OAuth · ${account.provider}`}
              control={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPendingDisconnect(account)}
                  aria-label={t('settings.cloud.disconnect')}
                  title={t('settings.cloud.disconnect')}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              }
            />
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup
        title={
          accounts.length ? t('settings.cloud.section_add') : t('settings.cloud.section_connect')
        }
      >
        <SettingsRow
          title={t('settings.cloud.oauth_google')}
          description={t(
            'settings.cloud.permissions',
            'Dome requests access only to browse and import files you select.',
          )}
          control={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleConnect()}
              disabled={connecting === 'google'}
            >
              {connecting === 'google' ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={CloudIcon} data-icon="inline-start" />
              )}
              {t(
                accounts.some((account) => account.provider === 'google')
                  ? 'settings.cloud.connect_google_another'
                  : 'settings.cloud.connect_google',
              )}
            </Button>
          }
        />
      </SettingsGroup>

      <ConfirmDialog
        isOpen={Boolean(pendingDisconnect)}
        title={t('settings.cloud.disconnect')}
        message={pendingDisconnect?.email ?? ''}
        confirmLabel={t('settings.cloud.disconnect')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={() => {
          void handleDisconnect();
        }}
        onCancel={() => setPendingDisconnect(null)}
      />
    </SettingsSurface>
  );
}
