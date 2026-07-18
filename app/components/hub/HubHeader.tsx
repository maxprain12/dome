import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface HubHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Hub page header: title, optional subtitle, trailing actions.
 * Uses a self container so split/narrow panes stack before crushing the title
 * (viewport `sm`/`md` alone is wrong when the shell is wide but the tab is ~500px).
 */
export function HubHeader({ title, description, actions, className }: HubHeaderProps) {
  return (
    <header
      className={cn(
        '@container/hub-header flex w-full min-w-0 flex-col gap-3',
        '@[32rem]/hub-header:flex-row @[32rem]/hub-header:items-start @[32rem]/hub-header:justify-between @[32rem]/hub-header:gap-4',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-balance text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 @[32rem]/hub-header:shrink-0 @[32rem]/hub-header:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
