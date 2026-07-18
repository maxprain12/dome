
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import OnboardingStep from './OnboardingStep';
import AccountStep from './steps/AccountStep';
import ProfileStep from './steps/ProfileStep';
import RoleStep from './steps/RoleStep';
import AISetupStep from './steps/AISetupStep';
import ManyAvatar from '@/components/many/ManyAvatar';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import type { RoleId } from '@/lib/onboarding/roles';

interface MartinOnboardingProps {
  initialName?: string;
  initialEmail?: string;
  onComplete: (data: {
    name: string;
    email: string;
    roleId: RoleId;
    freeText: string;
  }) => void;
  onSkip: () => void;
}

type Step = 'account' | 'welcome' | 'profile' | 'role' | 'ai';

type AccountData = {
  mode: 'account' | 'local';
  email?: string;
  name?: string;
  hadRemoteData?: boolean;
  alreadyOnboarded?: boolean;
};

const STEPS_WITH_DOME: Step[] = ['account', 'welcome', 'profile', 'role', 'ai'];
const STEPS_WITHOUT_DOME: Step[] = ['welcome', 'profile', 'role', 'ai'];

function getStepProgress(currentStep: Step, domeEnabled: boolean) {
  const steps = domeEnabled ? STEPS_WITH_DOME : STEPS_WITHOUT_DOME;
  const index = steps.indexOf(currentStep);
  return { stepIndex: index >= 0 ? index : 0, totalSteps: steps.length };
}

export default function MartinOnboarding({
  initialName,
  initialEmail,
  onComplete,
  onSkip,
}: MartinOnboardingProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<Step>(
    DOME_PROVIDER_ENABLED ? 'account' : 'welcome',
  );
  const [accountSubView, setAccountSubView] = useState<'choice' | 'login' | 'register'>('choice');
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [profileData, setProfileData] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [roleData, setRoleData] = useState<{
    roleId: RoleId;
    freeText: string;
  } | null>(null);
  const [canProceedAccount, setCanProceedAccount] = useState(false);
  const [canProceedProfile, setCanProceedProfile] = useState(false);
  const [canProceedRole, setCanProceedRole] = useState(false);
  const [canProceedAI, setCanProceedAI] = useState(false);

  const { stepIndex, totalSteps } = getStepProgress(currentStep, DOME_PROVIDER_ENABLED);

  const handleAccountComplete = (data: AccountData) => {
    if (data.mode === 'account' && data.alreadyOnboarded) {
      onSkip();
      return;
    }
    setAccountData(data);
    setCurrentStep('welcome');
  };

  const handleWelcomeNext = () => {
    if (accountData?.mode === 'account' && accountData.name?.trim()) {
      setProfileData({
        name: accountData.name.trim(),
        email: accountData.email?.trim() || '',
      });
      setCurrentStep('role');
      return;
    }
    setCurrentStep('profile');
  };

  const handleProfileComplete = (data: { name: string; email: string }) => {
    setProfileData(data);
    setCurrentStep('role');
  };

  const handleRoleComplete = (data: { roleId: RoleId; freeText: string }) => {
    setRoleData(data);
    setCurrentStep('ai');
  };

  const handleAIComplete = () => {
    if (profileData && roleData) {
      onComplete({ ...profileData, ...roleData });
    }
  };

  const handleBack = () => {
    if (currentStep === 'welcome') {
      if (DOME_PROVIDER_ENABLED) {
        setCurrentStep('account');
      }
    } else if (currentStep === 'profile') {
      setCurrentStep('welcome');
    } else if (currentStep === 'role') {
      if (accountData?.mode === 'account' && accountData.name?.trim()) {
        setCurrentStep('welcome');
      } else {
        setCurrentStep('profile');
      }
    } else if (currentStep === 'ai') {
      setCurrentStep('role');
    }
  };

  const accountBack =
    accountSubView !== 'choice'
      ? () => window.dispatchEvent(new CustomEvent('onboarding:account-back'))
      : undefined;

  if (currentStep === 'account' && DOME_PROVIDER_ENABLED) {
    return (
      <OnboardingStep
        message={t('onboarding.account_message')}
        onNext={() => window.dispatchEvent(new CustomEvent('onboarding:account-validate'))}
        onBack={accountBack}
        nextLabel={t('onboarding.continue')}
        canProceed={canProceedAccount}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
      >
        <AccountStep
          onComplete={handleAccountComplete}
          onValidationChange={setCanProceedAccount}
          onSubViewChange={setAccountSubView}
        />
      </OnboardingStep>
    );
  }

  if (currentStep === 'welcome') {
    return (
      <OnboardingStep
        message={t('onboarding.welcome_message')}
        onNext={handleWelcomeNext}
        onBack={DOME_PROVIDER_ENABLED ? handleBack : undefined}
        nextLabel={t('onboarding.start')}
        canProceed={true}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
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
        stepIndex={stepIndex}
        totalSteps={totalSteps}
      >
        <ProfileStep
          initialName={initialName || profileData?.name}
          initialEmail={
            (accountData?.mode === 'account' ? accountData.email : undefined) ||
            initialEmail ||
            profileData?.email
          }
          onComplete={handleProfileComplete}
          onValidationChange={setCanProceedProfile}
        />
      </OnboardingStep>
    );
  }

  if (currentStep === 'role') {
    return (
      <OnboardingStep
        message={t('onboarding.role_message')}
        onNext={() => window.dispatchEvent(new CustomEvent('onboarding:role-validate'))}
        onBack={handleBack}
        nextLabel={t('onboarding.continue')}
        canProceed={canProceedRole}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
      >
        <RoleStep
          initialRoleId={roleData?.roleId}
          initialFreeText={roleData?.freeText}
          onComplete={handleRoleComplete}
          onValidationChange={setCanProceedRole}
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
      stepIndex={stepIndex}
      totalSteps={totalSteps}
    >
      <AISetupStep
        onComplete={handleAIComplete}
        onValidationChange={setCanProceedAI}
        localModeOnly={accountData?.mode === 'local'}
        syncedFromCloud={Boolean(accountData?.mode === 'account' && accountData.hadRemoteData)}
      />
    </OnboardingStep>
  );
}
