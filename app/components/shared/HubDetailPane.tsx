import type { ReactNode } from 'react';
import { hubFichaTitleClass } from '@/components/shared/hubChrome';
import { cn } from '@/lib/utils';
import { DetailModalClose } from './DetailModal';

export function HubDetailPane({
  icon,
  title,
  badge,
  subtitle,
  actions,
  toolbar,
  tabs,
  children,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasHeader = Boolean(title || actions || icon || toolbar);
  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col overflow-hidden', className)}>
      {hasHeader ? (
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-4">
          {icon}
          {title ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className={hubFichaTitleClass}>{title}</h2>
                {badge}
              </div>
              {subtitle}
            </div>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">{actions}<DetailModalClose /></div>
        </header>
      ) : null}
      {tabs}
      {children}
      {toolbar ? <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3">{toolbar}</footer> : null}
    </div>
  );
}
