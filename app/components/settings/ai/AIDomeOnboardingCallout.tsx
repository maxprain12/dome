import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { InformationCircleIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** Onboarding note: the Dome account can be connected later from Settings → AI. */
export default function AIDomeOnboardingCallout() {
  const { t } = useTranslation();

  return (
    <Alert role="note">
      <HugeiconsIcon icon={InformationCircleIcon} aria-hidden />
      <AlertDescription className="text-xs">
        {t('onboarding.dome_connect_later')}
      </AlertDescription>
    </Alert>
  );
}
