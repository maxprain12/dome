import { HugeiconsIcon } from '@hugeicons/react';
import {
  CopyIcon as Copy,
  ExternalLinkIcon as ExternalLink,
  CheckmarkCircle02Icon as CheckCircle2,
  InformationCircleIcon as Info,
  Loading03Icon as Loader2,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  Key01Icon as KeyRound,
  CheckIcon as Check,
} from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
type SocialProvider = 'linkedin' | 'instagram' | 'x';

interface ProviderStatus {
  provider: SocialProvider;
  clientId: string;
  hasClientSecret: boolean;
  supportsManualToken: boolean;
  redirectUri: string;
  orgEnabled?: boolean;
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
  const [orgEnabled, setOrgEnabled] = useState(Boolean(status.orgEnabled));

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
    const payload: Record<string, string | boolean> = { provider, clientId: clientId.trim() };
    if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
    if (provider === 'linkedin') payload.orgEnabled = orgEnabled;
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
    <Dialog open onOpenChange={(next) => { if (!next) (onClose)(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><DialogTitle className="truncate">{t('social.wizard.title', { provider: PROVIDER_LABELS[provider] })}</DialogTitle>{t(`social.wizard.${provider}.intro`) ? <DialogDescription className="truncate">{t(`social.wizard.${provider}.intro`)}</DialogDescription> : null}</div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="flex flex-col gap-4 text-sm text-foreground">
        {/* Step indicator */}
        <ol className="flex items-center gap-1.5 flex-wrap">
          {STEP_IDS.map((id, i) => (
            <li key={id} className="flex items-center gap-1.5">
              <Button variant="ghost"
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-medium',
                  i === step && 'border bg-card',
                  i <= step ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[10px] font-semibold',
                    i < step ? 'bg-[var(--success)] text-white' : i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i < step ? <HugeiconsIcon icon={Check} className="size-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{t(`social.wizard.step_${id}`)}</span>
              </Button>
              {i < STEP_IDS.length - 1 && (
                <span className="w-3 h-px bg-border" />
              )}
            </li>
          ))}
        </ol>

        {/* Step body */}
        <div>
          <h3 className="text-sm font-semibold mb-1 text-foreground">
            {t(`social.wizard.${provider}.${stepId}.title`)}
          </h3>
          <p className="text-xs leading-relaxed mb-3 text-muted-foreground">
            {t(`social.wizard.${provider}.${stepId}.body`)}
          </p>

          {bullets.length > 0 && (
            <ul className="flex flex-col gap-1.5 mb-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs">
                  <HugeiconsIcon icon={CheckCircle2} className="size-3.5 mt-0.5 shrink-0 text-primary" />
                  <span className="text-foreground">{b}</span>
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
              className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <HugeiconsIcon icon={ExternalLink} className="size-3.5" />
              {t(stepId === 'create_app' ? 'social.wizard.open_create' : 'social.wizard.open_dashboard')}
            </a>
          )}

          {showRedirect && provider === 'linkedin' && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5">
              <Checkbox
                aria-label={t('social.settings.linkedin_org_enabled')}
                checked={orgEnabled}
                onCheckedChange={(next) => {
                  setOrgEnabled(next);
                  void window.electron.invoke('social:providers:set-config', { provider, orgEnabled: next });
                }}
                className="mt-0.5"
              />
              <span className="min-w-0 text-xs">
                <span className="font-medium block text-foreground">{t('social.settings.linkedin_org_enabled')}</span>
                <span className="block mt-0.5 text-muted-foreground">{t('social.settings.linkedin_org_hint')}</span>
              </span>
            </div>
          )}

          {/* Redirect URI copy box */}
          {showRedirect && (
            <div
              className="mb-3 rounded-lg border bg-card px-3 py-2.5"
            >
              <div className="text-xs font-medium mb-1 text-muted-foreground">
                {t('social.settings.redirect_uri')}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <code className="text-xs truncate flex-1">{status.redirectUri}</code>
                <Button variant="ghost"
                  type="button"
                  onClick={copyRedirect}
                  className="p-1.5 rounded-md hover:bg-accent shrink-0"
                  title={t('social.settings.copy')}
                >
                  <HugeiconsIcon icon={Copy} className="size-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          )}

          {/* Inline credentials */}
          {showCredentialInputs && (
            <div className="flex flex-col gap-2.5 mb-3">
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={t('social.settings.client_id')}
                className="w-full bg-card"
              />
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={status.hasClientSecret ? t('social.settings.secret_saved') : t('social.settings.client_secret')}
                className="w-full bg-card"
              />
              <Button variant="secondary"
  onClick={() => void saveCredentials()}
  disabled={saving}
  size="sm">
                {saving ? <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin" /> : saved ? <HugeiconsIcon icon={Check} className="size-3.5" /> : null}
                {saved ? t('social.settings.saved') : t('social.settings.save')}
              </Button>
            </div>
          )}

          {/* Connect actions */}
          {showConnect && (
            <div className="flex flex-col gap-3 mb-3">
              {done ? (
                <div
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm"
                >
                  <HugeiconsIcon icon={CheckCircle2} className="size-4 shrink-0 text-[var(--success)]" />
                  <span className="text-foreground">
                    {t('social.wizard.connected', {
                      account: activeAccount?.handle || activeAccount?.displayName || PROVIDER_LABELS[provider],
                    })}
                  </span>
                </div>
              ) : (
                <>
                  <Button onClick={() => void connectOAuth()}
  disabled={connecting || !credentialsReady}>
                    {connecting ? <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin" /> : null}
                    {connecting ? t('social.settings.connecting') : t('social.settings.connect_oauth')}
                  </Button>
                  {status.supportsManualToken && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={KeyRound} className="size-4 shrink-0 text-muted-foreground" />
                      <Input
                        type="password"
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                        placeholder={t('social.settings.token_placeholder')}
                        className="min-w-0 flex-1 bg-card"
                      />
                      <Button variant="secondary"
  onClick={() => void connectToken()}
  disabled={connecting || !manualToken.trim()}
  size="sm">
                        {t('social.settings.connect')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs mb-3 text-destructive">{error}</p>
          )}

          {/* Step notes */}
          {notes.length > 0 && (
            <div
              className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5"
            >
              {notes.map((note) => (
                <div key={note} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Info} className="size-3.5 mt-0.5 shrink-0 text-primary" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div><DialogFooter className="border-t px-4 py-3">{<div className="flex items-center justify-between w-full gap-2">
          <Button variant="ghost"
  onClick={() => setStep((s) => Math.max(0, s - 1))}
  disabled={step === 0}
  size="sm">
            <HugeiconsIcon icon={ChevronLeft} className="size-3.5" />
            {t('social.wizard.back')}
          </Button>
          {isLast ? (
            <Button onClick={onClose}
  size="sm">
              {done ? t('social.wizard.finish') : t('social.wizard.close')}
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => Math.min(STEP_IDS.length - 1, s + 1))}
  size="sm">
              {t('social.wizard.next')}
              <HugeiconsIcon icon={ChevronRight} className="size-3.5" />
            </Button>
          )}
        </div>}</DialogFooter></DialogContent></Dialog>
  );
}
