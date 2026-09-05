import type { ReactNode } from 'react';
import { hubFichaTitleClass } from '@/components/shared/hubChrome';
import { cn } from '@/lib/utils';

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
        <div className="relative flex flex-col items-center gap-2 border-b px-3 pb-4 pt-4">
          {actions ? (
            <div className="absolute right-3 top-3 flex items-center gap-1">{actions}</div>
          ) : null}
          {icon}
          {title ? (
            <div className="flex max-w-full flex-col items-center gap-1 text-center">
              <div className="flex max-w-full items-center gap-2">
                <h2 className={hubFichaTitleClass}>{title}</h2>
                {badge}
              </div>
              {subtitle}
            </div>
          ) : null}
          {toolbar}
        </div>
      ) : null}
      {tabs}
      {children}
    </div>
  );
}
