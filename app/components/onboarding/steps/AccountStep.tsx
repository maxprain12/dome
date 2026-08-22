
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, InformationCircleIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { validateEmail, validateName } from '@/lib/utils/validation';
import AccountChoiceView, { type AccountChoice } from './account/AccountChoiceView';
import DomeLoginView from './account/DomeLoginView';
import DomeRegisterView from './account/DomeRegisterView';

import { Alert, AlertDescription } from '@/components/ui/alert';
type SubView = 'choice' | 'login' | 'register';

interface AccountStepProps {
  onComplete: (data: {
    mode: 'account' | 'local';
    email?: string;
    name?: string;
    hadRemoteData?: boolean;
    alreadyOnboarded?: boolean;
  }) => void;
  onValidationChange?: (isValid: boolean) => void;
  onSubViewChange?: (subView: SubView) => void;
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

type AccountComplete = AccountStepProps['onComplete'];
type NativeLoginResult = Awaited<ReturnType<NonNullable<typeof window.electron>['domeAuth']['nativeLogin']>>;

/** Map native-login error codes to i18n keys — extracted for S3776. */
function accountAuthErrorKey(errorCode: string | undefined): string {
  if (!errorCode) return 'onboarding.account_error_generic';
  return ERROR_CODE_TO_KEY[errorCode] ?? 'onboarding.account_error_generic';
}

/**
 * Choice-view "Next": local complete or switch to login/register.
 * Extracted so `handleNext` stays under Sonar S3776.
 */
function applyAccountChoice(
  choice: AccountChoice | null,
  onComplete: AccountComplete,
  goToAuthSubView: (view: 'login' | 'register') => void,
): void {
  if (choice === 'local') {
    onComplete({ mode: 'local' });
    return;
  }
  if (choice === 'login' || choice === 'register') {
    goToAuthSubView(choice);
  }
}

/**
 * Apply nativeLogin success / pending / error without nesting in `handleNext`.
 * Extracted for S3776.
 */
function applyNativeLoginResult(
  result: NativeLoginResult,
  opts: {
    trimmedEmail: string;
    trimmedName: string;
    isRegister: boolean;
    onComplete: AccountComplete;
    setError: (key: string) => void;
    setPendingConfirmation: (value: boolean) => void;
  },
): void {
  if (!result.success) {
    opts.setError(accountAuthErrorKey(result.errorCode));
    return;
  }
  if (result.pendingConfirmation) {
    opts.setPendingConfirmation(true);
    return;
  }
  opts.onComplete({
    mode: 'account',
    email: result.email ?? opts.trimmedEmail,
    name: result.name ?? (opts.isRegister ? opts.trimmedName : undefined),
    hadRemoteData: Boolean(result.hadRemoteData),
    alreadyOnboarded: Boolean(result.alreadyOnboarded),
  });
}

export default function AccountStep({ onComplete, onValidationChange, onSubViewChange }: AccountStepProps) {
  const { t } = useTranslation();
  const [subView, setSubView] = useState<SubView>('choice');
  const [choice, setChoice] = useState<AccountChoice | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean; password?: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  const emailValid = validateEmail(email);
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const nameValid = validateName(name);

  const canProceed =
    subView === 'choice'
      ? choice !== null
      : subView === 'login'
        ? emailValid && passwordValid && !isSubmitting && !pendingConfirmation
        : emailValid && passwordValid && nameValid && !isSubmitting && !pendingConfirmation;

  useEffect(() => {
    onValidationChange?.(canProceed);
  }, [canProceed, onValidationChange]);

  useEffect(() => {
    onSubViewChange?.(subView);
  }, [subView, onSubViewChange]);

  const handleNextRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const handleNext = useCallback(async () => {
    if (subView === 'choice') {
      applyAccountChoice(choice, onComplete, (view) => {
        setSubView(view);
        setError(null);
      });
      return;
    }

    const isRegister = subView === 'register';
    if (!emailValid || !passwordValid || (isRegister && !nameValid)) {
      setTouched({ name: true, email: true, password: true });
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await window.electron.domeAuth.nativeLogin(
        trimmedEmail,
        password,
        isRegister,
        isRegister ? trimmedName : undefined,
      );
      applyNativeLoginResult(result, {
        trimmedEmail,
        trimmedName,
        isRegister,
        onComplete,
        setError,
        setPendingConfirmation,
      });
    } catch {
      setError('onboarding.account_error_generic');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    subView,
    choice,
    emailValid,
    passwordValid,
    nameValid,
    email,
    password,
    name,
    onComplete,
  ]);

  handleNextRef.current = handleNext;

  const handleBackToChoice = useCallback(() => {
    setSubView('choice');
    setError(null);
    setTouched({});
  }, []);

  useEffect(() => {
    const validateHandler = () => void handleNextRef.current();
    const backHandler = () => handleBackToChoice();
    window.addEventListener('onboarding:account-validate', validateHandler);
    window.addEventListener('onboarding:account-back', backHandler);
    return () => {
      window.removeEventListener('onboarding:account-validate', validateHandler);
      window.removeEventListener('onboarding:account-back', backHandler);
    };
  }, [handleBackToChoice]);

  if (pendingConfirmation) {
    return (
      <div className="flex flex-col gap-4">
        <Alert role="note"><HugeiconsIcon icon={InformationCircleIcon} aria-hidden /><AlertDescription className="text-xs">{t('onboarding.account_pending_confirmation')}</AlertDescription></Alert>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPendingConfirmation(false);
            setSubView('choice');
            setChoice('local');
          }}
          className="w-fit text-xs text-muted-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
          {t('onboarding.account_back_to_choice')}
        </Button>
      </div>
    );
  }

  if (subView === 'choice') {
    return <AccountChoiceView choice={choice} onChoiceChange={setChoice} />;
  }

  if (subView === 'login') {
    return (
      <DomeLoginView
        email={email}
        password={password}
        touched={touched}
        emailValid={emailValid}
        passwordValid={passwordValid}
        error={error}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onEmailBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
        onPasswordBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
        onSwitchToRegister={() => {
          setSubView('register');
          setError(null);
        }}
      />
    );
  }

  return (
    <DomeRegisterView
      name={name}
      email={email}
      password={password}
      touched={touched}
      nameValid={nameValid}
      emailValid={emailValid}
      passwordValid={passwordValid}
      error={error}
      isSubmitting={isSubmitting}
      onNameChange={setName}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onNameBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
      onEmailBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
      onPasswordBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
      onSwitchToLogin={() => {
        setSubView('login');
        setError(null);
      }}
    />
  );
}
