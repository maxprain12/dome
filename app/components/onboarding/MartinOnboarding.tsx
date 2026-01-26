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

const WELCOME_MESSAGE = `¡Hola! Soy Martin, tu asistente de IA en Dome. 

Estoy aquí para ayudarte a configurar tu cuenta y preparar todo para que puedas empezar a trabajar con tus recursos de la mejor manera.

Vamos a hacer esto paso a paso. Primero, necesito conocer algunos datos básicos sobre ti.`;

const PROFILE_MESSAGE = `Perfecto, ahora necesito que me proporciones tu información de perfil. Esto me ayudará a personalizar tu experiencia.`;

const AI_MESSAGE = `Excelente. Ahora, para que pueda ayudarte mejor, necesito configurar tu proveedor de IA. Esto me permitirá generar resúmenes, hacer búsquedas semánticas y responder tus preguntas.

Puedes configurar esto ahora o hacerlo más tarde desde los ajustes.`;

const COMPLETE_MESSAGE = `¡Perfecto! Ya tenemos todo configurado. 

Estoy listo para ayudarte a trabajar con tus recursos. Si necesitas cambiar alguna configuración más adelante, puedes hacerlo desde los ajustes.

¡Bienvenido a Dome!`;

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
        nextLabel="Empezar"
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
        nextLabel="Continuar"
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
        <MartinAvatar size="xl" />
      </div>
    </OnboardingStep>
  );
}
