import { HugeiconsIcon } from '@hugeicons/react';
import {
  Share08Icon as Share2,
  Linkedin01Icon as Linkedin,
  InstagramIcon as Instagram,
  TwitterIcon as Twitter,
  Delete02Icon as Trash2,
  Loading03Icon as Loader2,
  CheckmarkCircle02Icon as CheckCircle2,
  Alert02Icon as AlertTriangle,
  CopyIcon as Copy,
  Key01Icon as KeyRound,
  Link02Icon as Link2,
  HelpCircleIcon as HelpCircle,
  Building2Icon as Building2,
  RefreshIcon as RefreshCw,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

import SettingsPanel from '@/components/settings/SettingsPanel';
import SocialConnectWizard from '@/components/settings/SocialConnectWizard';
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

const PROVIDER_ICONS: Record<SocialProvider, typeof Linkedin> = {
  linkedin: Linkedin,
  instagram: Instagram,
  x: Twitter,
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

export default function SocialSettings() {
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

  useEffect(() => {
    void load();
    const unsub = window.electron?.on?.('social:account-updated', () => void load());
    return () => unsub?.();
  }, [load]);

  const savePort = async (port: number) => {
    setError(null);
    const res = await window.electron.invoke('social:oauth:set-port', { port });
    if (!res?.success) setError(res?.error || 'Error');
    await load();
  };

  return (
    <SettingsPanel>
      <div className="flex items-center gap-2 mb-1">
        <HugeiconsIcon icon={Share2} className="size-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">
          {t('social.settings.title')}
        </h1>
      </div>
      <p className="text-sm mb-6 text-muted-foreground">
        {t('social.settings.description')}
      </p>

      {!encryptionAvailable && (
        <div
          className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning-text)]"
        >
          <HugeiconsIcon icon={AlertTriangle} className="size-4 shrink-0" />
          {t('social.settings.no_encryption')}
        </div>
      )}
      {error && (
        <div className="text-xs mb-4 text-destructive">{error}</div>
      )}

      <div className="flex flex-col gap-4">
        {providers.map((p) => (
          <ProviderCard
            key={p.provider}
            status={p}
            accounts={accounts.filter((a) => a.provider === p.provider)}
            onChanged={load}
            hasSocialCloud={cloudEntitlements.hasSocialCloud}
          />
        ))}
      </div>

      <div
        className="mt-6 rounded-lg border bg-card px-4 py-3"
      >
        <div className="text-sm font-medium mb-1 text-foreground">
          {t('social.settings.oauth_port')}
        </div>
        <p className="text-xs mb-2 text-muted-foreground">
          {t('social.settings.oauth_port_hint')}
        </p>
        <Input
          type="number"
          value={oauthPort}
          onChange={(e) => setOauthPort(Number(e.target.value) || 8737)}
          onBlur={() => void savePort(oauthPort)}
          className="w-32"
        />
      </div>
    </SettingsPanel>
  );
}

