import type { ReactNode } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

/** Colored identity pill — overrides Badge h-5/overflow clip. */
export function ColorPill({
  color,
  children,
  className,
}: {
  color?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant={color ? 'outline' : 'secondary'}
      className={cn(
        'h-auto max-w-full min-w-0 gap-1 overflow-visible border-transparent py-0.5 font-normal leading-none',
        '[&_svg]:size-2.5 [&_svg]:shrink-0',
        color && 'text-white',
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
    </Badge>
  );
}

export interface InlineDetailCardProps {
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  accent?: string;
  accentLabel?: string;
  icon?: ReactNode;
  badges?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Container query name prefix for responsive padding. */
  containerName?: string;
}

/**
 * Master–detail side Card (no Sheet/Drawer). Domain wrappers add accent/pills.
 * See `.claude/sops/inline-detail-surfaces.md`.
 */
export function InlineDetailCard({
  onClose,
  title,
  description,
  accent,
  accentLabel,
  icon,
  badges,
  footer,
  children,
  className,
  containerName = 'detail-card',
}: InlineDetailCardProps) {
  const cq = containerName;
  return (
    <Card
      className={cn(
        `@container/${cq} flex h-full min-h-0 w-full min-w-0 flex-col gap-0 overflow-hidden py-0 shadow-none`,
        className,
      )}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <CardHeader className={cn('shrink-0 gap-2 border-b px-3 py-3', `@[280px]/${cq}:px-4`)}>
        <div className={cn('flex min-w-0 items-start gap-2 pr-1', `@[280px]/${cq}:gap-2.5`)}>
          {icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-3.5">
              {icon}
            </span>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <CardTitle className="break-words text-sm leading-snug whitespace-normal">
              {title}
            </CardTitle>
            {description ? (
              <CardDescription className="break-words whitespace-normal">
                {description}
              </CardDescription>
            ) : null}
            {(accentLabel || badges) ? (
              <div className="flex min-w-0 flex-wrap gap-1.5 pt-0.5">
                {accentLabel ? <ColorPill color={accent}>{accentLabel}</ColorPill> : null}
                {badges}
              </div>
            ) : null}
          </div>
        </div>
        <CardAction>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            <span className="sr-only">Close</span>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3',
          `@[280px]/${cq}:px-4 @[280px]/${cq}:py-4`,
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </CardContent>

      {footer != null ? (
        <CardFooter
          className={cn(
            'shrink-0 flex-col items-stretch gap-2 border-t px-3 py-3',
            `@[280px]/${cq}:flex-row @[280px]/${cq}:flex-wrap @[280px]/${cq}:items-center @[280px]/${cq}:px-4`,
          )}
        >
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
