import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DomeCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'sm' | 'md' | 'lg';
}

const paddingClass: Record<NonNullable<DomeCardProps['padding']>, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/**
 * Contenedor de sección (settings, formularios) con tokens del tema.
 */
export default function DomeCard({ children, padding = 'md', className, ...rest }: DomeCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]',
        paddingClass[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
