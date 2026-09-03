import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  Copy01Icon,
  Key01Icon,
  RefreshIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
import { socialAccountLabel } from '@/lib/social/socialQueues';
import type { SocialAccount, SocialProvider } from '@/components/social/socialTypes';
import { hubFichaTitleClass } from '@/components/shared/hubChrome';
import { ActionIcon, ProviderMark, ReadField, SectionCard } from '@/components/social/crm/socialCrmChrome';
import {
  SocialDirectoryColumn,
  SocialDirectoryRow,
  SocialFichaEmpty,
  SocialHubSplit,
} from '@/components/social/workspace/SocialDirectoryColumn';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProviderStatus {
  provider: SocialProvider;
  clientId: string;
  hasClientSecret: boolean;
  supportsManualToken: boolean;
  requiresMedia: boolean;
  redirectUri: string;
  orgEnabled?: boolean;
}

const PROVIDER_NAMES: Record<SocialProvider, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
};

export function SocialAccountsManager({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const cloudEntitlements = useCloudEntitlements();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [oauthPort, setOauthPort] = useState(8737);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProviderStatus | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [statusResponse, accountsResponse] = await Promise.all([
      window.electron.invoke('social:providers:status'),
      window.electron.invoke('social:accounts:list'),
    ]);
    if (statusResponse?.success) {
      setProviders(statusResponse.data.providers ?? []);
      setOauthPort(statusResponse.data.oauthPort ?? 8737);
      setEncryptionAvailable(statusResponse.data.encryptionAvailable !== false);
    }
    if (accountsResponse?.success) setAccounts(accountsResponse.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load().catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Error');
      setLoading(false);
    });
    const unsubscribe = window.electron?.on?.('social:account-updated', () => { load();
    });
    return () => unsubscribe?.();
  }, [load]);

  const savePort = async () => {
    setError(null);
    const response = await window.electron.invoke('social:oauth:set-port', { port: oauthPort });
    if (!response?.success) setError(response?.error || 'Error');
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const rows: Array<
    | { key: string; kind: 'account'; account: SocialAccount }
    | { kind: 'provider'; key: string; provider: ProviderStatus }
  > = [
    ...accounts.map((account) => ({ key: `acc:${account.id}`, kind: 'account' as const, account })),
    ...providers
      .filter((provider) => !accounts.some((account) => account.provider === provider.provider))
      .map((provider) => ({ key: `prov:${provider.provider}`, kind: 'provider' as const, provider })),
  ];
  const selected =
    rows.find((row) => row.key === selectedKey) ?? null;

  return (
    <div className={embedded ? 'flex min-h-0 flex-1 overflow-hidden' : 'flex h-full min-h-0 flex-col'}>
      <SocialHubSplit>
        <SocialDirectoryColumn
          title={t('social.studio.nav.accounts')}
          empty={
            rows.length === 0
              ? {
                  icon: <HugeiconsIcon icon={Settings01Icon} className="size-8" />,
                  title: t('social.studio.accounts.not_connected'),
                  description: t('social.studio.accounts.description'),
                }
              : undefined
          }
        >
          <ul className="flex flex-col">
            {rows.map((row) =>
              row.kind === 'account' ? (
                <SocialDirectoryRow
                  key={row.key}
                  selected={selectedKey === row.key}
                  onClick={() => setSelectedKey(row.key)}
                  mark={<ProviderMark provider={row.account.provider} />}
                  title={socialAccountLabel(row.account)}
                  subtitle={PROVIDER_NAMES[row.account.provider]}
                />
              ) : (
                <SocialDirectoryRow
                  key={row.key}
                  selected={selectedKey === row.key}
                  onClick={() => setSelectedKey(row.key)}
                  mark={<ProviderMark provider={row.provider.provider} />}
                  title={PROVIDER_NAMES[row.provider.provider]}
                  subtitle={t('social.studio.accounts.not_connected')}
                />
              ),
            )}
          </ul>
        </SocialDirectoryColumn>
        {selected?.kind === 'account' ? (
          <AccountFicha
            account={selected.account}
            provider={providers.find((item) => item.provider === selected.account.provider) ?? null}
            hasSocialCloud={cloudEntitlements.hasSocialCloud}
            oauthPort={oauthPort}
            onOauthPort={setOauthPort}
            onSavePort={() => { savePort().catch(() => {}); }}
            encryptionAvailable={encryptionAvailable}
            error={error}
            onConfigure={() => {
              const provider = providers.find((item) => item.provider === selected.account.provider);
              if (provider) setEditing(provider);
            }}
            onChanged={load}
            onError={setError}
          />
        ) : selected?.kind === 'provider' ? (
          <AccountFicha
            account={null}
            provider={selected.provider}
            hasSocialCloud={cloudEntitlements.hasSocialCloud}
            oauthPort={oauthPort}
            onOauthPort={setOauthPort}
            onSavePort={() => { savePort().catch(() => {}); }}
            encryptionAvailable={encryptionAvailable}
            error={error}
            onConfigure={() => setEditing(selected.provider)}
            onChanged={load}
            onError={setError}
          />
        ) : (
          <SocialFichaEmpty
            icon={<HugeiconsIcon icon={Settings01Icon} className="size-8" />}
            title={t('social.studio.crm.detail_empty_account')}
            description={t('social.studio.crm.detail_empty_account_hint')}
          />
        )}
      </SocialHubSplit>
      <ProviderConfigurationDialog
        provider={editing}
        accounts={editing ? accounts.filter((account) => account.provider === editing.provider) : []}
        onClose={() => setEditing(null)}
        onChanged={async () => {
          await load();
          setEditing(null);
        }}
        onError={setError}
      />
    </div>
  );
}

