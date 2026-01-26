'use client';

import { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { validateEmail, validateName } from '@/lib/utils/validation';
import UserAvatar from '@/components/user/UserAvatar';
import { selectAndCopyAvatar } from '@/lib/settings/avatar';

interface ProfileStepProps {
  initialName?: string;
  initialEmail?: string;
  initialAvatarPath?: string;
  onComplete: (data: { name: string; email: string; avatarPath?: string }) => void;
  onValidationChange?: (isValid: boolean) => void;
}

export default function ProfileStep({
  initialName = '',
  initialEmail = '',
  initialAvatarPath,
  onComplete,
  onValidationChange,
}: ProfileStepProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [avatarPath, setAvatarPath] = useState<string | undefined>(initialAvatarPath);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const handleNameChange = (value: string) => {
    setName(value);
    if (errors.name && validateName(value)) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
  };

  const handleEmailChange = (value: string) => {
    // Debug: log every keystroke to find truncation
    console.log(`[ProfileStep] Email onChange: "${value}" (length: ${value.length})`);
    setEmail(value);
    if (errors.email && validateEmail(value)) {
      setErrors((prev) => ({ ...prev, email: undefined }));
    }
  };

  const handleChangeAvatar = async () => {
    const relativePath = await selectAndCopyAvatar();
    if (relativePath) {
      setAvatarPath(relativePath);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPath(undefined);
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
    
    // Debug: log email details to diagnose truncation issue
    const trimmedEmail = email.trim();
    console.log(`[ProfileStep] Completing with email:`);
    console.log(`[ProfileStep]   - Original: "${email}"`);
    console.log(`[ProfileStep]   - Trimmed: "${trimmedEmail}"`);
    console.log(`[ProfileStep]   - Length: ${trimmedEmail.length}`);
    
    onComplete({
      name: name.trim(),
      email: trimmedEmail,
      avatarPath,
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
      {/* Avatar Section */}
      <div>
        <label className="block text-sm font-medium mb-3" style={{ color: 'var(--primary)' }}>
          Foto de perfil (opcional)
        </label>
        <div className="flex items-center gap-4">
          <div className="relative">
            <UserAvatar name={name || 'Usuario'} avatarPath={avatarPath} size="xl" />
            <button
              onClick={handleChangeAvatar}
              className="absolute bottom-0 right-0 p-2 rounded-full text-white transition-transform hover:scale-110"
              style={{
                backgroundColor: 'var(--brand-primary)',
              }}
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleChangeAvatar}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--primary)',
                border: '1px solid var(--border)',
              }}
            >
              Cambiar foto
            </button>
            {avatarPath && (
              <button
                onClick={handleRemoveAvatar}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--error)',
                }}
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
          Nombre completo *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="John Doe"
          className="w-full px-4 py-2.5 rounded-lg text-sm"
          style={{
            backgroundColor: 'var(--bg)',
            color: 'var(--primary)',
            border: errors.name ? '1px solid var(--error)' : '1px solid var(--border)',
          }}
          autoFocus
        />
        {errors.name && <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{errors.name}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--primary)' }}>
          Email *
        </label>
        <input
          type="text"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          onBlur={(e) => console.log(`[ProfileStep] Email onBlur: "${e.target.value}" (length: ${e.target.value.length})`)}
          placeholder="juan@ejemplo.com"
          className="w-full px-4 py-2.5 rounded-lg text-sm"
          style={{
            backgroundColor: 'var(--bg)',
            color: 'var(--primary)',
            border: errors.email ? '1px solid var(--error)' : '1px solid var(--border)',
          }}
        />
        {errors.email && <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{errors.email}</p>}
      </div>

      {/* Hidden button for OnboardingStep to use */}
      <div style={{ display: 'none' }}>
        <button onClick={handleNext} disabled={!canProceed} />
      </div>
    </div>
  );
}
