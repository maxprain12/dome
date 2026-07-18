import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface HubPageHeaderProps {
  children: ReactNode;
  className?: string;
  /** Tighter padding when a detail rail is open. */
  compact?: boolean;
}

/**
 * Grey chrome for hub section titles (Correo, Agentes, Social, …).
 * Always `bg-muted` — do not use `bg-card` here.
 */
export function HubPageHeader({ children, className, compact }: HubPageHeaderProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col border-b bg-muted',
        compact ? 'gap-2 px-3 py-2' : 'gap-3 px-4 py-3 sm:px-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
