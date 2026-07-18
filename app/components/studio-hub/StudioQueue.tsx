import type { ReactNode } from 'react';
import ListState from '@/components/shared/ListState';
import { HubSectionLabel } from '@/components/hub/HubSectionLabel';
import { cn } from '@/lib/utils';

export function StudioQueue({
  label,
  children,
  empty,
  loading,
  className,
  footer,
}: {
  label?: string;
  children: ReactNode;
  empty?: { title: string; description?: string; action?: ReactNode };
  loading?: boolean;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <section className={cn('flex min-h-0 flex-col gap-2', className)}>
      {label ? <HubSectionLabel>{label}</HubSectionLabel> : null}
      {loading ? (
        <ListState variant="loading" compact />
      ) : empty ? (
        <ListState
          variant="empty"
          compact
          title={empty.title}
          description={empty.description}
          action={empty.action}
        />
      ) : (
        <div className="flex flex-col gap-0.5">{children}</div>
      )}
      {footer}
    </section>
  );
}
