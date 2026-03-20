
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { validateEmail, validateName } from '@/lib/utils/validation';

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

  // Always-up-to-date ref for handleNext — fixes stale closure in event listener
  const handleNextRef = useRef<() => void>(() => {});

  const handleNext = useCallback(() => {
    if (!canProceed) {
      setTouched({ name: true, email: true });
      return;
    }
    onComplete({ name: name.trim(), email: email.trim() });
  }, [canProceed, name, email, onComplete]);

  // Keep ref in sync with latest handleNext
  handleNextRef.current = handleNext;

  // Notify parent of validation state
  useEffect(() => {
    onValidationChange?.(canProceed);
  }, [canProceed, onValidationChange]);

  // Listen for validation trigger from parent — use ref to avoid stale closure
  useEffect(() => {
    const handler = () => handleNextRef.current();
    window.addEventListener('onboarding:validate', handler);
    return () => window.removeEventListener('onboarding:validate', handler);
  }, []); // empty deps: listener is stable, calls current ref

  const initials = name.trim()
    ? name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : null;

  return (
    <div className="flex flex-col gap-5">

      {/* Avatar preview */}
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all"
          style={{
            background: initials
              ? 'linear-gradient(135deg, var(--dome-accent) 0%, #998eec 100%)'
              : 'var(--dome-bg-hover)',
            boxShadow: initials ? '0 4px 16px var(--dome-accent)33' : 'none',
          }}
        >
          {initials ? (
            <span className="text-white font-bold text-lg select-none">{initials}</span>
          ) : (
            <User className="w-6 h-6" style={{ color: 'var(--dome-text-muted)' }} />
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

      {/* Name field */}
        <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-name" className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--dome-text-muted)' }}>
          {t('onboarding.full_name')} <span style={{ color: 'var(--dome-accent)' }}>*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none" style={{ color: nameError ? 'var(--dome-error, #ef4444)' : nameValid && touched.name ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}>
            <User className="w-4 h-4" />
          </span>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            placeholder={t('onboarding.full_name_placeholder')}
            autoFocus
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none transition-all"
            style={{
              background: 'var(--dome-bg-hover)',
              color: 'var(--dome-text)',
              border: nameError
                ? '1.5px solid var(--dome-error, #ef4444)'
                : nameValid && touched.name
                ? '1.5px solid var(--dome-accent)'
                : '1.5px solid var(--dome-border)',
              boxShadow: nameError
                ? '0 0 0 3px rgba(239,68,68,0.1)'
                : nameValid && touched.name
                ? '0 0 0 3px var(--dome-accent)18'
                : 'none',
            }}
            onFocus={(e) => {
              if (!nameError) {
                e.target.style.borderColor = 'var(--dome-accent)';
                e.target.style.boxShadow = '0 0 0 3px var(--dome-accent)18';
              }
            }}
            onBlurCapture={(e) => {
              if (!nameError && !(nameValid && touched.name)) {
                e.target.style.borderColor = 'var(--dome-border)';
                e.target.style.boxShadow = 'none';
              }
            }}
          />
          {touched.name && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {nameValid
                ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />
                : <AlertCircle className="w-4 h-4" style={{ color: 'var(--dome-error, #ef4444)' }} />
              }
            </span>
          )}
        </div>
        {nameError && (
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--dome-error, #ef4444)' }}>
            <AlertCircle className="w-3 h-3 shrink-0" />{nameError}
          </p>
        )}
      </div>

      {/* Email field */}
        <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-email" className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--dome-text-muted)' }}>
          {t('onboarding.email_address')} <span style={{ color: 'var(--dome-accent)' }}>*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none" style={{ color: emailError ? 'var(--dome-error, #ef4444)' : emailValid && touched.email ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}>
            <Mail className="w-4 h-4" />
          </span>
          <input
            id="profile-email"
            type="text"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            placeholder={t('onboarding.email_placeholder')}
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none transition-all"
            style={{
              background: 'var(--dome-bg-hover)',
              color: 'var(--dome-text)',
              border: emailError
                ? '1.5px solid var(--dome-error, #ef4444)'
                : emailValid && touched.email
                ? '1.5px solid var(--dome-accent)'
                : '1.5px solid var(--dome-border)',
              boxShadow: emailError
                ? '0 0 0 3px rgba(239,68,68,0.1)'
                : emailValid && touched.email
                ? '0 0 0 3px var(--dome-accent)18'
                : 'none',
            }}
            onFocus={(e) => {
              if (!emailError) {
                e.target.style.borderColor = 'var(--dome-accent)';
                e.target.style.boxShadow = '0 0 0 3px var(--dome-accent)18';
              }
            }}
            onBlurCapture={(e) => {
              if (!emailError && !(emailValid && touched.email)) {
                e.target.style.borderColor = 'var(--dome-border)';
                e.target.style.boxShadow = 'none';
              }
            }}
          />
          {touched.email && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {emailValid
                ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />
                : <AlertCircle className="w-4 h-4" style={{ color: 'var(--dome-error, #ef4444)' }} />
              }
            </span>
          )}
        </div>
        {emailError && (
          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--dome-error, #ef4444)' }}>
            <AlertCircle className="w-3 h-3 shrink-0" />{emailError}
          </p>
        )}
      </div>

      {/* Privacy note */}
      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
        {t('onboarding.privacy_note')}
      </p>
    </div>
  );
}
