import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface PageToolbarProps {
  primary?: ReactNode;
  secondary?: ReactNode;
  className?: string;
  separated?: boolean;
}

export function PageToolbar({ primary, secondary, className, separated = true }: PageToolbarProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {separated ? <Separator /> : null}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2" role="toolbar">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{primary}</div>
        {secondary ? <div className="flex shrink-0 flex-wrap items-center gap-2">{secondary}</div> : null}
      </div>
    </div>
  );
}
