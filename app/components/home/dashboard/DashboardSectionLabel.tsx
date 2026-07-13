import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DashboardSectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[10px] font-semibold uppercase tracking-wide text-muted-foreground', 'mb-3 tracking-widest text-[var(--muted-foreground)]', className)}>
      {children}
    </p>
  );
}
