import { useTranslation } from 'react-i18next';
import DomeListState from '@/components/ui/DomeListState';

interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export default function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <DomeListState
      variant="error"
      errorMessage={error}
      onRetry={onRetry}
      retryLabel={t('ui.try_again')}
      fullHeight
    />
  );
}
