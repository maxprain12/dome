
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
    // Applies profile, agent soul/memory, feature visibility and recommended
    // skills, then marks onboarding complete. Each step is best-effort.
    try {
      await applyOnboardingConfig(data);
    } catch (err) {
      console.error('[Onboarding] applyOnboardingConfig failed:', err);
    }

    // Close modal with animation
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

  // Portal to <body> so the full-screen backdrop escapes the shell's content
  // container (whose ancestors establish a containing block that would otherwise
  // clip `position: fixed` to the central area). This makes the onboarding take
  // over the ENTIRE app — sidebar and Many panel included — and blur all of it.
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 'var(--z-max)',
        backgroundColor: 'color-mix(in srgb, var(--dome-text) 40%, transparent)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="relative rounded-2xl shadow-2xl max-w-2xl max-h-[85vh] w-full mx-4 flex flex-col overflow-hidden animate-fade-in"
        style={{
          backgroundColor: 'var(--dome-bg)',
          border: '1px solid var(--dome-border)',
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
