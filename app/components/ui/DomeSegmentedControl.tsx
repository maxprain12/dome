import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DomeSegmentedControlSize = 'sm' | 'md';

export interface DomeSegmentedOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface DomeSegmentedControlProps {
  options: DomeSegmentedOption[];
  value: string;
  onChange: (next: string) => void;
  size?: DomeSegmentedControlSize;
  className?: string;
  /** Nombre del grupo para accesibilidad. */
  'aria-label'?: string;
  disabled?: boolean;
}

/**
 * Selector segmentado (tabs compactos en una sola fila).
 */
export default function DomeSegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  disabled = false,
}: DomeSegmentedControlProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex min-w-0 max-w-full flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            className={cn(
              'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-[var(--accent)] text-[var(--base-text)] shadow-sm'
                : 'text-[var(--secondary-text)] hover:bg-[var(--bg-hover,var(--bg-tertiary))]',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
