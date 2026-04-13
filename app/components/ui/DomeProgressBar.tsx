import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DomeProgressBarVariant = 'default' | 'success' | 'error';
export type DomeProgressBarSize = 'sm' | 'md';

export interface DomeProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Valor actual (0–max). Ignorado si `indeterminate`. */
  value?: number;
  max?: number;
  label?: ReactNode;
  variant?: DomeProgressBarVariant;
  size?: DomeProgressBarSize;
  /** Pulso indeterminado (sin porcentaje fijo). */
  indeterminate?: boolean;
  /** Texto accesible (p. ej. "Progreso de indexación"). */
  'aria-label'?: string;
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n) || !Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

const fillVar: Record<DomeProgressBarVariant, string> = {
  default: 'var(--accent)',
  success: 'var(--success, var(--accent))',
  error: 'var(--error, var(--accent))',
};

/**
 * Barra de progreso determinista (no animada por defecto).
 */
export default function DomeProgressBar({
  value = 0,
  max = 100,
  label,
  variant = 'default',
  size = 'md',
  indeterminate = false,
  className,
  'aria-label': ariaLabel,
  ...rest
}: DomeProgressBarProps) {
  const maxN = max > 0 ? max : 1;
  const pct = clamp((value / maxN) * 100, 0, 100);

  return (
    <div className={cn('min-w-0 w-full', className)} {...rest}>
      {label != null ? (
        <div className="mb-1.5 text-xs text-[var(--tertiary-text)]">{label}</div>
      ) : null}
      {indeterminate ? (
        <div
          role="status"
          aria-busy
          aria-label={ariaLabel}
          className={cn(
            'w-full rounded-full overflow-hidden bg-[var(--bg-tertiary,var(--bg-secondary))]',
            size === 'sm' ? 'h-1.5' : 'h-2.5',
          )}
        >
          <div
            className="h-full w-full animate-pulse rounded-full motion-reduce:animate-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)',
            }}
          />
        </div>
      ) : (
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel}
          className={cn(
            'w-full rounded-full overflow-hidden bg-[var(--bg-tertiary,var(--bg-secondary))]',
            size === 'sm' ? 'h-1.5' : 'h-2.5',
          )}
        >
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%`, backgroundColor: fillVar[variant] }}
          />
        </div>
      )}
    </div>
  );
}
