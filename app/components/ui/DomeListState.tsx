import type { ReactNode } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import DomeButton from '@/components/ui/DomeButton';

export interface DomeListStateProps {
  variant: 'loading' | 'empty' | 'error';
  loadingLabel?: string;
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  errorMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  /** Ocupa altura completa (p. ej. estados de página). */
  fullHeight?: boolean;
}

/**
 * Estados unificados: carga, vacío y error (hub y vistas generales).
 */
export default function DomeListState({
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
  fullHeight,
}: DomeListStateProps) {
  const { t } = useTranslation();
  const py = compact ? 'py-10' : 'py-14';
  const retry = retryLabel ?? t('ui.try_again');

  if (variant === 'loading') {
    const label = loadingLabel ?? t('ui.loading');
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 px-4',
          fullHeight ? 'h-full p-8 gap-4' : py,
        )}
        role="status"
        aria-live="polite"
      >
        <Loader2
          className={cn(
            'animate-spin motion-reduce:animate-none',
            fullHeight ? 'w-8 h-8 text-[var(--accent)]' : 'w-5 h-5 text-[var(--tertiary-text)]',
          )}
          aria-hidden
        />
        <p className={cn('text-center', fullHeight ? 'text-sm text-[var(--secondary-text)]' : 'text-xs text-[var(--tertiary-text)]')}>
          {label}
        </p>
      </div>
    );
  }

  if (variant === 'error') {
    const msg = errorMessage ?? 'Error';
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 px-6 text-center',
          fullHeight ? 'h-full p-8 gap-4' : py,
        )}
      >
        <AlertCircle className="w-12 h-12 shrink-0 text-[var(--error)]" aria-hidden />
        <p className={cn('font-medium text-[var(--error)]', fullHeight ? 'text-sm max-w-md' : 'text-sm')}>
          {msg}
        </p>
        {onRetry ? (
          <DomeButton type="button" variant="primary" size="sm" onClick={onRetry}>
            {retry}
          </DomeButton>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 text-center',
        fullHeight ? 'h-full p-8 gap-3' : py,
      )}
    >
      {icon ? (
        <div
          className="rounded-xl p-3 mb-1 border border-[var(--border)] bg-[var(--bg-secondary)]"
          style={{
            borderColor: 'var(--dome-border, var(--border))',
            background: 'var(--dome-surface, var(--bg-secondary))',
          }}
        >
          {icon}
        </div>
      ) : null}
      {title ? (
        <p
          className="text-sm font-semibold text-[var(--primary-text)]"
          style={{ color: 'var(--dome-text, var(--primary-text))' }}
        >
          {title}
        </p>
      ) : null}
      {description ? (
        <p
          className="text-xs max-w-sm text-[var(--secondary-text)]"
          style={{ color: 'var(--dome-text-muted, var(--secondary-text))' }}
        >
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
