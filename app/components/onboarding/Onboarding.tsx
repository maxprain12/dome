
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useUserStore } from '@/lib/store/useUserStore';
import { applyOnboardingConfig } from '@/lib/onboarding/applyOnboardingConfig';
import type { RoleId } from '@/lib/onboarding/roles';
import MartinOnboarding from './MartinOnboarding';

interface OnboardingProps {
  onComplete?: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { name: existingName, email: existingEmail } = useUserStore();
  const [isVisible, setIsVisible] = useState(true);

  const closeOnboarding = () => {
    setIsVisible(false);
    setTimeout(() => {
      onComplete?.();
    }, 300);
  };

  const handleComplete = async (data: {
    name: string;
    email: string;
    roleId: RoleId;
    freeText: string;
  }) => {
    try {
      await applyOnboardingConfig(data);
    } catch (err) {
      console.error('[Onboarding] applyOnboardingConfig failed:', err);
    }
    closeOnboarding();
  };

  const handleSkip = async () => {
    try {
      await useUserStore.getState().loadUserProfile();
      await useUserStore.getState().completeOnboarding();
    } catch (err) {
      console.error('[Onboarding] completeOnboarding failed:', err);
    }
    closeOnboarding();
  };

  if (!isVisible) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col h-full w-full"
      style={{
        zIndex: 10000,
        backgroundColor: 'var(--background)',
      }}
    >
      <MartinOnboarding
        initialName={existingName}
        initialEmail={existingEmail}
        onComplete={handleComplete}
        onSkip={handleSkip}
      />
    </div>,
    document.body,
  );
}
