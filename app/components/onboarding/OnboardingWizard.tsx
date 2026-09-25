import { useMemo } from 'react';
import { DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { useOnboardingFlow } from '@/lib/onboarding/useOnboardingFlow';
import type { OnboardingEnv } from '@/lib/onboarding/flow';
import AccountStep from './steps/AccountStep';
import LanguageStep from './steps/LanguageStep';
import ProfileStep from './steps/ProfileStep';
import EditionStep from './steps/EditionStep';
import AISetupStep from './steps/AISetupStep';
import PermissionsStep from './steps/PermissionsStep';
import SummaryStep from './steps/SummaryStep';

interface OnboardingWizardProps {
  initialName?: string;
  initialEmail?: string;
  /** Everything applied and `onboarding_completed` set. */
  onFinished: () => void;
  /** Returning Dome user whose onboarding already ran on another device. */
  onSkip: () => void;
}

export default function OnboardingWizard({ initialName, initialEmail, onFinished, onSkip }: OnboardingWizardProps) {
  const env = useMemo<OnboardingEnv>(
    () => ({ domeEnabled: DOME_PROVIDER_ENABLED, managesPermissions: Boolean(globalThis.window?.electron?.isMac) }),
    [],
  );
  const flow = useOnboardingFlow(env, { name: initialName, email: initialEmail });
  const { step, data, progress, next, back } = flow;

  switch (step) {
    case 'account':
      return (
        <AccountStep
          progress={progress}
          onComplete={(account) => {
            if (account.mode === 'account' && account.alreadyOnboarded) onSkip();
            else next({ account });
          }}
        />
      );
    case 'language':
      return <LanguageStep progress={progress} onNext={() => next()} onBack={back} />;
    case 'profile':
      return (
        <ProfileStep
          progress={progress}
          initialName={data.name}
          initialEmail={data.email || data.account?.email || ''}
          onNext={(profile) => next(profile)}
          onBack={back}
        />
      );
    case 'edition':
      return (
        <EditionStep
          progress={progress}
          initialRoleId={data.roleId}
          initialFreeText={data.freeText}
          onNext={(edition) => next(edition)}
          onBack={back}
        />
      );
    case 'ai':
      return (
        <AISetupStep
          progress={progress}
          localModeOnly={data.account?.mode === 'local'}
          syncedFromCloud={Boolean(data.account?.mode === 'account' && data.account.hadRemoteData)}
          onNext={(aiProvider) => next({ aiProvider })}
          onBack={back}
        />
      );
    case 'permissions':
      return <PermissionsStep progress={progress} onNext={() => next()} onBack={back} />;
    case 'summary':
      return <SummaryStep progress={progress} data={data} onFinished={onFinished} onBack={back} />;
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}
