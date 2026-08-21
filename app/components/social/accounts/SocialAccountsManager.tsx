import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Alert02Icon,
  Building2Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  InstagramIcon,
  Key01Icon,
  Linkedin01Icon,
  RefreshIcon,
  Settings01Icon,
  TwitterIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
import { socialAccountLabel } from '@/lib/social/socialQueues';
import type { SocialAccount, SocialProvider } from '@/components/social/socialTypes';
import { cn } from '@/lib/utils';

interface ProviderStatus {
  provider: SocialProvider;
  clientId: string;
  hasClientSecret: boolean;
  supportsManualToken: boolean;
  requiresMedia: boolean;
  redirectUri: string;
  orgEnabled?: boolean;
}

const PROVIDER_ICONS: Record<SocialProvider, IconSvgElement> = {
  linkedin: Linkedin01Icon,
  instagram: InstagramIcon,
  x: TwitterIcon,
};

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
        <Spinner className="text-primary" />
      </div>
    );
  }

  const activeCount = accounts.filter((account) => account.status === 'active').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div
        className={cn(
          'flex w-full flex-col gap-6',
          embedded ? 'p-4 lg:p-6' : 'mx-auto max-w-5xl p-6',
        )}
      >
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary">
              <HugeiconsIcon icon={Settings01Icon} />
              <span className="text-xs font-medium uppercase tracking-[0.16em]">
                {t('social.studio.accounts.eyebrow')}
              </span>
            </div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              {t('social.studio.accounts.title')}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t('social.studio.accounts.description')}
            </p>
          </div>
          <Badge variant={activeCount > 0 ? 'mint' : 'outline'}>
            {t('social.studio.accounts.connected_count', { count: activeCount })}
          </Badge>
        </header>

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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.provider}
              provider={provider}
              accounts={accounts.filter((account) => account.provider === provider.provider)}
              hasSocialCloud={cloudEntitlements.hasSocialCloud}
              onConfigure={() => setEditing(provider)}
              onChanged={load}
              onError={setError}
            />
          ))}
        </div>

        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>{t('social.settings.oauth_port')}</CardTitle>
            <CardDescription>{t('social.settings.oauth_port_hint')}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field className="min-w-40 flex-1">
                <FieldLabel htmlFor="social-studio-oauth-port">
                  {t('social.settings.oauth_port')}
                </FieldLabel>
                <Input
                  id="social-studio-oauth-port"
                  type="number"
                  value={oauthPort}
                  onChange={(event) => setOauthPort(Number(event.target.value) || 8737)}
                  className="max-w-40"
                />
              </Field>
              <Button type="button" variant="outline" size="sm" onClick={() => savePort()}>
                {t('social.settings.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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

function ProviderCard({
  provider,
  accounts,
  hasSocialCloud,
  onConfigure,
  onChanged,
  onError,
}: {
  provider: ProviderStatus;
  accounts: SocialAccount[];
  hasSocialCloud: boolean;
  onConfigure: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const icon = PROVIDER_ICONS[provider.provider];
  const toggleCloud = async (accountId: string, enabled: boolean) => {
    const response = await window.electron.socialCloud?.setCloudPublishing?.({ accountId, enabled });
    if (!response?.success) onError(response?.error || t('social.settings.cloud_publishing_error'));
    await onChanged();
  };
  const disconnect = async (accountId: string) => {
    const response = await window.electron.invoke('social:disconnect', { accountId });
    if (!response?.success) onError(response?.error || 'Error');
    await onChanged();
  };

  const isActive = accounts.some((account) => account.status === 'active');

  return (
    <Card className="flex min-h-64 flex-col">
      <CardHeader className="border-b pb-(--card-spacing)">
        <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-muted text-primary">
          <HugeiconsIcon icon={icon} />
        </div>
        <CardTitle className="text-base">{PROVIDER_NAMES[provider.provider]}</CardTitle>
        <CardDescription>
          {accounts.length
            ? t('social.studio.accounts.connected_count', { count: accounts.length })
            : t('social.studio.accounts.not_connected')}
        </CardDescription>
        <CardAction>
          <Badge variant={isActive ? 'mint' : 'outline'}>
            {isActive ? t('social.studio.accounts.active') : t('social.studio.accounts.setup')}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pt-4">
        {accounts.map((account) => (
          <div key={account.id} className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3 ring-1 ring-foreground/5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{socialAccountLabel(account)}</p>
                <p className="text-xs text-muted-foreground">
                  {account.accountKind === 'organization'
                    ? t('social.settings.account_kind_organization')
                    : t('social.settings.account_kind_member')}
                </p>
              </div>
              <HugeiconsIcon
                icon={account.accountKind === 'organization' ? Building2Icon : CheckmarkCircle02Icon}
                className={account.status === 'active' ? 'text-success' : 'text-destructive'}
              />
            </div>
            {hasSocialCloud && account.status === 'active' ? (
              <Field orientation="horizontal">
                <Checkbox
                  checked={Boolean(account.cloudPublishing)}
                  onCheckedChange={(checked) => toggleCloud(account.id, checked)}
                />
                <FieldLabel>{t('social.settings.cloud_publishing')}</FieldLabel>
              </Field>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="self-start"
              onClick={() => disconnect(account.id)}
            >
              {t('social.settings.disconnect')}
            </Button>
          </div>
        ))}
        {!accounts.length ? (
          <Collapsible className="rounded-xl bg-muted/40 ring-1 ring-foreground/5">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
              {t('social.studio.accounts.setup')}
              <span className="text-[11px] font-normal">{t('social.studio.accounts.configure', { provider: PROVIDER_NAMES[provider.provider] })}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <Separator className="mb-2" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t(`social.settings.hint_${provider.provider}`)}
              </p>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
      <CardFooter className="mt-auto border-t pt-(--card-spacing)">
        <Button
          type="button"
          variant={accounts.length ? 'outline' : 'default'}
          className="w-full"
          onClick={onConfigure}
        >
          {accounts.length ? t('social.studio.accounts.manage') : t('social.settings.connect')}
        </Button>
      </CardFooter>
    </Card>
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
