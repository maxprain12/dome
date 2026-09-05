import type { ReactNode } from 'react';
import { HubHeader } from '@/components/hub/HubHeader';
import { HubPageHeader } from '@/components/hub/HubPageHeader';
import { cn } from '@/lib/utils';

export function HubSectionShell({
  title,
  description,
  actions,
  toolbar,
  children,
  compact,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-background', className)}>
      <HubPageHeader compact={compact}>
        <HubHeader title={title} description={description} actions={actions} />
        {toolbar}
      </HubPageHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
