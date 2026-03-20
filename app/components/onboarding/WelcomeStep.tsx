
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validateEmail, validateName } from '@/lib/utils/validation';

interface WelcomeStepProps {
  initialName?: string;
  initialEmail?: string;
  onComplete: (data: { name: string; email: string }) => void;
}

export default function WelcomeStep({ initialName = '', initialEmail = '', onComplete }: WelcomeStepProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { name?: string; email?: string } = {};

    if (!validateName(name)) {
      newErrors.name = t('onboarding.name_min_length');
    }

    if (!validateEmail(email)) {
      newErrors.email = t('onboarding.email_invalid');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onComplete({ name: name.trim(), email: email.trim() });
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (errors.name && validateName(value)) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (errors.email && validateEmail(value)) {
      setErrors((prev) => ({ ...prev, email: undefined }));
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--dome-text)' }}>
            {t('onboarding.welcome_title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('onboarding.welcome_subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--dome-text)' }}
            >
              {t('onboarding.full_name')}
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t('onboarding.full_name_placeholder')}
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: 'var(--dome-bg-hover)',
                color: 'var(--dome-text)',
                border: errors.name ? '1px solid var(--dome-error, #ef4444)' : '1px solid var(--dome-border)',
              }}
              autoFocus
            />
            {errors.name && (
              <p className="text-xs mt-1" style={{ color: 'var(--dome-error, #ef4444)' }}>{errors.name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--dome-text)' }}
            >
              {t('onboarding.email_address')}
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder={t('onboarding.email_placeholder')}
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: 'var(--dome-bg-hover)',
                color: 'var(--dome-text)',
                border: errors.email ? '1px solid var(--dome-error, #ef4444)' : '1px solid var(--dome-border)',
              }}
            />
            {errors.email && (
              <p className="text-xs mt-1" style={{ color: 'var(--dome-error, #ef4444)' }}>{errors.email}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg font-medium text-sm text-white transition-colors"
            style={{
              backgroundColor: 'var(--dome-accent)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {t('common.continue')}
          </button>
        </form>

        <p className="text-xs text-center mt-6" style={{ color: 'var(--dome-text-muted)' }}>
          {t('onboarding.privacy_note')}
        </p>
      </div>
    </div>
  );
}
