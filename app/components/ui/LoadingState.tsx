
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message }: LoadingStateProps) {
  const { t } = useTranslation();
  const displayMessage = message ?? t('ui.loading');
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
      <Loader2
        className="w-8 h-8 animate-spin motion-reduce:animate-none"
        style={{ color: 'var(--accent)' }}
      />
      <p
        className="text-sm"
        style={{ color: 'var(--secondary-text)' }}
      >
        {displayMessage}
      </p>
    </div>
  );
}
