import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckIcon,
  CheckmarkCircle02Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  InformationCircleIcon,
  Key01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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

interface SocialConnectDialogProps {
  status: ProviderStatus;
  accounts: ConnectedAccount[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}

/** Whether OAuth connect can run — extracted for S3776. */
function isCredentialsReady(
  status: ProviderStatus,
  clientId: string,
  clientSecret: string,
): boolean {
  const hasId = Boolean(status.clientId || clientId.trim());
  if (!hasId) return false;
  if (status.provider === 'x') return true;
  return status.hasClientSecret || Boolean(clientSecret.trim());
}

/** Step rail buttons — extracted for S3776. */
function WizardStepRail({ step, onStepChange }: { step: number; onStepChange: (i: number) => void }) {
  const { t } = useTranslation();
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {STEP_IDS.map((id, i) => (
        <li key={id} className="flex items-center gap-1.5">
          <Button
            type="button"
            variant={i === step ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => onStepChange(i)}
            className={cn(
              'gap-1.5 rounded-full pl-1 pr-2.5 text-xs font-medium',
              i > step && 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-[10px] font-semibold',
                i < step
                  ? 'bg-success text-primary-foreground'
                  : i === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {i < step ? <HugeiconsIcon icon={CheckIcon} className="size-3" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{t(`social.wizard.step_${id}`)}</span>
          </Button>
          {i < STEP_IDS.length - 1 ? <span className="h-px w-3 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Title, body and bullet list for the active step — extracted for S3776. */
function WizardStepIntro({
  provider,
  stepId,
  bullets,
}: {
  provider: SocialProvider;
  stepId: StepId;
  bullets: string[];
}) {
  const { t } = useTranslation();
  return (
    <>
      <h3 className="mb-1 text-sm font-semibold">
        {t(`social.wizard.${provider}.${stepId}.title`)}
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        {t(`social.wizard.${provider}.${stepId}.body`)}
      </p>
      {bullets.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-1.5">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-xs">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                className="mt-0.5 shrink-0 text-primary"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Portal deep-link CTA for create/configure steps — extracted for S3776. */
function WizardPortalCta({ provider, stepId }: { provider: SocialProvider; stepId: StepId }) {
  const { t } = useTranslation();
  if (stepId !== 'create_app' && stepId !== 'configure') return null;
  const isCreate = stepId === 'create_app';
  return (
    <a
      href={isCreate ? PORTAL_LINKS[provider].create : PORTAL_LINKS[provider].dashboard}
      target="_blank"
      rel="noreferrer"
      className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
    >
      <HugeiconsIcon icon={ExternalLinkIcon} className="size-3.5" />
      {t(isCreate ? 'social.wizard.open_create' : 'social.wizard.open_dashboard')}
    </a>
  );
}

/** LinkedIn org-posting toggle (configure step only) — extracted for S3776. */
function WizardLinkedInOrgOption({
  provider,
  showRedirect,
  orgEnabled,
  onOrgEnabledChange,
}: {
  provider: SocialProvider;
  showRedirect: boolean;
  orgEnabled: boolean;
  onOrgEnabledChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  if (!showRedirect || provider !== 'linkedin') return null;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5">
      <Checkbox
        aria-label={t('social.settings.linkedin_org_enabled')}
        checked={orgEnabled}
        onCheckedChange={(next) => {
          onOrgEnabledChange(next);
        }}
        className="mt-0.5"
      />
      <span className="min-w-0 text-xs">
        <span className="block font-medium">{t('social.settings.linkedin_org_enabled')}</span>
        <span className="mt-0.5 block text-muted-foreground">
          {t('social.settings.linkedin_org_hint')}
        </span>
      </span>
    </div>
  );
}

/** Copyable redirect URI block — extracted for S3776. */
function WizardRedirectBlock({
  showRedirect,
  redirectUri,
  onCopy,
}: {
  showRedirect: boolean;
  redirectUri: string;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  if (!showRedirect) return null;
  return (
    <div className="mb-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {t('social.settings.redirect_uri')}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs">{redirectUri}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
          onClick={onCopy}
          title={t('social.settings.copy')}
          aria-label={t('social.settings.copy')}
        >
          <HugeiconsIcon icon={CopyIcon} />
        </Button>
      </div>
    </div>
  );
}

/** Client id/secret inputs + save — extracted for S3776. */
function WizardCredentialsStep({
  showCredentialInputs,
  clientId,
  clientSecret,
  hasClientSecret,
  saving,
  saved,
  onClientIdChange,
  onClientSecretChange,
  onSave,
}: {
  showCredentialInputs: boolean;
  clientId: string;
  clientSecret: string;
  hasClientSecret: boolean;
  saving: boolean;
  saved: boolean;
  onClientIdChange: (value: string) => void;
  onClientSecretChange: (value: string) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  if (!showCredentialInputs) return null;
  return (
    <div className="mb-3 flex flex-col gap-2.5">
      <Input
        value={clientId}
        onChange={(e) => onClientIdChange(e.target.value)}
        placeholder={t('social.settings.client_id')}
        aria-label={t('social.settings.client_id')}
        className="w-full"
      />
      <Input
        type="password"
        value={clientSecret}
        onChange={(e) => onClientSecretChange(e.target.value)}
        placeholder={
          hasClientSecret ? t('social.settings.secret_saved') : t('social.settings.client_secret')
        }
        aria-label={t('social.settings.client_secret')}
        className="w-full"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? (
          <Spinner data-icon="inline-start" />
        ) : saved ? (
          <HugeiconsIcon icon={CheckIcon} data-icon="inline-start" />
        ) : null}
        {saved ? t('social.settings.saved') : t('social.settings.save')}
      </Button>
    </div>
  );
}

/** OAuth / manual-token connect (or already-connected banner) — extracted for S3776. */
function WizardConnectStep({
  showConnect,
  done,
  provider,
  activeAccount,
  connecting,
  credentialsReady,
  supportsManualToken,
  manualToken,
  onManualTokenChange,
  onConnectOAuth,
  onConnectToken,
}: {
  showConnect: boolean;
  done: boolean;
  provider: SocialProvider;
  activeAccount: ConnectedAccount | null;
  connecting: boolean;
  credentialsReady: boolean;
  supportsManualToken: boolean;
  manualToken: string;
  onManualTokenChange: (value: string) => void;
  onConnectOAuth: () => void;
  onConnectToken: () => void;
}) {
  const { t } = useTranslation();
  if (!showConnect) return null;

  if (done) {
    return (
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="shrink-0 text-success" />
          <span>
            {t('social.wizard.connected', {
              account:
                activeAccount?.handle ||
                activeAccount?.displayName ||
                PROVIDER_LABELS[provider],
            })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-col gap-3">
      <Button type="button" onClick={onConnectOAuth} disabled={connecting || !credentialsReady}>
        {connecting ? <Spinner data-icon="inline-start" /> : null}
        {connecting ? t('social.settings.connecting') : t('social.settings.connect_oauth')}
      </Button>
      {supportsManualToken ? (
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Key01Icon} className="shrink-0 text-muted-foreground" />
          <Input
            type="password"
            value={manualToken}
            onChange={(e) => onManualTokenChange(e.target.value)}
            placeholder={t('social.settings.token_placeholder')}
            aria-label={t('social.settings.token_placeholder')}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onConnectToken}
            disabled={connecting || !manualToken.trim()}
          >
            {t('social.settings.connect')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Step footnote notes — extracted for S3776. */
function WizardNotesBlock({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5">
      {notes.map((note) => (
        <div key={note} className="flex items-start gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            className="mt-0.5 shrink-0 text-primary"
          />
          <span>{note}</span>
        </div>
      ))}
    </div>
  );
}

/** Back / next / finish footer — extracted for S3776. */
function WizardNavFooter({
  step,
  isLast,
  done,
  onBack,
  onNext,
  onClose,
}: {
  step: number;
  isLast: boolean;
  done: boolean;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={step === 0}>
        <HugeiconsIcon icon={ChevronLeftIcon} data-icon="inline-start" />
        {t('social.wizard.back')}
      </Button>
      {isLast ? (
        <Button type="button" size="sm" onClick={onClose}>
          {done ? t('social.wizard.finish') : t('social.wizard.close')}
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={onNext}>
          {t('social.wizard.next')}
          <HugeiconsIcon icon={ChevronRightIcon} data-icon="inline-end" />
        </Button>
      )}
    </div>
  );
}

/**
 * Guided onboarding to connect a social provider: portal deep links,
 * copyable redirect URI, inline credential saving and the actual connect
 * action — one five-step flow.
 */
export default function SocialConnectDialog({
  status,
  accounts,
  onChanged,
  onClose,
}: SocialConnectDialogProps) {
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
    const raw = t(`social.wizard.${provider}.${stepId}.notes`, {
      returnObjects: true,
      defaultValue: [],
    });
    return Array.isArray(raw) ? (raw as string[]) : [];
  }, [t, provider, stepId]);

  const copyRedirect = () => {
    const write = navigator.clipboard?.writeText(status.redirectUri);
    if (write) {
      write.catch(() => {});
    }
  };

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

  const handleOrgEnabledChange = (next: boolean) => {
    setOrgEnabled(next);
    window.electron
      .invoke('social:providers:set-config', { provider, orgEnabled: next })
      .catch(() => {});
  };

  const credentialsReady = isCredentialsReady(status, clientId, clientSecret);
  const showRedirect = stepId === 'configure';
  const showCredentialInputs = stepId === 'credentials';
  const showConnect = stepId === 'connect';
  const isLast = step === STEP_IDS.length - 1;
  const done = connectedNow || (showConnect && activeAccount !== null);

  return (
    <AppModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="xl">
        <AppModalHeader
          title={t('social.wizard.title', { provider: PROVIDER_LABELS[provider] })}
          description={t(`social.wizard.${provider}.intro`) || undefined}
        />
        <AppModalBody>
          <div className="flex flex-col gap-4 text-sm">
            <WizardStepRail step={step} onStepChange={setStep} />

            <div>
              <WizardStepIntro provider={provider} stepId={stepId} bullets={bullets} />
              <WizardPortalCta provider={provider} stepId={stepId} />
              <WizardLinkedInOrgOption
                provider={provider}
                showRedirect={showRedirect}
                orgEnabled={orgEnabled}
                onOrgEnabledChange={handleOrgEnabledChange}
              />
              <WizardRedirectBlock
                showRedirect={showRedirect}
                redirectUri={status.redirectUri}
                onCopy={copyRedirect}
              />
              <WizardCredentialsStep
                showCredentialInputs={showCredentialInputs}
                clientId={clientId}
                clientSecret={clientSecret}
                hasClientSecret={status.hasClientSecret}
                saving={saving}
                saved={saved}
                onClientIdChange={setClientId}
                onClientSecretChange={setClientSecret}
                onSave={() => {
                  saveCredentials().catch(() => {});
                }}
              />
              <WizardConnectStep
                showConnect={showConnect}
                done={done}
                provider={provider}
                activeAccount={activeAccount}
                connecting={connecting}
                credentialsReady={credentialsReady}
                supportsManualToken={status.supportsManualToken}
                manualToken={manualToken}
                onManualTokenChange={setManualToken}
                onConnectOAuth={() => {
                  connectOAuth().catch(() => {});
                }}
                onConnectToken={() => {
                  connectToken().catch(() => {});
                }}
              />
              {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}
              <WizardNotesBlock notes={notes} />
            </div>
          </div>
        </AppModalBody>

        <AppModalFooter>
          <WizardNavFooter
            step={step}
            isLast={isLast}
            done={done}
            onBack={() => setStep((s) => Math.max(0, s - 1))}
            onNext={() => setStep((s) => Math.min(STEP_IDS.length - 1, s + 1))}
            onClose={onClose}
          />
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
