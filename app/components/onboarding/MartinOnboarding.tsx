'use client';

import { useState } from 'react';
import OnboardingStep from './OnboardingStep';
import ProfileStep from './steps/ProfileStep';
import AISetupStep from './steps/AISetupStep';
import MartinAvatar from '@/components/common/MartinAvatar';

interface MartinOnboardingProps {
  initialName?: string;
  initialEmail?: string;
  initialAvatarPath?: string;
  onComplete: (data: {
    name: string;
    email: string;
    avatarPath?: string;
  }) => void;
}

type Step = 'welcome' | 'profile' | 'ai' | 'complete';

const WELCOME_MESSAGE = `Hello! I'm Martin, your AI assistant in Dome. 

I'm here to help you set up your account and prepare everything so you can start working with your resources in the best way.

Let's do this step by step. First, I need to know some basic information about you.`;

const PROFILE_MESSAGE = `Perfect, now I need you to provide your profile information. This will help me personalize your experience.`;

const AI_MESSAGE = `Excellent. Now, so I can help you better, I need to configure your AI provider. This will allow me to generate summaries, perform semantic searches, and answer your questions.

You can configure this now or do it later from settings.`;

const COMPLETE_MESSAGE = `Perfect! Everything is now configured. 

I'm ready to help you work with your resources. If you need to change any settings later, you can do so from settings.

Welcome to Dome!`;

export default function MartinOnboarding({
  initialName,
  initialEmail,
  initialAvatarPath,
  onComplete,
}: MartinOnboardingProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [profileData, setProfileData] = useState<{
    name: string;
    email: string;
    avatarPath?: string;
  } | null>(null);
  const [canProceedProfile, setCanProceedProfile] = useState(false);

  const handleWelcomeNext = () => {
    setCurrentStep('profile');
  };

  const handleProfileComplete = (data: { name: string; email: string; avatarPath?: string }) => {
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

  // Welcome step
  if (currentStep === 'welcome') {
    return (
      <OnboardingStep
        message={WELCOME_MESSAGE}
        onNext={handleWelcomeNext}
        nextLabel="Start"
        canProceed={true}
      >
        <div className="flex items-center justify-center py-8">
          <MartinAvatar size="xl" />
        </div>
      </OnboardingStep>
    );
  }

  // Profile step
  if (currentStep === 'profile') {
    return (
      <OnboardingStep
        message={PROFILE_MESSAGE}
        onNext={() => {
          // Trigger validation in ProfileStep
          const event = new CustomEvent('onboarding:validate');
          window.dispatchEvent(event);
        }}
        onBack={handleBack}
        nextLabel="Continue"
        canProceed={canProceedProfile}
      >
        <ProfileStep
          initialName={initialName || profileData?.name}
          initialEmail={initialEmail || profileData?.email}
          initialAvatarPath={initialAvatarPath || profileData?.avatarPath}
          onComplete={handleProfileComplete}
          onValidationChange={setCanProceedProfile}
        />
      </OnboardingStep>
    );
  }

  // AI Setup step
  if (currentStep === 'ai') {
    return (
      <OnboardingStep
        message={AI_MESSAGE}
        onNext={() => window.dispatchEvent(new CustomEvent('onboarding:finalize'))}
        onBack={handleBack}
        nextLabel="Finish"
        canProceed={true}
      >
        <AISetupStep onComplete={handleAIComplete} />
      </OnboardingStep>
    );
  }

  // Complete step (shouldn't reach here, but just in case)
  return (
    <OnboardingStep message={COMPLETE_MESSAGE} canProceed={false}>
      <div className="flex items-center justify-center py-8">
        <MartinAvatar size="xl" />
      </div>
    </OnboardingStep>
  );
}
