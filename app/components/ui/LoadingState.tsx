import { useTranslation } from 'react-i18next';
import DomeListState from '@/components/ui/DomeListState';

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message }: LoadingStateProps) {
  const { t } = useTranslation();
  return <DomeListState variant="loading" loadingLabel={message ?? t('ui.loading')} fullHeight />;
}
