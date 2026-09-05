import type { ReactNode } from 'react';
import ListState, { type ListStateProps } from '@/components/shared/ListState';
import { cn } from '@/lib/utils';

/** ListState with hub-detail padding defaults. */
export function HubPaneState({
  className,
  ...props
}: ListStateProps & { className?: string }) {
  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col', className)}>
      <ListState fullHeight {...props} />
    </div>
  );
}

export function HubPane({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>{children}</div>
  );
}
