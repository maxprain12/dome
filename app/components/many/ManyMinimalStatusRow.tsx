import { cn } from '@/lib/utils';

export interface ManyMinimalStatusRowProps {
  label: string;
  className?: string;
  /** `dots`: static label + animated dots (Many default). `shimmer`: animated gradient label. */
  variant?: 'dots' | 'shimmer';
}

/**
 * Streaming status indicator for Many panel.
 * Default: animated dots + plain secondary label (no label shimmer).
 * Reduced-motion aware via CSS on dots.
 */
export default function ManyMinimalStatusRow({
  label,
  className = '',
  variant = 'dots',
}: ManyMinimalStatusRowProps) {
  return (
    <div
      className={cn('many-minimal-status inline-flex max-w-full items-center gap-2.5 min-w-0', className)}
      role="status"
      aria-live="polite"
    >
      <span className="many-minimal-status-dots inline-flex shrink-0 gap-1" aria-hidden>
        <span className="many-minimal-status-dot" />
        <span className="many-minimal-status-dot" />
        <span className="many-minimal-status-dot" />
      </span>
      <span
        className={cn(
          'min-w-0 truncate text-[13px] font-medium',
          variant === 'shimmer' ? 'many-status-shimmer' : 'text-[var(--secondary-text)]',
        )}
      >
        {label}
      </span>
    </div>
  );
}
