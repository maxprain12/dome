import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy, ExternalLink, CheckCircle2, Info, Loader2, ChevronLeft, ChevronRight,
  KeyRound, Check,
} from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';

type SocialProvider = 'linkedin' | 'instagram' | 'x';

interface ProviderStatus {
  provider: SocialProvider;
  clientId: string;
  hasClientSecret: boolean;
  supportsManualToken: boolean;
  redirectUri: string;
}

interface ConnectedAccount {
  id: string;
  displayName: string | null;
  handle: string | null;
  status: string;
}

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X (Twitter)',
};

/** Deep links straight to the creation/config screens of each portal. */
const PORTAL_LINKS: Record<SocialProvider, { create: string; dashboard: string }> = {
  linkedin: {
    create: 'https://www.linkedin.com/developers/apps/new',
    dashboard: 'https://www.linkedin.com/developers/apps',
  },
  instagram: {
    create: 'https://developers.facebook.com/apps/creation/',
    dashboard: 'https://developers.facebook.com/apps',
  },
  x: {
    create: 'https://developer.x.com/en/portal/dashboard',
    dashboard: 'https://developer.x.com/en/portal/dashboard',
  },
};

type StepId = 'requirements' | 'create_app' | 'configure' | 'credentials' | 'connect';
const STEP_IDS: StepId[] = ['requirements', 'create_app', 'configure', 'credentials', 'connect'];

interface Props {
  status: ProviderStatus;
  accounts: ConnectedAccount[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}

/**
 * Guided onboarding to connect a social provider: portal deep links,
 * copyable redirect URI, inline credential saving and the actual connect
 * action — all inside one five-step flow.
 */
export default function SocialConnectWizard({ status, accounts, onChanged, onClose }: Props) {
  const { t } = useTranslation();
  const provider = status.provider;
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState(status.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectedNow, setConnectedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAccount = accounts.find((a) => a.status === 'active') ?? null;
  const stepId = STEP_IDS[step];

  const bullets = useMemo(() => {
    const raw = t(`social.wizard.${provider}.${stepId}.bullets`, { returnObjects: true });
    return Array.isArray(raw) ? (raw as string[]) : [];
  }, [t, provider, stepId]);

  const notes = useMemo(() => {
    const raw = t(`social.wizard.${provider}.${stepId}.notes`, { returnObjects: true, defaultValue: [] });
    return Array.isArray(raw) ? (raw as string[]) : [];
  }, [t, provider, stepId]);

  const copyRedirect = () => void navigator.clipboard?.writeText(status.redirectUri);

  const saveCredentials = async () => {
    setSaving(true);
    setError(null);
    const payload: Record<string, string> = { provider, clientId: clientId.trim() };
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
    const res = await window.electron.invoke('social:connect-oauth', { provider });
    setConnecting(false);
    if (!res?.success) {
      setError(res?.error || 'Error');
      return;
    }
    setConnectedNow(true);
    await onChanged();
  };

  const connectToken = async () => {
    if (!manualToken.trim()) return;
    setConnecting(true);
    setError(null);
    const res = await window.electron.invoke('social:connect-token', {
      provider,
      accessToken: manualToken.trim(),
    });
    setConnecting(false);
    if (!res?.success) {
      setError(res?.error || 'Error');
      return;
    }
    setManualToken('');
    setConnectedNow(true);
    await onChanged();
  };

  const credentialsReady =
    Boolean(status.clientId || clientId.trim()) &&
    (provider === 'x' || status.hasClientSecret || Boolean(clientSecret.trim()));

  const showRedirect = stepId === 'configure';
  const showCredentialInputs = stepId === 'credentials';
  const showConnect = stepId === 'connect';
  const isLast = step === STEP_IDS.length - 1;
  const done = connectedNow || (showConnect && activeAccount !== null);

  return (
    <DomeModal
      open
      onClose={onClose}
      title={t('social.wizard.title', { provider: PROVIDER_LABELS[provider] })}
      subtitle={t(`social.wizard.${provider}.intro`)}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <DomeButton variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="size-3.5" />
            {t('social.wizard.back')}
          </DomeButton>
          {isLast ? (
            <DomeButton variant="primary" size="sm" onClick={onClose}>
              {done ? t('social.wizard.finish') : t('social.wizard.close')}
            </DomeButton>
          ) : (
            <DomeButton variant="primary" size="sm" onClick={() => setStep((s) => Math.min(STEP_IDS.length - 1, s + 1))}>
              {t('social.wizard.next')}
              <ChevronRight className="size-3.5" />
            </DomeButton>
          )}
        </div>
      }
    >
      <div className="space-y-4 text-sm" style={{ color: 'var(--dome-text)' }}>
        {/* Step indicator */}
        <ol className="flex items-center gap-1.5 flex-wrap">
          {STEP_IDS.map((id, i) => (
            <li key={id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStep(i)}
                className="flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-xs font-medium"
                style={{
                  background: i === step ? 'var(--dome-bg-secondary)' : 'transparent',
                  border: `1px solid ${i === step ? 'var(--dome-border)' : 'transparent'}`,
                  color: i <= step ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                }}
              >
                <span
                  className="flex items-center justify-center size-5 rounded-full text-[10px] font-semibold"
                  style={{
                    background: i < step ? 'var(--success)' : i === step ? 'var(--dome-accent)' : 'var(--dome-bg-tertiary, var(--dome-bg-secondary))',
                    color: i <= step ? 'white' : 'var(--dome-text-muted)',
                  }}
                >
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{t(`social.wizard.step_${id}`)}</span>
              </button>
              {i < STEP_IDS.length - 1 && (
                <span className="w-3 h-px" style={{ background: 'var(--dome-border)' }} />
              )}
            </li>
          ))}
        </ol>

        {/* Step body */}
        <div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--dome-text)' }}>
            {t(`social.wizard.${provider}.${stepId}.title`)}
          </h3>
          <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--dome-text-muted)' }}>
            {t(`social.wizard.${provider}.${stepId}.body`)}
          </p>

