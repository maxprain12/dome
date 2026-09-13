import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, Share08Icon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
import { socialAccountLabel } from '@/lib/social/socialQueues';
import type { SocialAccount } from '@/components/social/socialTypes';
import { ProviderMark } from '@/components/social/crm/socialCrmChrome';
import { SettingsGroup, SettingsRow, SettingsSurface } from '@/components/settings/blocks';
import {
  SOCIAL_PROVIDER_NAMES,
  SocialProviderConnectDialog,
  type SocialProviderStatus,
} from './SocialProviderConnectDialog';

function accountStatusKey(status: SocialAccount['status']): string {
  switch (status) {
    case 'active':
      return 'social.studio.accounts.active';
    case 'error':
      return 'social.settings.status_error';
    case 'expired':
      return 'social.settings.status_expired';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function accountDescription(account: SocialAccount, translate: (key: string) => string): string {
  const parts = [SOCIAL_PROVIDER_NAMES[account.provider]];
  if (account.provider === 'linkedin') {
    parts.push(
      translate(account.accountKind === 'organization'
        ? 'social.settings.account_kind_organization'
        : 'social.settings.account_kind_member'),
    );
  }
  if (account.lastError) parts.push(account.lastError);
  return parts.join(' · ');
}

export function SocialAccountsManager({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const cloudEntitlements = useCloudEntitlements();
  const [providers, setProviders] = useState<SocialProviderStatus[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [oauthPort, setOauthPort] = useState(8737);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SocialProviderStatus | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<SocialAccount | null>(null);
  const [savingPort, setSavingPort] = useState(false);

  const load = useCallback(async () => {
    const [statusResponse, accountsResponse] = await Promise.all([
      window.electron.invoke('social:providers:status'),
      window.electron.invoke('social:accounts:list'),
    ]);
    if (!statusResponse?.success || !accountsResponse?.success) {
      throw new Error(statusResponse?.error || accountsResponse?.error || 'Error');
    }
    setProviders(statusResponse.data.providers ?? []);
    setOauthPort(statusResponse.data.oauthPort ?? 8737);
    setEncryptionAvailable(statusResponse.data.encryptionAvailable !== false);
    setAccounts(accountsResponse.data ?? []);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Error');
      setLoading(false);
    });
    const unsubscribe = window.electron?.on?.('social:account-updated', () => {
      load().catch((reason) => setError(String((reason as Error).message || reason)));
    });
    return () => unsubscribe?.();
  }, [load]);

  const savePort = async () => {
    setSavingPort(true);
    setError(null);
    try {
      const response = await window.electron.invoke('social:oauth:set-port', { port: oauthPort });
      if (!response?.success) setError(response?.error || 'Error');
    } finally {
      setSavingPort(false);
    }
  };

  const disconnect = async () => {
    if (!pendingDisconnect) return;
    const response = await window.electron.invoke('social:disconnect', { accountId: pendingDisconnect.id });
    if (!response?.success) {
      setError(response?.error || 'Error');
      setPendingDisconnect(null);
      return;
    }
    setPendingDisconnect(null);
    await load();
  };

  const toggleCloud = async (account: SocialAccount, enabled: boolean) => {
    const response = await window.electron.socialCloud?.setCloudPublishing?.({ accountId: account.id, enabled });
    if (!response?.success) {
      setError(response?.error || t('social.settings.cloud_publishing_error'));
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const body = (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!encryptionAvailable ? (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} />
          <AlertTitle>{t('social.settings.no_encryption')}</AlertTitle>
          <AlertDescription>{t('social.settings.no_encryption')}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsGroup title={t('social.settings.section_accounts')}>
        {accounts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('social.settings.no_accounts')}</p>
        ) : (
          accounts.map((account) => (
            <SettingsRow
              key={account.id}
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <ProviderMark provider={account.provider} />
                  <span className="truncate">{socialAccountLabel(account)}</span>
                  <Badge variant={account.status === 'active' ? 'lime' : 'outline'}>
                    {t(accountStatusKey(account.status))}
                  </Badge>
                </span>
              }
              description={accountDescription(account, t)}
              control={
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      const provider = providers.find((item) => item.provider === account.provider);
                      if (provider) setEditing(provider);
                    }}
                  >
                    {t('social.settings.reconnect')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setPendingDisconnect(account)}
                  >
                    {t('social.settings.disconnect')}
                  </Button>
                </div>
              }
            />
          ))
        )}
      </SettingsGroup>

      {accounts.length > 0 ? (
        <SettingsGroup
          title={t('social.settings.cloud_publishing')}
          description={
            cloudEntitlements.hasSocialCloud
              ? t('social.settings.cloud_publishing_consent')
              : t('social.settings.cloud_publishing_plan')
          }
        >
          {accounts.map((account) => {
            const canEnable = cloudEntitlements.hasSocialCloud && account.status === 'active';
            const label = socialAccountLabel(account);
            return (
              <SettingsRow
                key={`cloud-${account.id}`}
                title={label}
                description={t('social.settings.cloud_publishing_account')}
                control={
                  <Switch
                    checked={Boolean(account.cloudPublishing) && canEnable}
                    disabled={!canEnable}
                    onCheckedChange={(checked) => {
                      toggleCloud(account, checked).catch((reason) => {
                        setError(reason instanceof Error ? reason.message : 'Error');
                      });
                    }}
                    aria-label={`${t('social.settings.cloud_publishing')}: ${label}`}
                  />
                }
              />
            );
          })}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={t('social.settings.section_networks')} description={t('social.studio.accounts.multi_account_hint')}>
        {providers.map((provider) => {
          const connected = accounts.some((account) => account.provider === provider.provider);
          return (
            <SettingsRow
              key={provider.provider}
              title={
                <span className="flex items-center gap-2">
                  <ProviderMark provider={provider.provider} />
                  {SOCIAL_PROVIDER_NAMES[provider.provider]}
                </span>
              }
              description={t(`social.settings.network_${provider.provider}`)}
              control={
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(provider)}>
                  {t(connected ? 'social.studio.accounts.add_account' : 'social.settings.connect')}
                </Button>
              }
            />
          );
        })}
      </SettingsGroup>

      <SettingsGroup title={t('social.settings.section_advanced')}>
        <SettingsRow
          title={t('social.settings.oauth_port')}
          description={t('social.settings.oauth_port_hint')}
          htmlFor="social-oauth-port"
        >
          <Field className="max-w-40">
            <FieldLabel htmlFor="social-oauth-port" className="sr-only">
              {t('social.settings.oauth_port')}
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="social-oauth-port"
                type="number"
                value={oauthPort}
                onChange={(event) => setOauthPort(Number(event.target.value) || 8737)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingPort}
                onClick={() => {
                  savePort().catch((reason) => setError(reason instanceof Error ? reason.message : 'Error'));
                }}
              >
                {savingPort ? <Spinner data-icon="inline-start" /> : null}
                {t('social.settings.save_port')}
              </Button>
            </div>
          </Field>
        </SettingsRow>
      </SettingsGroup>

      <SocialProviderConnectDialog
        provider={editing}
        accounts={editing ? accounts.filter((account) => account.provider === editing.provider) : []}
        onClose={() => setEditing(null)}
        onChanged={load}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingDisconnect)}
        title={t('social.settings.disconnect_confirm_title')}
        message={pendingDisconnect ? t('social.settings.disconnect_confirm', { name: socialAccountLabel(pendingDisconnect) }) : ''}
        confirmLabel={t('social.settings.disconnect')}
        variant="danger"
        onConfirm={() => {
          disconnect().catch((reason) => setError(reason instanceof Error ? reason.message : 'Error'));
        }}
        onCancel={() => setPendingDisconnect(null)}
      />
    </>
  );

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">{body}</div>;
  }

  return (
    <SettingsSurface
      icon={Share08Icon}
      title={t('social.settings.title')}
      description={t('social.settings.description')}
    >
      {body}
    </SettingsSurface>
  );
}
