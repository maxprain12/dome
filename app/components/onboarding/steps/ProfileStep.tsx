
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentProps } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, CheckmarkCircle02Icon, Mail01Icon, UserIcon } from '@hugeicons/core-free-icons';
import { validateEmail, validateName } from '@/lib/utils/validation';
import { ACCENT_END } from '@/lib/ui/accent';

import { Input } from '@/components/ui/input';
import { Field, FieldError } from '@/components/ui/field';

type InlineIconProps = Omit<ComponentProps<typeof HugeiconsIcon>, 'icon'>;
const User = (props: InlineIconProps) => <HugeiconsIcon icon={UserIcon} {...props} />;
const Mail = (props: InlineIconProps) => <HugeiconsIcon icon={Mail01Icon} {...props} />;
const CheckCircle2 = (props: InlineIconProps) => <HugeiconsIcon icon={CheckmarkCircle02Icon} {...props} />;
const AlertCircle = (props: InlineIconProps) => <HugeiconsIcon icon={AlertCircleIcon} {...props} />;
interface ProfileStepProps {
  initialName?: string;
  initialEmail?: string;
  onComplete: (data: { name: string; email: string }) => void;
  onValidationChange?: (isValid: boolean) => void;
}

export default function ProfileStep({
  initialName = '',
  initialEmail = '',
  onComplete,
  onValidationChange,
}: ProfileStepProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});

  const nameValid = validateName(name);
  const emailValid = validateEmail(email);
  const canProceed = nameValid && emailValid;

  const nameError = touched.name && !nameValid ? t('onboarding.name_min_length') : undefined;
  const emailError = touched.email && !emailValid ? t('onboarding.email_invalid') : undefined;

  const handleNextRef = useRef<() => void>(() => {});

  const handleNext = useCallback(() => {
    if (!canProceed) {
      setTouched({ name: true, email: true });
      return;
    }
    onComplete({ name: name.trim(), email: email.trim() });
  }, [canProceed, name, email, onComplete]);

  handleNextRef.current = handleNext;

  useEffect(() => {
    onValidationChange?.(canProceed);
  }, [canProceed, onValidationChange]);

  useEffect(() => {
    const handler = () => handleNextRef.current();
    window.addEventListener('onboarding:validate', handler);
    return () => window.removeEventListener('onboarding:validate', handler);
  }, []);

  const initials = name.trim()
    ? name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div
          className="size-14 rounded-2xl flex items-center justify-center shrink-0 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
          style={{
            background: initials
              ? `linear-gradient(135deg, var(--primary) 0%, ${ACCENT_END} 100%)`
              : 'var(--accent)',
            boxShadow: initials ? `0 4px 16px ${ACCENT_END}33` : 'none',
          }}
        >
          {initials ? (
            <span className="font-bold text-lg select-none text-primary-foreground">
              {initials}
            </span>
          ) : (
            <User className="size-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">
            {name.trim() || t('onboarding.your_name')}
          </p>
          <p className="text-xs mt-0.5 text-muted-foreground">
            {email.trim() || t('onboarding.your_email')}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('onboarding.full_name')} <span className="text-primary">*</span>
        </p>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10"
            style={{ color: nameError ? 'var(--destructive)' : nameValid && touched.name ? 'var(--primary)' : 'var(--muted-foreground)' }}
          >
            <User className="size-4" />
          </span>
          <Field className="gap-1.5 [&_input]:pl-9 [&_input]:pr-9" data-invalid={Boolean(nameError)}><Input id="profile-name" className="pl-9 pr-9" type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched((prev) => ({ ...prev, name: true }))} placeholder={t('onboarding.full_name_placeholder')} aria-invalid={Boolean(nameError) || undefined} /><FieldError className="text-xs">{nameError}</FieldError></Field>
          {touched.name && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
              {nameValid ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <AlertCircle className="size-4 text-destructive" />
              )}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('onboarding.email_address')} <span className="text-primary">*</span>
        </p>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10"
            style={{ color: emailError ? 'var(--destructive)' : emailValid && touched.email ? 'var(--primary)' : 'var(--muted-foreground)' }}
          >
            <Mail className="size-4" />
          </span>
          <Field className="gap-1.5 [&_input]:pl-9 [&_input]:pr-9" data-invalid={Boolean(emailError)}><Input id="profile-email" className="pl-9 pr-9" type="text" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched((prev) => ({ ...prev, email: true }))} placeholder={t('onboarding.email_placeholder')} aria-invalid={Boolean(emailError) || undefined} /><FieldError className="text-xs">{emailError}</FieldError></Field>
          {touched.email && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
              {emailValid ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <AlertCircle className="size-4 text-destructive" />
              )}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('onboarding.privacy_note')}
      </p>
    </div>
  );
}