function AccountFicha({
  account,
  provider,
  hasSocialCloud,
  oauthPort,
  onOauthPort,
  onSavePort,
  encryptionAvailable,
  error,
  onConfigure,
  onChanged,
  onError,
}: {
  account: SocialAccount | null;
  provider: ProviderStatus | null;
  hasSocialCloud: boolean;
  oauthPort: number;
  onOauthPort: (port: number) => void;
  onSavePort: () => void;
  encryptionAvailable: boolean;
  error: string | null;
  onConfigure: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const unavailable = t('social.studio.crm.unavailable');
  const network = account?.provider ?? provider?.provider;
  const title = account ? socialAccountLabel(account) : network ? PROVIDER_NAMES[network] : t('social.studio.nav.accounts');

  const disconnect = async () => {
    if (!account) return;
    const response = await window.electron.invoke('social:disconnect', { accountId: account.id });
    if (!response?.success) onError(response?.error || 'Error');
    await onChanged();
  };
  const toggleCloud = async (enabled: boolean) => {
    if (!account) return;
    const response = await window.electron.socialCloud?.setCloudPublishing?.({ accountId: account.id, enabled });
    if (!response?.success) onError(response?.error || t('social.settings.cloud_publishing_error'));
    await onChanged();
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col items-center gap-2 border-b px-3 pb-4 pt-4">
        {network ? <ProviderMark provider={network} className="size-10 text-sm" /> : null}
        <div className="flex max-w-full flex-col items-center gap-1 text-center">
          <div className="flex max-w-full items-center gap-2">
            <h2 className={hubFichaTitleClass}>{title}</h2>
            <Badge variant={account?.status === 'active' ? 'lime' : 'outline'}>
              {account
                ? t(`social.studio.accounts.${account.status === 'active' ? 'active' : 'setup'}`)
                : t('social.studio.accounts.setup')}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ActionIcon
            label={t('social.studio.accounts.configure', { provider: network ? PROVIDER_NAMES[network] : '' })}
            available={Boolean(provider)}
            unavailableLabel={unavailable}
            icon={Settings01Icon}
            onClick={onConfigure}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {!encryptionAvailable ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert02Icon} />
              <AlertTitle>{t('social.settings.no_encryption')}</AlertTitle>
              <AlertDescription>{t('social.settings.no_encryption')}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert02Icon} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <SectionCard title={t('social.studio.crm.tab_info')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadField
                label={t('social.studio.nav.accounts')}
                value={account ? socialAccountLabel(account) : t('social.studio.accounts.not_connected')}
              />
              <ReadField
                label={t('social.settings.account_kind_member')}
                value={
                  account
                    ? account.accountKind === 'organization'
                      ? t('social.settings.account_kind_organization')
                      : t('social.settings.account_kind_member')
                    : ''
                }
              />
            </div>
            {account && hasSocialCloud && account.status === 'active' ? (
              <Field orientation="horizontal" className="mt-3">
                <Checkbox
                  checked={Boolean(account.cloudPublishing)}
                  onCheckedChange={(checked) => {
                    toggleCloud(checked === true).catch(() => {});
                  }}
                />
                <FieldLabel>{t('social.settings.cloud_publishing')}</FieldLabel>
              </Field>
            ) : null}
            {account ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  disconnect().catch(() => {});
                }}
              >
                {t('social.settings.disconnect')}
              </Button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {network ? t(`social.settings.hint_${network}`) : null}
              </p>
            )}
          </SectionCard>
          <SectionCard title={t('social.settings.oauth_port')}>
            <div className="flex flex-wrap items-end gap-2">
              <Input
                id="social-studio-oauth-port"
                type="number"
                value={oauthPort}
                onChange={(event) => onOauthPort(Number(event.target.value) || 8737)}
                className="max-w-40"
              />
              <Button type="button" variant="outline" size="sm" onClick={onSavePort}>
                {t('social.settings.save')}
              </Button>
            </div>
          </SectionCard>
        </div>
      </ScrollArea>
    </div>
  );
}

