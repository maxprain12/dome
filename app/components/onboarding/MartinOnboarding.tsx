
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import OnboardingStep from './OnboardingStep';
import ProfileStep from './steps/ProfileStep';
import AISetupStep from './steps/AISetupStep';
import ManyAvatar from '@/components/many/ManyAvatar';

interface MartinOnboardingProps {
  initialName?: string;
  initialEmail?: string;
  onComplete: (data: {
    name: string;
    email: string;
  }) => void;
}

type Step = 'welcome' | 'profile' | 'ai';

export default function MartinOnboarding({
  initialName,
  initialEmail,
  onComplete,
}: MartinOnboardingProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [profileData, setProfileData] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [canProceedProfile, setCanProceedProfile] = useState(false);
  const [canProceedAI, setCanProceedAI] = useState(false);

  const handleWelcomeNext = () => {
    setCurrentStep('profile');
  };

  const handleProfileComplete = (data: { name: string; email: string }) => {
    setProfileData(data);
    setCurrentStep('ai');
  };

  const handleAIComplete = () => {
    if (profileData) {
      onComplete(profileData);
    }
  };

  const handleBack = () => {
    if (currentStep === 'profile') {
      setCurrentStep('welcome');
    } else if (currentStep === 'ai') {
      setCurrentStep('profile');
    }
  };

  if (currentStep === 'welcome') {
    return (
      <OnboardingStep
        message={t('onboarding.welcome_message')}
        onNext={handleWelcomeNext}
        nextLabel={t('onboarding.start')}
        canProceed={true}
      >
        <div className="flex items-center justify-center py-8">
          <ManyAvatar size="xl" />
        </div>
      </OnboardingStep>
    );
  }

  if (currentStep === 'profile') {
    return (
      <OnboardingStep
        message={t('onboarding.profile_message')}
        onNext={() => {
          window.dispatchEvent(new CustomEvent('onboarding:validate'));
        }}
        onBack={handleBack}
        nextLabel={t('onboarding.continue')}
        canProceed={canProceedProfile}
      >
        <ProfileStep
          initialName={initialName || profileData?.name}
          initialEmail={initialEmail || profileData?.email}
          onComplete={handleProfileComplete}
          onValidationChange={setCanProceedProfile}
        />
      </OnboardingStep>
    );
  }

  return (
    <OnboardingStep
      message={t('onboarding.ai_message')}
      onNext={() => window.dispatchEvent(new CustomEvent('onboarding:finalize'))}
      onBack={handleBack}
      nextLabel={t('onboarding.finalize')}
      canProceed={canProceedAI}
    >
      <AISetupStep onComplete={handleAIComplete} onValidationChange={setCanProceedAI} />
    </OnboardingStep>
  );
}
