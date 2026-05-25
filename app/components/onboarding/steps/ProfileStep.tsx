
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { validateEmail, validateName } from '@/lib/utils/validation';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import { ACCENT_END } from '@/lib/ui/accent';

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
          className="size-14 rounded-2xl flex items-center justify-center shrink-0 transition-all"
          style={{
            background: initials
              ? `linear-gradient(135deg, var(--dome-accent) 0%, ${ACCENT_END} 100%)`
              : 'var(--dome-bg-hover)',
            boxShadow: initials ? `0 4px 16px ${ACCENT_END}33` : 'none',
          }}
        >
          {initials ? (
            <span className="font-bold text-lg select-none" style={{ color: 'var(--base-text)' }}>
              {initials}
            </span>
          ) : (
            <User className="size-6" style={{ color: 'var(--dome-text-muted)' }} />
          )}
        </div>
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--dome-text)' }}>
            {name.trim() || t('onboarding.your_name')}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
            {email.trim() || t('onboarding.your_email')}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <DomeSectionLabel>
          {t('onboarding.full_name')} <span style={{ color: 'var(--dome-accent)' }}>*</span>
        </DomeSectionLabel>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10"
            style={{ color: nameError ? 'var(--dome-error)' : nameValid && touched.name ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}
          >
            <User className="size-4" />
          </span>
          <DomeInput
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
            placeholder={t('onboarding.full_name_placeholder')}
            error={nameError}
            inputClassName="pl-9 pr-9"
            className="[&_input]:pl-9 [&_input]:pr-9"
          />
          {touched.name && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
              {nameValid ? (
                <CheckCircle2 className="size-4" style={{ color: 'var(--dome-accent)' }} />
              ) : (
                <AlertCircle className="size-4" style={{ color: 'var(--dome-error)' }} />
              )}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <DomeSectionLabel>
          {t('onboarding.email_address')} <span style={{ color: 'var(--dome-accent)' }}>*</span>
        </DomeSectionLabel>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10"
            style={{ color: emailError ? 'var(--dome-error)' : emailValid && touched.email ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}
          >
            <Mail className="size-4" />
          </span>
          <DomeInput
            id="profile-email"
            type="text"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            placeholder={t('onboarding.email_placeholder')}
            error={emailError}
            inputClassName="pl-9 pr-9"
            className="[&_input]:pl-9 [&_input]:pr-9"
          />
          {touched.email && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
              {emailValid ? (
                <CheckCircle2 className="size-4" style={{ color: 'var(--dome-accent)' }} />
              ) : (
                <AlertCircle className="size-4" style={{ color: 'var(--dome-error)' }} />
              )}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
        {t('onboarding.privacy_note')}
      </p>
    </div>
  );
}
