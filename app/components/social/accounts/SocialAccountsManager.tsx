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
import { SocialMessagingFlags } from '@/components/social/accounts/SocialMessagingFlags';
import { HubDetailPane } from '@/components/shared/HubDetailPane';
import { ProviderMark, ReadField, SectionCard } from '@/components/social/crm/socialCrmChrome';
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
  commentsEnabled?: boolean;
  dmEnabled?: boolean;
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
    if (!statusResponse?.success || !accountsResponse?.success) {
      throw new Error(statusResponse?.error || accountsResponse?.error || 'Error');
    }
    if (statusResponse?.success) {
      setProviders(statusResponse.data.providers ?? []);
      setOauthPort(statusResponse.data.oauthPort ?? 8737);
      setEncryptionAvailable(statusResponse.data.encryptionAvailable !== false);
    }
    if (accountsResponse?.success) setAccounts(accountsResponse.data ?? []);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { load().catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Error');
      setLoading(false);
    });
    const unsubscribe = window.electron?.on?.('social:account-updated', () => { load().catch((reason) => setError(String(reason.message || reason)));
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
      .map((provider) => ({ key: `prov:${provider.provider}`, kind: 'provider' as const, provider })),
  ];
  const selected =
    rows.find((row) => row.key === selectedKey) ?? null;

  return (
    <div className={embedded ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex h-full min-h-0 flex-col'}>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
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
                  subtitle={`${PROVIDER_NAMES[row.account.provider]} · ${t(row.account.status === 'active' ? 'social.studio.accounts.active' : `social.settings.status_${row.account.status}`)}`}
                />
              ) : (
                <SocialDirectoryRow
                  key={row.key}
                  selected={selectedKey === row.key}
                  onClick={() => setSelectedKey(row.key)}
                  mark={<ProviderMark provider={row.provider.provider} />}
                  title={PROVIDER_NAMES[row.provider.provider]}
                  subtitle={t(accounts.some((account) => account.provider === row.provider.provider) ? 'social.studio.accounts.add_account' : 'social.settings.connect')}
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
            onSavePort={() => { savePort().catch((reason) => setError(reason instanceof Error ? reason.message : 'Error')); }}
            encryptionAvailable={encryptionAvailable}
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
            onSavePort={() => { savePort().catch((reason) => setError(reason instanceof Error ? reason.message : 'Error')); }}
            encryptionAvailable={encryptionAvailable}
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
        onChanged={load}
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
  onConfigure: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const network = account?.provider ?? provider?.provider;
  const title = account ? socialAccountLabel(account) : network ? PROVIDER_NAMES[network] : t('social.studio.nav.accounts');

  const disconnect = async () => {
    if (!account) return;
    const response = await window.electron.invoke('social:disconnect', { accountId: account.id });
    if (!response?.success) { onError(response?.error || 'Error'); return; }
    await onChanged();
  };
  const toggleCloud = async (enabled: boolean) => {
    if (!account) return;
    const response = await window.electron.socialCloud?.setCloudPublishing?.({ accountId: account.id, enabled });
    if (!response?.success) { onError(response?.error || t('social.settings.cloud_publishing_error')); return; }
    await onChanged();
  };

  return (
    <HubDetailPane
      icon={network ? <ProviderMark provider={network} className="size-10 text-sm" /> : null}
      title={title}
      badge={<ConnectionStatusBadge account={account} />}
      toolbar={
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" onClick={onConfigure} disabled={!provider}>
            {t(account ? 'social.settings.reconnect' : 'social.settings.connect')}
          </Button>

        </div>
      }
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {!encryptionAvailable ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert02Icon} />
              <AlertTitle>{t('social.settings.no_encryption')}</AlertTitle>
              <AlertDescription>{t('social.settings.no_encryption')}</AlertDescription>
            </Alert>
          ) : null}

          {account?.lastError ? <Alert variant="destructive"><AlertDescription>{account.lastError}</AlertDescription></Alert> : null}
          <AccountInfoSection
            account={account}
            network={network}
            hasSocialCloud={hasSocialCloud}
            onDisconnect={() => {
              disconnect().catch((reason) => onError(reason instanceof Error ? reason.message : 'Error'));
            }}
            onToggleCloud={(checked) => {
              toggleCloud(checked).catch((reason) => onError(reason instanceof Error ? reason.message : 'Error'));
            }}
          />
          <SectionCard title={t('social.settings.oauth_port')}>
            <div className="flex flex-wrap items-end gap-2">
              <Input
                aria-label={t('social.settings.oauth_port')}
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
    </HubDetailPane>
  );
}

function ConnectionStatusBadge({ account }: { account: SocialAccount | null }) {
  const { t } = useTranslation();
  return (
    <Badge variant={account?.status === 'active' ? 'lime' : 'outline'}>
      {account
        ? t(account.status === 'active' ? 'social.studio.accounts.active' : `social.settings.status_${account.status}`)
        : t('social.studio.accounts.setup')}
    </Badge>
  );
}

