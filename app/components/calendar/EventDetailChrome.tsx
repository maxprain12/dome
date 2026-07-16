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

export interface EventDetailChromeProps {
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Calendar / source color — shown as a pill, never as a gradient strip. */
  accent?: string;
  accentLabel?: string;
  icon?: ReactNode;
  badges?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Colored identity pill (calendar source / type). */
export function EventColorPill({
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
        // Override Badge h-5 + overflow clip that cuts icons/text when nested.
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

/**
 * Inline event ficha (shadcn Card) beside the grid — replaces Upcoming when open.
 */
export function EventDetailChrome({
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
}: EventDetailChromeProps) {
  return (
    <Card
      className={cn(
        '@container/event-card flex h-full min-h-0 w-full min-w-0 flex-col gap-0 overflow-hidden py-0 shadow-none',
        className,
      )}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <CardHeader className="shrink-0 gap-2 border-b px-3 py-3 @[280px]/event-card:px-4">
        <div className="flex min-w-0 items-start gap-2 pr-1 @[280px]/event-card:gap-2.5">
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
                {accentLabel ? (
                  <EventColorPill color={accent}>{accentLabel}</EventColorPill>
                ) : null}
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

      <CardContent className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 @[280px]/event-card:px-4 @[280px]/event-card:py-4">
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </CardContent>

      <CardFooter className="shrink-0 flex-col items-stretch gap-2 border-t px-3 py-3 @[280px]/event-card:flex-row @[280px]/event-card:flex-wrap @[280px]/event-card:items-center @[280px]/event-card:px-4">
        {footer}
      </CardFooter>
    </Card>
  );
}
