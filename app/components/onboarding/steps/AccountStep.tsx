
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, HardDrive, Mail, Lock, ArrowLeft } from 'lucide-react';
import { validateEmail } from '@/lib/utils/validation';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeCallout from '@/components/ui/DomeCallout';
import { ACCENT_END } from '@/lib/ui/accent';

type Choice = 'account' | 'local';
type SubView = 'choice' | 'form';
type AuthMode = 'login' | 'register';

interface AccountStepProps {
  onComplete: (data: { mode: Choice; email?: string }) => void;
  onValidationChange?: (isValid: boolean) => void;
}

const ERROR_CODE_TO_KEY: Record<string, string> = {
  invalid_credentials: 'onboarding.account_error_invalid_credentials',
  email_taken: 'onboarding.account_error_email_taken',
  weak_password: 'onboarding.account_error_weak_password',
  network_error: 'onboarding.account_error_network',
  exchange_failed: 'onboarding.account_error_provider_unreachable',
  supabase_not_configured: 'onboarding.account_error_not_configured',
};

const MIN_PASSWORD_LENGTH = 8;

export default function AccountStep({ onComplete, onValidationChange }: AccountStepProps) {
  const { t } = useTranslation();
  const [subView, setSubView] = useState<SubView>('choice');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const emailValid = validateEmail(email);
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;

  const canProceed =
    subView === 'choice'
      ? choice !== null
      : emailValid && passwordValid && !isSubmitting && !pendingConfirmation;

  useEffect(() => {
    onValidationChange?.(canProceed);
  }, [canProceed, onValidationChange]);

  const handleNextRef = useRef<() => void>(() => {});

  const handleNext = useCallback(async () => {
    if (subView === 'choice') {
      if (choice === 'local') {
        onComplete({ mode: 'local' });
        return;
      }
      if (choice === 'account') {
        setSubView('form');
      }
      return;
    }

    if (!emailValid || !passwordValid) {
      setTouched({ email: true, password: true });
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await window.electron.domeAuth.nativeLogin(
        email.trim(),
        password,
        authMode === 'register',
      );
      if (!result.success) {
        setError(result.errorCode ? ERROR_CODE_TO_KEY[result.errorCode] ?? 'onboarding.account_error_generic' : 'onboarding.account_error_generic');
        return;
      }
      if (result.pendingConfirmation) {
        setPendingConfirmation(true);
        return;
      }
      onComplete({ mode: 'account', email: email.trim() });
    } catch {
      setError('onboarding.account_error_generic');
    } finally {
      setIsSubmitting(false);
    }
  }, [subView, choice, emailValid, passwordValid, email, password, authMode, onComplete]);

  handleNextRef.current = handleNext;

  useEffect(() => {
    const handler = () => void handleNextRef.current();
    window.addEventListener('onboarding:account-validate', handler);
    return () => window.removeEventListener('onboarding:account-validate', handler);
  }, []);

  if (subView === 'choice') {
    return (
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => setChoice('account')}
          className="flex items-start gap-3 rounded-xl p-3.5 text-left transition-all"
          style={{
            background: choice === 'account' ? 'var(--dome-accent-subtle, rgba(101,93,197,0.12))' : 'var(--dome-surface)',
            border: `1px solid ${choice === 'account' ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
          }}
        >
          <div
            className="size-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, var(--dome-accent) 0%, ${ACCENT_END} 100%)` }}
          >
            <LogIn className="size-4" style={{ color: 'var(--base-text)' }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--dome-text)' }}>
              {t('onboarding.account_login_title')}
            </p>
            <p className="text-xs leading-snug mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
              {t('onboarding.account_login_subtitle')}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setChoice('local')}
          className="flex items-start gap-3 rounded-xl p-3.5 text-left transition-all"
          style={{
            background: choice === 'local' ? 'var(--dome-accent-subtle, rgba(101,93,197,0.12))' : 'var(--dome-surface)',
            border: `1px solid ${choice === 'local' ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
          }}
        >
          <div
            className="size-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--dome-bg-hover)' }}
          >
            <HardDrive className="size-4" style={{ color: 'var(--dome-text-muted)' }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--dome-text)' }}>
              {t('onboarding.account_local_title')}
            </p>
            <p className="text-xs leading-snug mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
              {t('onboarding.account_local_subtitle')}
            </p>
          </div>
        </button>
      </div>
    );
  }

  if (pendingConfirmation) {
    return (
      <div className="flex flex-col gap-4">
        <DomeCallout tone="info">{t('onboarding.account_pending_confirmation')}</DomeCallout>
        <button
          type="button"
          onClick={() => {
            setPendingConfirmation(false);
            setSubView('choice');
            setChoice('local');
          }}
          className="flex items-center gap-1.5 text-xs w-fit"
          style={{ color: 'var(--dome-text-muted)' }}
        >
          <ArrowLeft className="size-3.5" />
          {t('onboarding.account_back_to_choice')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => {
          setSubView('choice');
          setError(null);
        }}
        className="flex items-center gap-1.5 text-xs w-fit"
        style={{ color: 'var(--dome-text-muted)' }}
      >
        <ArrowLeft className="size-3.5" />
        {t('onboarding.account_back_to_choice')}
      </button>

      {error ? <DomeCallout tone="error">{t(error)}</DomeCallout> : null}

      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10" style={{ color: 'var(--dome-text-muted)' }}>
            <Mail className="size-4" />
          </span>
          <DomeInput
            id="account-email"
            type="text"
            inputMode="email"
            autoComplete="email"
            label={t('onboarding.account_email_label')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            error={touched.email && !emailValid ? t('onboarding.email_invalid') : undefined}
            inputClassName="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10" style={{ color: 'var(--dome-text-muted)' }}>
            <Lock className="size-4" />
          </span>
          <DomeInput
            id="account-password"
            type="password"
            autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
            label={t('onboarding.account_password_label')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
            error={touched.password && !passwordValid ? t('onboarding.password_min_length') : undefined}
            inputClassName="pl-9"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
        className="text-xs text-left w-fit"
        style={{ color: 'var(--dome-accent)' }}
      >
        {authMode === 'login'
          ? t('onboarding.account_toggle_to_register')
          : t('onboarding.account_toggle_to_login')}
      </button>
    </div>
  );
}
