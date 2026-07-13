import { HugeiconsIcon } from '@hugeicons/react';
import {
  InformationCircleIcon as Info,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AIDomeOnboardingCallout() {
  const { t } = useTranslation();

  return (
    <Alert role="note"><HugeiconsIcon icon={Info} aria-hidden /><AlertDescription className="text-xs">
      {t('onboarding.dome_connect_later')}
    </AlertDescription></Alert>
  );
}