function AccountInfoSection({
  account,
  network,
  hasSocialCloud,
  onDisconnect,
  onToggleCloud,
}: {
  account: SocialAccount | null;
  network: SocialProvider | null | undefined;
  hasSocialCloud: boolean;
  onDisconnect: () => void;
  onToggleCloud: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <SectionCard title={t('social.studio.crm.tab_info')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadField
          label={t('social.studio.nav.accounts')}
          value={account ? socialAccountLabel(account) : t('social.studio.accounts.not_connected')}
        />
        {network === 'linkedin' && account ? (
          <ReadField
            label={t('social.settings.account_kind_member')}
            value={t(account.accountKind === 'organization' ? 'social.settings.account_kind_organization' : 'social.settings.account_kind_member')}
          />
        ) : null}
        {account?.lastSyncAt ? (
          <p className="text-xs text-muted-foreground">{t('social.hub.last_sync', { time: new Date(account.lastSyncAt).toLocaleString() })}</p>
        ) : null}
      </div>
      {account && hasSocialCloud && account.status === 'active' ? (
        <Field orientation="horizontal" className="mt-3">
          <Checkbox
            checked={Boolean(account.cloudPublishing)}
            onCheckedChange={(checked) => onToggleCloud(checked === true)}
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
          onClick={onDisconnect}
        >
          {t('social.settings.disconnect')}
        </Button>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {network ? t(`social.settings.hint_${network}`) : null}
        </p>
      )}
    </SectionCard>
  );
}

function ProviderConfigurationDialog({
  provider,
  accounts,
  onClose,
  onChanged,
}: {
  provider: ProviderStatus | null;
  accounts: SocialAccount[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [token, setToken] = useState('');
  const [orgEnabled, setOrgEnabled] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [dmEnabled, setDmEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedSecret, setHasSavedSecret] = useState(false);

  useEffect(() => {
    setError(null);
    setHasSavedSecret(Boolean(provider?.hasClientSecret));
    setClientId(provider?.clientId ?? '');
    setClientSecret('');
    setToken('');
    setOrgEnabled(Boolean(provider?.orgEnabled));
    setCommentsEnabled(Boolean(provider?.commentsEnabled));
    setDmEnabled(Boolean(provider?.dmEnabled));
  }, [provider]);

  if (!provider) return null;

  const saveConfig = async () => {
    const payload: Record<string, string | boolean> = {
      provider: provider.provider,
      clientId: clientId.trim(),
    };
    if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
    if (provider.provider === 'linkedin') payload.orgEnabled = orgEnabled;
    if (provider.provider === 'instagram') {
      payload.commentsEnabled = commentsEnabled;
      payload.dmEnabled = dmEnabled;
    }
    if (provider.provider === 'x') payload.dmEnabled = dmEnabled;
    const response = await window.electron.invoke('social:providers:set-config', payload);
    if (!response?.success) throw new Error(response?.error || 'Error');
    if (clientSecret.trim()) setHasSavedSecret(true);
    setClientSecret('');
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const connectOAuth = () => run(async () => {
    await saveConfig();
    const response = await window.electron.invoke('social:connect-oauth', { provider: provider.provider });
    if (!response?.success) throw new Error(response?.error || 'Error');
    onClose();
  });

  const connectToken = () => run(async () => {
    const response = await window.electron.invoke('social:connect-token', {
      provider: provider.provider,
      accessToken: token.trim(),
    });
    if (!response?.success) throw new Error(response?.error || 'Error');
    setToken('');
    onClose();
  });

  const syncOrganizations = () => run(async () => {
    // Each connected member may administer different pages.
    for (const member of accounts.filter((account) => account.accountKind === 'member' && account.status === 'active')) {
      const response = await window.electron.invoke('social:linkedin:sync-orgs', { accountId: member.id });
      if (!response?.success) throw new Error(response?.error || 'Error');
    }
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('social.studio.accounts.configure', { provider: PROVIDER_NAMES[provider.provider] })}</DialogTitle>
          <DialogDescription>{t(`social.settings.hint_${provider.provider}`)}</DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <p className="text-sm text-muted-foreground">{t('social.studio.accounts.multi_account_hint')}</p>
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
              placeholder={hasSavedSecret ? t('social.settings.secret_saved') : undefined}
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
          <SocialMessagingFlags
            provider={provider.provider}
            commentsEnabled={commentsEnabled}
            dmEnabled={dmEnabled}
            onCommentsChange={setCommentsEnabled}
            onDmChange={setDmEnabled}
          />
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
          <Button type="button" variant="outline" onClick={() => run(saveConfig)} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t('social.settings.save')}
          </Button>
          <Button type="button" onClick={() => connectOAuth()} disabled={busy || !clientId.trim() || (provider.provider !== 'x' && !hasSavedSecret && !clientSecret.trim())}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t('social.settings.connect_oauth')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