          {bullets.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="size-3.5 mt-0.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />
                  <span style={{ color: 'var(--dome-text)' }}>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Portal deep link on the create/configure steps */}
          {(stepId === 'create_app' || stepId === 'configure') && (
            <a
              href={stepId === 'create_app' ? PORTAL_LINKS[provider].create : PORTAL_LINKS[provider].dashboard}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium mb-3"
              style={{ background: 'var(--dome-accent)', color: 'white' }}
            >
              <ExternalLink className="size-3.5" />
              {t(stepId === 'create_app' ? 'social.wizard.open_create' : 'social.wizard.open_dashboard')}
            </a>
          )}

          {/* Redirect URI copy box */}
          {showRedirect && (
            <div
              className="rounded-lg px-3 py-2.5 mb-3"
              style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
            >
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--dome-text-muted)' }}>
                {t('social.settings.redirect_uri')}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <code className="text-xs truncate flex-1">{status.redirectUri}</code>
                <button
                  type="button"
                  onClick={copyRedirect}
                  className="p-1.5 rounded-md hover:bg-[var(--dome-bg-hover)] shrink-0"
                  title={t('social.settings.copy')}
                >
                  <Copy className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                </button>
              </div>
            </div>
          )}

          {/* Inline credentials */}
          {showCredentialInputs && (
            <div className="space-y-2.5 mb-3">
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={t('social.settings.client_id')}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
              />
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={status.hasClientSecret ? t('social.settings.secret_saved') : t('social.settings.client_secret')}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
              />
              <DomeButton variant="secondary" size="sm" onClick={() => void saveCredentials()} disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
                {saved ? t('social.settings.saved') : t('social.settings.save')}
              </DomeButton>
            </div>
          )}

          {/* Connect actions */}
          {showConnect && (
            <div className="space-y-3 mb-3">
              {done ? (
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm"
                  style={{ background: 'var(--success-bg, var(--dome-bg-secondary))', border: '1px solid var(--dome-border)' }}
                >
                  <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
                  <span style={{ color: 'var(--dome-text)' }}>
                    {t('social.wizard.connected', {
                      account: activeAccount?.handle || activeAccount?.displayName || PROVIDER_LABELS[provider],
                    })}
                  </span>
                </div>
              ) : (
                <>
                  <DomeButton variant="primary" onClick={() => void connectOAuth()} disabled={connecting || !credentialsReady}>
                    {connecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {connecting ? t('social.settings.connecting') : t('social.settings.connect_oauth')}
                  </DomeButton>
                  {status.supportsManualToken && (
                    <div className="flex items-center gap-2">
                      <KeyRound className="size-4 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
                      <input
                        type="password"
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                        placeholder={t('social.settings.token_placeholder')}
                        className="flex-1 min-w-0 rounded-md px-3 py-2 text-sm"
                        style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
                      />
                      <DomeButton variant="secondary" size="sm" onClick={() => void connectToken()} disabled={connecting || !manualToken.trim()}>
                        {t('social.settings.connect')}
                      </DomeButton>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs mb-3" style={{ color: 'var(--dome-error)' }}>{error}</p>
          )}

          {/* Step notes */}
          {notes.length > 0 && (
            <div
              className="rounded-lg px-3 py-2.5 space-y-1.5"
              style={{ background: 'var(--dome-bg-secondary)', border: '1px solid var(--dome-border)' }}
            >
              {notes.map((note) => (
                <div key={note} className="flex items-start gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  <Info className="size-3.5 mt-0.5 shrink-0" style={{ color: 'var(--dome-accent)' }} />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DomeModal>
  );
}
