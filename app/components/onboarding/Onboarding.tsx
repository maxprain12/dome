
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

    setIsVisible(false);
    setTimeout(() => {
      if (onComplete) {
        onComplete();
      }
    }, 300);
  };

  if (!isVisible) {
    return null;
  }

  // Rendered via portal so it escapes any filter/transform containing block
  // created by ancestor components (e.g. TabPaneShell's reveal animation).
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 10000,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="relative rounded-2xl shadow-2xl max-w-2xl max-h-[85vh] w-full mx-4 flex flex-col overflow-hidden animate-modal"
        style={{
          backgroundColor: 'var(--dome-bg)',
          border: '1px solid var(--dome-border)',
          minHeight: '420px',
        }}
      >
        <MartinOnboarding
          initialName={existingName}
          initialEmail={existingEmail}
          onComplete={handleComplete}
        />
      </div>
    </div>,
    document.body,
  );
}
