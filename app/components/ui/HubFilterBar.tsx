import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function HubFilterBar({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div className={cn('hub-filter-bar', className)} aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function HubFilterRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('hub-filter-row', className)}>
      <span className="hub-filter-label">{label}</span>
      <div className="hub-filter-row-controls">{children}</div>
    </div>
  );
}
