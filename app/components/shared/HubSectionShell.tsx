import type { ReactNode } from 'react';
import { HubToolbar } from '@/components/hub/HubToolbar';
import { cn } from '@/lib/utils';

export function HubSectionShell({
  toolbar,
  children,
  className,
}: {
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-background', className)}>
      {toolbar ? <HubToolbar>{toolbar}</HubToolbar> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
