import type { ReactNode } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface ViewerShellProps {
  title?: ReactNode;
  contextLabel?: ReactNode;
  toolbar?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Small, format-agnostic document shell. Specialized viewers own their content,
 * persistence and geometry; this component only composes the surrounding chrome.
 */
export default function ViewerShell({
  title,
  contextLabel,
  toolbar,
  status,
  children,
  footer,
  className,
  contentClassName,
}: ViewerShellProps) {
  const hasIdentity = title != null;
  const hasChrome = hasIdentity || toolbar != null || status != null;

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      {hasChrome ? (
        <header className="shrink-0 bg-background">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-2">
            {hasIdentity ? (
              <Breadcrumb className="min-w-0">
                <BreadcrumbList className="flex-nowrap">
                  {contextLabel != null ? (
                    <>
                      <BreadcrumbItem className="shrink-0">{contextLabel}</BreadcrumbItem>
                      <BreadcrumbSeparator />
                    </>
                  ) : null}
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="truncate font-medium">{title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              <span aria-hidden />
            )}
            {toolbar != null ? <div className="flex min-w-0 items-center gap-2">{toolbar}</div> : null}
          </div>
          {status != null ? (
            <div className="flex min-h-8 items-center gap-2 px-4 pb-2 text-xs text-muted-foreground">
              {status}
            </div>
          ) : null}
          <Separator />
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1', contentClassName)}>{children}</div>
      {footer != null ? (
        <footer className="shrink-0 bg-background">
          <Separator />
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
