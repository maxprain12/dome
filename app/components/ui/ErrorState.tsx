import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import DomeListState from '@/components/ui/DomeListState';

interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
  /** Extra escape hatch rendered under the retry button (e.g. "go home"). */
  action?: ReactNode;
}

export default function ErrorState({ error, onRetry, action }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <DomeListState
      variant="error"
      errorMessage={error}
      onRetry={onRetry}
      retryLabel={t('ui.try_again')}
      action={action}
      fullHeight
    />
  );
}
