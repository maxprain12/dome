import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useUserStore } from '@/lib/store/useUserStore';
import OnboardingWizard from './OnboardingWizard';

interface OnboardingProps {
  onComplete?: () => void;
}

/** Full-screen first-run overlay. Closes only once the wizard applied everything. */
export default function Onboarding({ onComplete }: OnboardingProps) {
  const { name: existingName, email: existingEmail } = useUserStore();
  const [isVisible, setIsVisible] = useState(true);

  const close = () => {
    setIsVisible(false);
    globalThis.setTimeout(() => onComplete?.(), 300);
  };

  const handleSkip = () => {
    const user = useUserStore.getState();
    user
      .loadUserProfile()
      .then(() => user.completeOnboarding())
      .catch((err: unknown) => console.error('[Onboarding] completeOnboarding failed:', err))
      .finally(close);
  };

  if (!isVisible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex h-full w-full flex-col bg-background">
      <OnboardingWizard
        initialName={existingName}
        initialEmail={existingEmail}
        onFinished={close}
        onSkip={handleSkip}
      />
    </div>,
    document.body,
  );
}
