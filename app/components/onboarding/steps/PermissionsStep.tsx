import { useTranslation } from 'react-i18next';
import PermissionCallout from '@/components/shared/PermissionCallout';
import type { OnboardingProgress } from '@/lib/onboarding/useOnboardingFlow';
import OnboardingStep from '../OnboardingStep';

interface PermissionsStepProps {
  progress: OnboardingProgress;
  onNext: () => void;
  onBack?: () => void;
}

/** Optional: grant microphone and screen recording up front so transcription works on first use. */
export default function PermissionsStep({ progress, onNext, onBack }: PermissionsStepProps) {
  const { t } = useTranslation();
  return (
    <OnboardingStep message={t('onboarding.permissions_message')} progress={progress} onNext={onNext} onBack={onBack}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t('onboarding.permissions_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('onboarding.permissions_subtitle')}</p>
        </div>
        <PermissionCallout kinds={['microphone', 'screen']} />
        <p className="text-xs text-muted-foreground">{t('onboarding.permissions_later')}</p>
      </div>
    </OnboardingStep>
  );
}