function ProviderConfigurationDialog({
  provider,
  accounts,
  onClose,
  onChanged,
  onError,
}: {
  provider: ProviderStatus | null;
  accounts: SocialAccount[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [token, setToken] = useState('');
  const [orgEnabled, setOrgEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setClientId(provider?.clientId ?? '');
    setClientSecret('');
    setToken('');
    setOrgEnabled(Boolean(provider?.orgEnabled));
  }, [provider]);

  if (!provider) return null;

  const save = async () => {
    setBusy(true);
    const payload: Record<string, string | boolean> = {
      provider: provider.provider,
      clientId: clientId.trim(),
    };
    if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
    if (provider.provider === 'linkedin') payload.orgEnabled = orgEnabled;
    const response = await window.electron.invoke('social:providers:set-config', payload);
    setBusy(false);
    if (!response?.success) onError(response?.error || 'Error');
    else await onChanged();
  };

  const connectOAuth = async () => {
    setBusy(true);
    const response = await window.electron.invoke('social:connect-oauth', { provider: provider.provider });
    setBusy(false);
    if (!response?.success) onError(response?.error || 'Error');
    else await onChanged();
  };

  const connectToken = async () => {
    if (!token.trim()) return;
    setBusy(true);
    const response = await window.electron.invoke('social:connect-token', {
      provider: provider.provider,
      accessToken: token.trim(),
    });
    setBusy(false);
    if (!response?.success) onError(response?.error || 'Error');
    else await onChanged();
  };

  const syncOrganizations = async () => {
    const member = accounts.find((account) => account.accountKind === 'member');
    if (!member) return;
    setBusy(true);
    const response = await window.electron.invoke('social:linkedin:sync-orgs', { accountId: member.id });
    setBusy(false);
    if (!response?.success) onError(response?.error || 'Error');
    else await onChanged();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('social.studio.accounts.configure', { provider: PROVIDER_NAMES[provider.provider] })}</DialogTitle>
          <DialogDescription>{t(`social.settings.hint_${provider.provider}`)}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`studio-client-id-${provider.provider}`}>{t('social.settings.client_id')}</FieldLabel>
            <Input id={`studio-client-id-${provider.provider}`} value={clientId} onChange={(event) => setClientId(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`studio-client-secret-${provider.provider}`}>{t('social.settings.client_secret')}</FieldLabel>
            <Input
              id={`studio-client-secret-${provider.provider}`}
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={provider.hasClientSecret ? t('social.settings.secret_saved') : undefined}
            />
          </Field>
          <Field>
            <FieldLabel>{t('social.settings.redirect_uri')}</FieldLabel>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
              <code className="min-w-0 flex-1 truncate text-xs">{provider.redirectUri}</code>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => navigator.clipboard?.writeText(provider.redirectUri)}>
                <HugeiconsIcon icon={Copy01Icon} />
                <span className="sr-only">{t('social.settings.copy')}</span>
              </Button>
            </div>
          </Field>
          {provider.provider === 'linkedin' ? (
            <Field orientation="horizontal">
              <Checkbox checked={orgEnabled} onCheckedChange={setOrgEnabled} />
              <div className="flex flex-col gap-0.5">
                <FieldLabel>{t('social.settings.linkedin_org_enabled')}</FieldLabel>
                <FieldDescription>{t('social.settings.linkedin_org_hint')}</FieldDescription>
              </div>
            </Field>
          ) : null}
          {provider.supportsManualToken ? (
            <Field>
              <FieldLabel htmlFor={`studio-token-${provider.provider}`}>{t('social.settings.connect_token')}</FieldLabel>
              <div className="flex gap-2">
                <Input id={`studio-token-${provider.provider}`} type="password" value={token} onChange={(event) => setToken(event.target.value)} />
                <Button type="button" variant="outline" onClick={() => connectToken()} disabled={busy || !token.trim()}>
                  <HugeiconsIcon icon={Key01Icon} data-icon="inline-start" />
                  {t('social.settings.connect')}
                </Button>
              </div>
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          {provider.provider === 'linkedin' && accounts.some((account) => account.accountKind === 'member') ? (
            <Button type="button" variant="ghost" onClick={() => syncOrganizations()} disabled={busy}>
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
              {t('social.settings.linkedin_sync_orgs')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => save()} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t('social.settings.save')}
          </Button>
          <Button type="button" onClick={() => connectOAuth()} disabled={busy || !clientId.trim()}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t('social.settings.connect_oauth')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
