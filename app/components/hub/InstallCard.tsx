import type { ReactNode } from 'react';
import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface InstallCardProps {
  icon?: IconSvgElement;
  /** Custom icon node when not using Hugeicons. */
  iconNode?: ReactNode;
  title: string;
  description?: string;
  actionLabel: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  className?: string;
}

/** Marketplace-style catalog tile: icon, title, description, install CTA. */
export function InstallCard({
  icon,
  iconNode,
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled,
  className,
}: InstallCardProps) {
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-none',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <HugeiconsIcon icon={icon} className="size-5" />
          </span>
        ) : iconNode ? (
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {iconNode}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-auto">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={actionDisabled || !onAction}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>
    </article>
  );
}
