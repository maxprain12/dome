
import { useState } from 'react';
import { useUserStore } from '@/lib/store/useUserStore';
import MartinOnboarding from './MartinOnboarding';

interface OnboardingProps {
  onComplete?: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { updateUserProfile, completeOnboarding, name: existingName, email: existingEmail } = useUserStore();
  const [isVisible, setIsVisible] = useState(true);

  const handleComplete = async (data: { name: string; email: string }) => {
    await updateUserProfile({
      name: data.name,
      email: data.email,
    });

    // Mark onboarding as completed
    await completeOnboarding();

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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 'var(--z-modal)',
        backgroundColor: 'var(--translucent)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="relative rounded-xl shadow-2xl max-w-2xl max-h-[90vh] w-full mx-4 flex flex-col overflow-hidden animate-fade-in"
        style={{
          backgroundColor: 'var(--bg)',
          border: '1px solid var(--border)',
        }}
      >
        <MartinOnboarding
          initialName={existingName}
          initialEmail={existingEmail}
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
}
