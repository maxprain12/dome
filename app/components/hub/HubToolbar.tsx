import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Single operational row for hub pages — no page title, no muted strip. */
export function HubToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 w-full shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b bg-background px-4 py-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
