
import { AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export default function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
      <AlertCircle
        className="w-12 h-12"
        style={{ color: 'var(--error)' }}
      />
      <p
        className="text-sm text-center max-w-md"
        style={{ color: 'var(--error)' }}
      >
        {error}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{
            background: 'var(--accent)',
            color: 'white',
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}
