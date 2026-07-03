import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Share2, Linkedin, Instagram, Twitter, Trash2, Loader2, CheckCircle2,
  AlertTriangle, Copy, KeyRound, Link2, HelpCircle,
} from 'lucide-react';
import SettingsPanel from '@/components/settings/SettingsPanel';
import SocialConnectWizard from '@/components/settings/SocialConnectWizard';

type SocialProvider = 'linkedin' | 'instagram' | 'x';

interface ProviderStatus {
  provider: SocialProvider;
  clientId: string;
  hasClientSecret: boolean;
  supportsManualToken: boolean;
  requiresMedia: boolean;
  redirectUri: string;
}

interface SocialAccount {
  id: string;
  provider: SocialProvider;
  displayName: string | null;
  handle: string | null;
  status: 'active' | 'error' | 'expired';
  lastError: string | null;
  connectedAt: number | null;
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
        <Share2 className="size-5" style={{ color: 'var(--dome-accent)' }} />
        <h1 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
          {t('social.settings.title')}
        </h1>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--dome-text-muted)' }}>
        {t('social.settings.description')}
      </p>

      {!encryptionAvailable && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-xs"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}
        >
          <AlertTriangle className="size-4 shrink-0" />
          {t('social.settings.no_encryption')}
        </div>
      )}
      {error && (
        <div className="text-xs mb-4" style={{ color: 'var(--dome-error)' }}>{error}</div>
      )}

      <div className="space-y-4">
        {providers.map((p) => (
          <ProviderCard
            key={p.provider}
            status={p}
            accounts={accounts.filter((a) => a.provider === p.provider)}
            onChanged={load}
          />
        ))}
      </div>

      <div
        className="mt-6 rounded-lg px-4 py-3"
        style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
      >
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--dome-text)' }}>
          {t('social.settings.oauth_port')}
        </div>
        <p className="text-xs mb-2" style={{ color: 'var(--dome-text-muted)' }}>
          {t('social.settings.oauth_port_hint')}
        </p>
        <input
          type="number"
          value={oauthPort}
          onChange={(e) => setOauthPort(Number(e.target.value) || 8737)}
          onBlur={() => void savePort(oauthPort)}
          className="w-32 rounded-md px-3 py-2 text-sm"
          style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
        />
      </div>
    </SettingsPanel>
  );
}

function ProviderCard({
  status,
  accounts,
  onChanged,
}: {
  status: ProviderStatus;
  accounts: SocialAccount[];
  onChanged: () => Promise<void>;
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

  useEffect(() => setClientId(status.clientId), [status.clientId]);

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const payload: Record<string, string> = { provider: status.provider, clientId: clientId.trim() };
    if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
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

  const disconnect = async (accountId: string) => {
    await window.electron.invoke('social:disconnect', { accountId });
    await onChanged();
  };

  const copyRedirect = () => {
    void navigator.clipboard?.writeText(status.redirectUri);
  };

  const configured = Boolean(clientId.trim()) && (status.provider === 'x' || status.hasClientSecret || Boolean(clientSecret.trim()));

  return (
    <div
      className="rounded-lg px-4 py-4 space-y-3"
      style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4" style={{ color: 'var(--dome-accent)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
            {PROVIDER_LABELS[status.provider]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={DEV_PORTAL_URLS[status.provider]}
            target="_blank"
            rel="noreferrer"
            className="text-xs hover:underline"
            style={{ color: 'var(--dome-accent)' }}
          >
            {t('social.settings.open_dev_portal')}
          </a>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)]"
            title={t('social.wizard.button', { provider: PROVIDER_LABELS[status.provider] })}
            aria-label={t('social.wizard.button', { provider: PROVIDER_LABELS[status.provider] })}
          >
            <HelpCircle className="size-4" style={{ color: 'var(--dome-text-muted)' }} />
          </button>
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
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="w-full rounded-md px-3 py-2 text-xs font-medium text-center"
          style={{ background: 'var(--dome-bg)', border: '1px dashed var(--dome-border)', color: 'var(--dome-accent)' }}
        >
          {t('social.wizard.cta', { provider: PROVIDER_LABELS[status.provider] })}
        </button>
      )}

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between gap-2 rounded-md px-3 py-2"
              style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
            >
              <div className="min-w-0">
                <div className="text-sm truncate" style={{ color: 'var(--dome-text)' }}>
                  {acc.displayName || acc.handle || acc.id}
                  {acc.handle && acc.displayName ? (
                    <span className="ml-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>{acc.handle}</span>
                  ) : null}
                </div>
                {acc.status !== 'active' && (
                  <div className="text-xs" style={{ color: 'var(--dome-error)' }}>
                    {acc.lastError || t(`social.settings.status_${acc.status}`)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {acc.status === 'active' && (
                  <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
                )}
                <button
                  type="button"
                  onClick={() => void disconnect(acc.id)}
                  className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)]"
                  title={t('social.settings.disconnect')}
                >
                  <Trash2 className="size-4" style={{ color: 'var(--dome-error)' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* App credentials */}
      <div className="settings-field-grid settings-field-grid--2 gap-3">
        <label className="block min-w-0">
          <span className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
            {t('social.settings.client_id')}
          </span>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={t('social.settings.client_id_placeholder')}
            className="mt-1 w-full min-w-0 rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
            {t('social.settings.client_secret')}
          </span>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={status.hasClientSecret ? t('social.settings.secret_saved') : t('social.settings.client_secret_placeholder')}
            className="mt-1 w-full min-w-0 rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          />
        </label>
      </div>

      {/* Redirect URI helper */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
        <Link2 className="size-3.5 shrink-0" />
        <span className="truncate">
          {t('social.settings.redirect_uri')}: <code>{status.redirectUri}</code>
        </span>
        <button
          type="button"
          onClick={copyRedirect}
          className="p-1 rounded hover:bg-[var(--dome-bg-hover)]"
          title={t('social.settings.copy')}
        >
          <Copy className="size-3.5" />
        </button>
      </div>

      {error && <div className="text-xs" style={{ color: 'var(--dome-error)' }}>{error}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void saveConfig()}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin inline" /> : saved ? t('social.settings.saved') : t('social.settings.save')}
        </button>
        <button
          type="button"
          onClick={() => void connectOAuth()}
          disabled={connecting || !configured}
          className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: 'var(--dome-accent)', color: 'white' }}
        >
          {connecting
            ? t('social.settings.connecting')
            : t('social.settings.connect_oauth')}
        </button>
        {status.supportsManualToken && (
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ background: 'transparent', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
          >
            <KeyRound className="size-3.5" />
            {t('social.settings.connect_token')}
          </button>
        )}
      </div>

      {showManual && status.supportsManualToken && (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder={t('social.settings.token_placeholder')}
            className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
          />
          <button
            type="button"
            onClick={() => void connectToken()}
            disabled={connecting || !manualToken.trim()}
            className="rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
            style={{ background: 'var(--dome-accent)', color: 'white' }}
          >
            {t('social.settings.connect')}
          </button>
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
        {t(`social.settings.hint_${status.provider}`)}
      </p>
    </div>
  );
}
