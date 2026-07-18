import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  Building2Icon,
  CheckmarkCircle02Icon,
  CopyIcon,
  Delete02Icon,
  HelpCircleIcon,
  InstagramIcon,
  Key01Icon,
  Link02Icon,
  Linkedin01Icon,
  RefreshIcon,
  Share08Icon,
  TwitterIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import SocialConnectDialog from './SocialConnectDialog';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';

type SocialProvider = 'linkedin' | 'instagram' | 'x';

interface ProviderStatus {
  provider: SocialProvider;
  clientId: string;
  hasClientSecret: boolean;
  supportsManualToken: boolean;
  requiresMedia: boolean;
  redirectUri: string;
  /** LinkedIn only: request organization scopes for company pages. */
  orgEnabled?: boolean;
}

interface SocialAccount {
  id: string;
  provider: SocialProvider;
  accountKind?: 'member' | 'organization';
  displayName: string | null;
  handle: string | null;
  status: 'active' | 'error' | 'expired';
  lastError: string | null;
  connectedAt: number | null;
  cloudPublishing?: boolean;
}

const PROVIDER_ICONS: Record<SocialProvider, typeof Linkedin01Icon> = {
  linkedin: Linkedin01Icon,
  instagram: InstagramIcon,
  x: TwitterIcon,
};

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X (Twitter)',
};

const DEV_PORTAL_URLS: Record<SocialProvider, string> = {
  linkedin: 'https://www.linkedin.com/developers/apps',
  instagram: 'https://developers.facebook.com/apps',
  x: 'https://developer.x.com/en/portal/dashboard',
};

