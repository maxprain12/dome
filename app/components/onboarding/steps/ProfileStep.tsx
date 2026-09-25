import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { validateEmail, validateName } from '@/lib/utils/validation';
import type { OnboardingProgress } from '@/lib/onboarding/useOnboardingFlow';
import OnboardingStep from '../OnboardingStep';

interface ProfileStepProps {
  progress: OnboardingProgress;
  initialName: string;
  initialEmail: string;
  onNext: (data: { name: string; email: string }) => void;
  onBack?: () => void;
}

function initialsOf(name: string): string | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function ProfileStep({ progress, initialName, initialEmail, onNext, onBack }: ProfileStepProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});

  const nameValid = validateName(name);
  const emailValid = validateEmail(email);
  const nameError = touched.name && !nameValid ? t('onboarding.name_min_length') : undefined;
  const emailError = touched.email && !emailValid ? t('onboarding.email_invalid') : undefined;
  const initials = initialsOf(name);

  const submit = () => {
    if (!nameValid || !emailValid) {
      setTouched({ name: true, email: true });
      return;
    }
    onNext({ name: name.trim(), email: email.trim() });
  };

  return (
    <OnboardingStep
      message={t('onboarding.profile_message')}
      progress={progress}
      onNext={submit}
      onBack={onBack}
      canProceed={nameValid && emailValid}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
            {initials ?? '·'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name.trim() || t('onboarding.your_name')}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{email.trim() || t('onboarding.your_email')}</p>
          </div>
        </div>

        <Field data-invalid={Boolean(nameError)}>
          <FieldLabel htmlFor="profile-name">{t('onboarding.full_name')}</FieldLabel>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
            placeholder={t('onboarding.full_name_placeholder')}
            autoComplete="name"
            aria-invalid={Boolean(nameError) || undefined}
          />
          <FieldError className="text-xs">{nameError}</FieldError>
        </Field>

        <Field data-invalid={Boolean(emailError)}>
          <FieldLabel htmlFor="profile-email">{t('onboarding.email_address')}</FieldLabel>
          <Input
            id="profile-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            placeholder={t('onboarding.email_placeholder')}
            aria-invalid={Boolean(emailError) || undefined}
          />
          <FieldError className="text-xs">{emailError}</FieldError>
        </Field>

        <p className="text-xs text-muted-foreground">{t('onboarding.privacy_note')}</p>
      </div>
    </OnboardingStep>
  );
}
