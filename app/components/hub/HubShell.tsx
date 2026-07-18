import type { ReactNode } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface HubShellProps {
  /** Optional left rail (nav, filters). Hidden on narrow unless forced. */
  rail?: ReactNode;
  children: ReactNode;
  /** Main column max width class (default centered content). */
  contentClassName?: string;
  className?: string;
  /** Show rail from `md` breakpoint (default true when rail is set). */
  railFromMd?: boolean;
}

/**
 * Optional rail + scrollable main. Rail width matches Settings (~15rem).
 * Use for settings-like hubs; full-bleed data hubs can skip the rail.
 */
export function HubShell({
  rail,
  children,
  contentClassName,
  className,
  railFromMd = true,
}: HubShellProps) {
  const hasRail = Boolean(rail);

  return (
    <div
      className={cn(
        'grid h-full min-h-0 w-full overflow-hidden',
        hasRail && railFromMd
          ? 'grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]'
          : 'grid-cols-1',
        className,
      )}
    >
      {hasRail ? (
        <aside
          className={cn(
            'min-h-0 flex-col border-r bg-card/40',
            railFromMd ? 'hidden md:flex' : 'flex',
          )}
        >
          {rail}
        </aside>
      ) : null}
      <ScrollArea className="min-h-0 min-w-0">
        <div className={cn('mx-auto w-full max-w-2xl px-6 py-8', contentClassName)}>
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
