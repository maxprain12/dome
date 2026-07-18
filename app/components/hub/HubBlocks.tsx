import type { ReactNode } from 'react';
import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from '@/lib/utils';

export interface HubSurfaceProps {
  icon?: IconSvgElement;
  title: string;
  description?: string;
  /** Toolbar at the far right of the header (badges, actions). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Page-level inspector header + body (icon tile, title, description). */
export function HubSurface({
  icon,
  title,
  description,
  actions,
  children,
  className,
}: HubSurfaceProps) {
  return (
    <section className={cn('flex w-full min-w-0 flex-col gap-6', className)}>
      <header className="flex items-start gap-3">
        {icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <HugeiconsIcon icon={icon} className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export interface HubGroupProps {
  title?: string;
  description?: string;
  /** Toolbar next to the group label. */
  actions?: ReactNode;
  children: ReactNode;
  /** Render children bare (no bordered list) — for pickers/grids. */
  bare?: boolean;
  className?: string;
}

/** Labeled group of rows inside a rounded bordered card (or bare). */
export function HubGroup({
  title,
  description,
  actions,
  children,
  bare = false,
  className,
}: HubGroupProps) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2', className)}>
      {title || actions ? (
        <div className="flex items-end justify-between gap-2 px-0.5">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      {bare ? (
        children
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>
      )}
    </section>
  );
}

export interface HubRowProps {
  title: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  /** Control aligned to the right of the text. */
  control?: ReactNode;
  /** Wide content under the text (inputs, lists, alerts). */
  children?: ReactNode;
  className?: string;
}

/** One setting/item row: label left, control right (or children below). */
export function HubRow({
  title,
  description,
  htmlFor,
  control,
  children,
  className,
}: HubRowProps) {
  const TitleTag = htmlFor ? 'label' : 'p';
  return (
    <div className={cn('flex flex-col gap-2.5 px-4 py-3', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <TitleTag htmlFor={htmlFor} className="block text-sm font-medium">
            {title}
          </TitleTag>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {control ? <div className="flex shrink-0 items-center gap-2">{control}</div> : null}
      </div>
      {children}
    </div>
  );
}