export default function SocialSection() {
  const { t } = useTranslation();
  const cloudEntitlements = useCloudEntitlements();
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [oauthPort, setOauthPort] = useState<number>(8737);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [statusRes, accountsRes] = await Promise.all([
      window.electron.invoke('social:providers:status'),
      window.electron.invoke('social:accounts:list'),
    ]);
    if (statusRes?.success) {
      setProviders(statusRes.data.providers);
      setOauthPort(statusRes.data.oauthPort);
      setEncryptionAvailable(statusRes.data.encryptionAvailable);
    }
    if (accountsRes?.success) setAccounts(accountsRes.data);
  }, []);

  useEffect(() => { load();
    const unsub = window.electron?.on?.('social:account-updated', () => load());
    return () => unsub?.();
  }, [load]);

  const savePort = async (port: number) => {
    setError(null);
    const res = await window.electron.invoke('social:oauth:set-port', { port });
    if (!res?.success) setError(res?.error || 'Error');
    await load();
  };

  return (
    <SettingsSurface
      icon={Share08Icon}
      title={t('social.settings.title')}
      description={t('social.settings.description')}
    >
      {!encryptionAvailable ? (
        <Alert role="note">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden />
          <AlertDescription className="text-xs">
            {t('social.settings.no_encryption')}
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {providers.map((p) => (
        <ProviderGroup
          key={p.provider}
          status={p}
          accounts={accounts.filter((a) => a.provider === p.provider)}
          onChanged={load}
          hasSocialCloud={cloudEntitlements.hasSocialCloud}
        />
      ))}

      <SettingsGroup title={t('social.settings.oauth_port')}>
        <SettingsRow
          title={t('social.settings.oauth_port')}
          description={t('social.settings.oauth_port_hint')}
          htmlFor="social-oauth-port"
          control={
            <Input
              id="social-oauth-port"
              type="number"
              value={oauthPort}
              onChange={(e) => setOauthPort(Number(e.target.value) || 8737)}
              onBlur={() => savePort(oauthPort)}
              className="w-28"
            />
          }
        />
      </SettingsGroup>
    </SettingsSurface>
  );
}

function ProviderGroup({
  status,
  accounts,
  onChanged,
  hasSocialCloud,
}: {
  status: ProviderStatus;
  accounts: SocialAccount[];
  onChanged: () => Promise<void>;
  hasSocialCloud: boolean;
}) {
  const { t } = useTranslation();
  const Icon = PROVIDER_ICONS[status.provider];
  const [clientId, setClientId] = useState(status.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgEnabled, setOrgEnabled] = useState(Boolean(status.orgEnabled));
  const [syncingOrgs, setSyncingOrgs] = useState(false);
  const [cloudBusyId, setCloudBusyId] = useState<string | null>(null);

  useEffect(() => setClientId(status.clientId), [status.clientId]);
  useEffect(() => setOrgEnabled(Boolean(status.orgEnabled)), [status.orgEnabled]);

  const saveConfig = async (patch?: { orgEnabled?: boolean }) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const payload: Record<string, string | boolean> = {
      provider: status.provider,
      clientId: clientId.trim(),
    };
    if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
    if (status.provider === 'linkedin' && patch?.orgEnabled !== undefined) {
      payload.orgEnabled = patch.orgEnabled;
    }
    const res = await window.electron.invoke('social:providers:set-config', payload);
    setSaving(false);
    if (!res?.success) {
      setError(res?.error || 'Error');
      return;
    }
    setClientSecret('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await onChanged();
  };

  const connectOAuth = async () => {
    setConnecting(true);
    setError(null);
    const res = await window.electron.invoke('social:connect-oauth', {
      provider: status.provider,
    });
    setConnecting(false);
    if (!res?.success) setError(res?.error || 'Error');
    await onChanged();
  };

  const connectToken = async () => {
    if (!manualToken.trim()) return;
    setConnecting(true);
    setError(null);
    const res = await window.electron.invoke('social:connect-token', {
      provider: status.provider,
      accessToken: manualToken.trim(),
    });
    setConnecting(false);
    if (!res?.success) {
      setError(res?.error || 'Error');
      return;
    }
    setManualToken('');
    setShowManual(false);
    await onChanged();
  };

  const toggleCloudPublishing = async (accountId: string, enabled: boolean) => {
    if (!window.electron?.socialCloud?.setCloudPublishing) return;
    setCloudBusyId(accountId);
    setError(null);
    const res = await window.electron.socialCloud.setCloudPublishing({ accountId, enabled });
    setCloudBusyId(null);
    if (!res?.success) {
      setError(res?.error || t('social.settings.cloud_publishing_error'));
      return;
    }
    await onChanged();
  };

  const disconnect = async (accountId: string) => {
    await window.electron.invoke('social:disconnect', { accountId });
    await onChanged();
  };

  const syncLinkedInOrgs = async (accountId: string) => {
    setSyncingOrgs(true);
    setError(null);
    const res = await window.electron.invoke('social:linkedin:sync-orgs', { accountId });
    setSyncingOrgs(false);
    if (!res?.success) setError(res?.error || 'Error');
    await onChanged();
  };

  const toggleOrgEnabled = async () => {
    const next = !orgEnabled;
    setOrgEnabled(next);
    await saveConfig({ orgEnabled: next });
  };

  const linkedInMemberAccount = accounts.find(
    (a) => a.provider === 'linkedin' && (a.accountKind || 'member') === 'member',
  );

  const copyRedirect = () => { navigator.clipboard?.writeText(status.redirectUri);
  };

  const configured =
    Boolean(clientId.trim()) &&
    (status.provider === 'x' || status.hasClientSecret || Boolean(clientSecret.trim()));

  return (
    <SettingsGroup
      title={PROVIDER_LABELS[status.provider]}
      actions={
        <>
          <a
            href={DEV_PORTAL_URLS[status.provider]}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {t('social.settings.open_dev_portal')}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setGuideOpen(true)}
            title={t('social.wizard.button', { provider: PROVIDER_LABELS[status.provider] })}
            aria-label={t('social.wizard.button', { provider: PROVIDER_LABELS[status.provider] })}
          >
            <HugeiconsIcon icon={HelpCircleIcon} className="text-muted-foreground" />
          </Button>
        </>
      }
    >
      {guideOpen ? (
        <SocialConnectDialog
          status={status}
          accounts={accounts}
          onChanged={onChanged}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}

      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={Icon} className="text-primary" />
          {PROVIDER_LABELS[status.provider]}
        </div>

        {accounts.length === 0 && !configured ? (
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed text-primary"
            onClick={() => setGuideOpen(true)}
          >
            {t('social.wizard.cta', { provider: PROVIDER_LABELS[status.provider] })}
          </Button>
        ) : null}

        {accounts.length > 0 ? (
          <div className="flex flex-col gap-2">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {acc.provider === 'linkedin' &&
                    (acc.accountKind || 'member') === 'organization' ? (
                      <HugeiconsIcon icon={Building2Icon} className="shrink-0 text-primary" />
                    ) : null}
                    <span className="truncate text-sm">
                      {acc.displayName || acc.handle || acc.id}
                    </span>
                    {acc.provider === 'linkedin' ? (
                      <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">
                        {(acc.accountKind || 'member') === 'organization'
                          ? t('social.settings.account_kind_organization')
                          : t('social.settings.account_kind_member')}
                      </Badge>
                    ) : null}
                  </div>
                  {acc.handle && acc.displayName ? (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{acc.handle}</div>
                  ) : null}
                  {acc.status !== 'active' ? (
                    <div className="text-xs text-destructive">
                      {acc.lastError || t(`social.settings.status_${acc.status}`)}
                    </div>
                  ) : null}
                  {hasSocialCloud && acc.status === 'active' ? (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={Boolean(acc.cloudPublishing)}
                        disabled={cloudBusyId === acc.id}
                        onCheckedChange={(checked) => toggleCloudPublishing(acc.id, checked)}
                      />
                      <span>{t('social.settings.cloud_publishing')}</span>
                    </label>
                  ) : null}
                  {hasSocialCloud && acc.cloudPublishing ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t('social.settings.cloud_publishing_consent')}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {acc.status === 'active' ? (
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} className="text-success" />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    onClick={() => disconnect(acc.id)}
                    title={t('social.settings.disconnect')}
                    aria-label={t('social.settings.disconnect')}
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {status.provider === 'linkedin' && orgEnabled && linkedInMemberAccount ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start text-primary"
            onClick={() => syncLinkedInOrgs(linkedInMemberAccount.id)}
            disabled={syncingOrgs}
          >
            {syncingOrgs ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
            )}
            {syncingOrgs
              ? t('social.settings.linkedin_sync_orgs_busy')
              : t('social.settings.linkedin_sync_orgs')}
          </Button>
        ) : null}

        {status.provider === 'linkedin' ? (
          <div className="flex items-start gap-2 rounded-lg border bg-background px-3 py-2">
            <Checkbox
              aria-label={t('social.settings.linkedin_org_enabled')}
              checked={orgEnabled}
              onCheckedChange={() => toggleOrgEnabled()}
              disabled={saving}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium">
                {t('social.settings.linkedin_org_enabled')}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t('social.settings.linkedin_org_hint')}
              </span>
            </span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field className="min-w-0">
            <FieldLabel htmlFor={`social-client-id-${status.provider}`}>
              {t('social.settings.client_id')}
            </FieldLabel>
            <Input
              id={`social-client-id-${status.provider}`}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={t('social.settings.client_id_placeholder')}
              className="w-full min-w-0"
            />
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor={`social-client-secret-${status.provider}`}>
              {t('social.settings.client_secret')}
            </FieldLabel>
            <Input
              id={`social-client-secret-${status.provider}`}
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={
                status.hasClientSecret
                  ? t('social.settings.secret_saved')
                  : t('social.settings.client_secret_placeholder')
              }
              className="w-full min-w-0"
            />
          </Field>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon icon={Link02Icon} className="shrink-0" />
          <span className="truncate">
            {t('social.settings.redirect_uri')}: <code>{status.redirectUri}</code>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={copyRedirect}
            title={t('social.settings.copy')}
            aria-label={t('social.settings.copy')}
          >
            <HugeiconsIcon icon={CopyIcon} />
          </Button>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => saveConfig()}
            disabled={saving}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {saved ? t('social.settings.saved') : t('social.settings.save')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => connectOAuth()}
            disabled={connecting || !configured}
          >
            {connecting ? t('social.settings.connecting') : t('social.settings.connect_oauth')}
          </Button>
          {status.supportsManualToken ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowManual((v) => !v)}
            >
              <HugeiconsIcon icon={Key01Icon} data-icon="inline-start" />
              {t('social.settings.connect_token')}
            </Button>
          ) : null}
        </div>

        {showManual && status.supportsManualToken ? (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder={t('social.settings.token_placeholder')}
              aria-label={t('social.settings.token_placeholder')}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => connectToken()}
              disabled={connecting || !manualToken.trim()}
            >
              {t('social.settings.connect')}
            </Button>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t(`social.settings.hint_${status.provider}`)}
        </p>
      </div>
    </SettingsGroup>
  );
}
