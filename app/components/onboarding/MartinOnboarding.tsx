
import { useState } from 'react';
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

type Step = 'welcome' | 'profile' | 'ai' | 'complete';

const WELCOME_MESSAGE = `¡Hola! Soy Many, tu asistente de IA en Dome.

Estoy aquí para ayudarte a configurar tu cuenta y preparar todo para que puedas empezar a trabajar con tus recursos de la mejor manera.

Vamos paso a paso. Primero necesito conocer algunos datos básicos sobre ti.`;

const PROFILE_MESSAGE = `Cuéntame un poco sobre ti. Esto me ayudará a personalizar tu experiencia en Dome.`;

const AI_MESSAGE = `Excellent. Now, so I can help you better, I need to configure your AI provider. This will allow me to generate summaries, perform semantic searches, and answer your questions.

You can configure this now or do it later from settings.`;

const COMPLETE_MESSAGE = `¡Perfecto! Todo está configurado.

Estoy listo para ayudarte a trabajar con tus recursos. Si necesitas cambiar algún ajuste más adelante, puedes hacerlo desde configuración.

¡Bienvenido/a a Dome!`;

export default function MartinOnboarding({
  initialName,
  initialEmail,
  onComplete,
}: MartinOnboardingProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [profileData, setProfileData] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [canProceedProfile, setCanProceedProfile] = useState(false);

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

  // Welcome step
  if (currentStep === 'welcome') {
    return (
      <OnboardingStep
        message={WELCOME_MESSAGE}
        onNext={handleWelcomeNext}
        nextLabel="Empezar"
        canProceed={true}
      >
        <div className="flex items-center justify-center py-8">
          <ManyAvatar size="xl" />
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
        nextLabel="Continuar"
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

  // AI Setup step
  if (currentStep === 'ai') {
    return (
      <OnboardingStep
        message={AI_MESSAGE}
        onNext={() => window.dispatchEvent(new CustomEvent('onboarding:finalize'))}
        onBack={handleBack}
        nextLabel="Finalizar"
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
        <ManyAvatar size="xl" />
      </div>
    </OnboardingStep>
  );
}
