
import { useState, useEffect } from 'react';
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
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

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

  const handleNext = () => {
    const newErrors: { name?: string; email?: string } = {};

    if (!validateName(name)) {
      newErrors.name = 'Por favor ingresa un nombre válido (al menos 2 caracteres)';
    }

    if (!validateEmail(email)) {
      newErrors.email = 'Por favor ingresa un email válido';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    const trimmedEmail = email.trim();

    onComplete({
      name: name.trim(),
      email: trimmedEmail,
    });
  };

  const canProceed = validateName(name) && validateEmail(email);

  // Notify parent of validation state
  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(canProceed);
    }
  }, [canProceed, onValidationChange]);

  // Listen for validation trigger from parent
  useEffect(() => {
    const handleValidate = () => {
      if (canProceed) {
        handleNext();
      }
    };

    window.addEventListener('onboarding:validate', handleValidate);
    return () => {
      window.removeEventListener('onboarding:validate', handleValidate);
    };
  }, [canProceed]);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-4" style={{ color: 'var(--secondary-text)' }}>
          Datos personales
        </h3>

        {/* Name */}
        <div className="space-y-2 mb-4">
          <label htmlFor="profile-name" className="block text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
            Nombre completo *
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="John Doe"
            className="input"
            style={{
              borderColor: errors.name ? 'var(--error)' : undefined,
            }}
            autoFocus
          />
          {errors.name ? <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{errors.name}</p> : null}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="profile-email" className="block text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
            Email *
          </label>
          <input
            id="profile-email"
            type="text"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="juan@ejemplo.com"
            className="input"
            style={{
              borderColor: errors.email ? 'var(--error)' : undefined,
            }}
          />
          {errors.email ? <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{errors.email}</p> : null}
        </div>
      </section>

      {/* Hidden button for OnboardingStep to use */}
      <div style={{ display: 'none' }}>
        <button onClick={handleNext} disabled={!canProceed} />
      </div>
    </div>
  );
}
