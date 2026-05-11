import { cn } from '@/lib/utils';

export interface ManyMinimalStatusRowProps {
  label: string;
  className?: string;
}

/**
 * Unified busy state for Many: subtle motion + single label line.
 * Pair with `.many-minimal-status` styles in globals.css (reduced motion aware).
 */
export default function ManyMinimalStatusRow({ label, className = '' }: ManyMinimalStatusRowProps) {
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
      <span className="min-w-0 truncate text-[13px] text-[var(--secondary-text)]">{label}</span>
    </div>
  );
}