function ProviderCard({
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
    const payload: Record<string, string | boolean> = { provider: status.provider, clientId: clientId.trim() };
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
    const res = await window.electron.invoke('social:connect-oauth', { provider: status.provider });
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

  const copyRedirect = () => {
    void navigator.clipboard?.writeText(status.redirectUri);
  };

  const configured = Boolean(clientId.trim()) && (status.provider === 'x' || status.hasClientSecret || Boolean(clientSecret.trim()));

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Icon} className="size-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {PROVIDER_LABELS[status.provider]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={DEV_PORTAL_URLS[status.provider]}
            target="_blank"
            rel="noreferrer"
            className="text-xs hover:underline text-primary"
          >
            {t('social.settings.open_dev_portal')}
          </a>
          <Button variant="ghost"
            type="button"
            onClick={() => setGuideOpen(true)}
            className="p-1.5 rounded-md hover:bg-accent"
            title={t('social.wizard.button', { provider: PROVIDER_LABELS[status.provider] })}
            aria-label={t('social.wizard.button', { provider: PROVIDER_LABELS[status.provider] })}
          >
            <HugeiconsIcon icon={HelpCircle} className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {guideOpen && (
        <SocialConnectWizard
          status={status}
          accounts={accounts}
          onChanged={onChanged}
          onClose={() => setGuideOpen(false)}
        />
      )}

      {/* Not configured yet → prominent guided-setup CTA */}
      {accounts.length === 0 && !configured && (
        <Button variant="ghost"
          type="button"
          onClick={() => setGuideOpen(true)}
          className="w-full rounded-md border-dashed bg-background px-3 py-2 text-center text-xs font-medium text-primary"
        >
          {t('social.wizard.cta', { provider: PROVIDER_LABELS[status.provider] })}
        </Button>
      )}

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="flex flex-col gap-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  {acc.provider === 'linkedin' && (acc.accountKind || 'member') === 'organization' && (
                    <HugeiconsIcon icon={Building2} className="size-3.5 shrink-0 text-primary" />
                  )}
                  <div className="text-sm truncate text-foreground">
                    {acc.displayName || acc.handle || acc.id}
                  </div>
                  {acc.provider === 'linkedin' && (
                    <span
                      className="shrink-0 rounded-full border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {(acc.accountKind || 'member') === 'organization'
                        ? t('social.settings.account_kind_organization')
                        : t('social.settings.account_kind_member')}
                    </span>
                  )}
                </div>
                {acc.handle && acc.displayName && (
                  <div className="text-xs truncate mt-0.5 text-muted-foreground">{acc.handle}</div>
                )}
                {acc.status !== 'active' && (
                  <div className="text-xs text-destructive">
                    {acc.lastError || t(`social.settings.status_${acc.status}`)}
                  </div>
                )}
                {hasSocialCloud && acc.status === 'active' && (
                  <label className="mt-2 flex items-center gap-2 text-xs cursor-pointer text-muted-foreground">
                    <Checkbox
                      checked={Boolean(acc.cloudPublishing)}
                      disabled={cloudBusyId === acc.id}
                      onCheckedChange={(checked) => void toggleCloudPublishing(acc.id, checked)}
                    />
                    <span>{t('social.settings.cloud_publishing')}</span>
                  </label>
                )}
                {hasSocialCloud && acc.cloudPublishing && (
                  <p className="text-[10px] mt-1 text-muted-foreground">
                    {t('social.settings.cloud_publishing_consent')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {acc.status === 'active' && (
                  <HugeiconsIcon icon={CheckCircle2} className="size-4 text-[var(--success)]" />
                )}
                <Button variant="ghost"
                  type="button"
                  onClick={() => void disconnect(acc.id)}
                  className="p-1.5 rounded-md hover:bg-accent"
                  title={t('social.settings.disconnect')}
                >
                  <HugeiconsIcon icon={Trash2} className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {status.provider === 'linkedin' && orgEnabled && linkedInMemberAccount && (
        <Button variant="ghost"
          type="button"
          onClick={() => void syncLinkedInOrgs(linkedInMemberAccount.id)}
          disabled={syncingOrgs}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-primary"
        >
          <HugeiconsIcon icon={RefreshCw} className={`size-3.5 ${syncingOrgs ? 'animate-spin' : ''}`} />
          {syncingOrgs ? t('social.settings.linkedin_sync_orgs_busy') : t('social.settings.linkedin_sync_orgs')}
        </Button>
      )}

      {status.provider === 'linkedin' && (
        <div className="flex items-start gap-2 rounded-md border bg-background px-3 py-2">
          <Checkbox
            aria-label={t('social.settings.linkedin_org_enabled')}
            checked={orgEnabled}
            onCheckedChange={() => void toggleOrgEnabled()}
            disabled={saving}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="text-xs font-medium block text-foreground">
              {t('social.settings.linkedin_org_enabled')}
            </span>
            <span className="text-xs block mt-0.5 text-muted-foreground">
              {t('social.settings.linkedin_org_hint')}
            </span>
          </span>
        </div>
      )}

      {/* App credentials */}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="text-xs font-medium text-muted-foreground">
            {t('social.settings.client_id')}
          </span>
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={t('social.settings.client_id_placeholder')}
            className="mt-1 w-full min-w-0"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-medium text-muted-foreground">
            {t('social.settings.client_secret')}
          </span>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={status.hasClientSecret ? t('social.settings.secret_saved') : t('social.settings.client_secret_placeholder')}
            className="mt-1 w-full min-w-0"
          />
        </label>
      </div>

      {/* Redirect URI helper */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon icon={Link2} className="size-3.5 shrink-0" />
        <span className="truncate">
          {t('social.settings.redirect_uri')}: <code>{status.redirectUri}</code>
        </span>
        <Button variant="outline"
          type="button"
          onClick={copyRedirect}
          className="p-1 rounded hover:bg-accent"
          title={t('social.settings.copy')}
        >
          <HugeiconsIcon icon={Copy} className="size-3.5" />
        </Button>
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost"
          type="button"
          onClick={() => void saveConfig()}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-xs font-medium"
        >
          {saving ? <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin inline" /> : saved ? t('social.settings.saved') : t('social.settings.save')}
        </Button>
        <Button
          type="button"
          onClick={() => void connectOAuth()}
          disabled={connecting || !configured}
          className="rounded-md px-3 py-1.5 text-xs font-medium"
        >
          {connecting
            ? t('social.settings.connecting')
            : t('social.settings.connect_oauth')}
        </Button>
        {status.supportsManualToken && (
          <Button variant="outline"
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <HugeiconsIcon icon={KeyRound} className="size-3.5" />
            {t('social.settings.connect_token')}
          </Button>
        )}
      </div>

      {showManual && status.supportsManualToken && (
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder={t('social.settings.token_placeholder')}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            onClick={() => void connectToken()}
            disabled={connecting || !manualToken.trim()}
            className="rounded-md px-3 py-2 text-xs font-medium"
          >
            {t('social.settings.connect')}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t(`social.settings.hint_${status.provider}`)}
      </p>
    </div>
  );
}
