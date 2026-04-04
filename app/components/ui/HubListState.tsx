import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export interface HubListStateProps {
  variant: 'loading' | 'empty' | 'error';
  /** loading */
  loadingLabel?: string;
  /** empty */
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  /** error */
  errorMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** list area density */
  compact?: boolean;
}

/**
 * Unified loading / empty / error blocks for hub list panes.
 */
export default function HubListState({
  variant,
  loadingLabel,
  icon,
  title,
  description,
  action,
  errorMessage,
  onRetry,
  retryLabel,
  compact,
}: HubListStateProps) {
  const py = compact ? 'py-10' : 'py-14';

  if (variant === 'loading') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 ${py} px-4`}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
        {loadingLabel ? (
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {loadingLabel}
          </p>
        ) : null}
      </div>
    );
  }

  if (variant === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 ${py} px-6 text-center`}>
        <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
          {errorMessage ?? 'Error'}
        </p>
        {onRetry && retryLabel ? (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--dome-accent)', color: '#fff' }}
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${py} px-6 text-center`}>
      {icon ? (
        <div
          className="rounded-xl p-3 mb-1"
          style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        >
          {icon}
        </div>
      ) : null}
      {title ? (
        <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
          {title}
        </p>
      ) : null}
      {description ? (
        <p className="text-xs max-w-sm" style={{ color: 'var(--dome-text-muted)' }}>
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
