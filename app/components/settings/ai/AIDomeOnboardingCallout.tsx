import { useTranslation } from 'react-i18next';
import DomeCallout from '@/components/ui/DomeCallout';

export default function AIDomeOnboardingCallout() {
  const { t } = useTranslation();

  return (
    <DomeCallout tone="info">
      {t('onboarding.dome_connect_later')}
    </DomeCallout>
  );
}
