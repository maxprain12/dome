import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DomeSubpageFooterProps {
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Pie de subpágina con borde superior (acciones primarias / secundarias).
 */
export default function DomeSubpageFooter({ leading, trailing, children, className }: DomeSubpageFooterProps) {
  return (
    <footer
      className={cn(
        'shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg)]',
        className,
      )}
      style={{ borderTopColor: 'var(--dome-border, var(--border))' }}
    >
      <div className="min-w-0 flex items-center gap-2">{leading}</div>
      <div className="shrink-0 flex items-center gap-2">{trailing ?? children}</div>
    </footer>
  );
}
