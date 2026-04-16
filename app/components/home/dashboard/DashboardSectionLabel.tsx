import type { ReactNode } from 'react';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import { cn } from '@/lib/utils';

export function DashboardSectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DomeSectionLabel compact className={cn('mb-3 tracking-widest text-[var(--dome-text-muted,var(--tertiary-text))]', className)}>
      {children}
    </DomeSectionLabel>
  );
}
