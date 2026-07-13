
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

  const handleNextRef = useRef<() => void>(() => {});

  const handleNext = useCallback(async () => {
    if (subView === 'choice') {
      if (choice === 'local') {
        onComplete({ mode: 'local' });
        return;
      }
      if (choice === 'login') {
        setSubView('login');
        setError(null);
        return;
      }
      if (choice === 'register') {
        setSubView('register');
        setError(null);
        return;
      }
      return;
    }

    const isRegister = subView === 'register';
    const formNameValid = isRegister ? nameValid : true;

    if (!emailValid || !passwordValid || !formNameValid) {
      setTouched({ name: true, email: true, password: true });
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await window.electron.domeAuth.nativeLogin(
        email.trim(),
        password,
        isRegister,
        isRegister ? name.trim() : undefined,
      );
      if (!result.success) {
        setError(
          result.errorCode
            ? ERROR_CODE_TO_KEY[result.errorCode] ?? 'onboarding.account_error_generic'
            : 'onboarding.account_error_generic',
        );
        return;
      }
      if (result.pendingConfirmation) {
        setPendingConfirmation(true);
        return;
      }
      onComplete({
        mode: 'account',
        email: result.email ?? email.trim(),
        name: result.name ?? (isRegister ? name.trim() : undefined),
        hadRemoteData: Boolean(result.hadRemoteData),
        alreadyOnboarded: Boolean(result.alreadyOnboarded),
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
