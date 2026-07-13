import type { ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { CancelCircleIcon, ChevronRightIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { ToolCallData } from './ChatToolCard';

export interface ChatToolMarkerProps {
  label: ReactNode;
  summary?: string | null;
  status: ToolCallData['status'];
  icon: IconSvgElement;
  expanded?: boolean;
  expandable?: boolean;
  onToggle?: () => void;
  className?: string;
  trailing?: ReactNode;
}

/** Compact tool activity row for chat threads (shadcn Marker pattern). */
export function ChatToolMarker({
  label,
  summary,
  status,
  icon,
  expanded = false,
  expandable = false,
  onToggle,
  className,
  trailing,
}: ChatToolMarkerProps) {
  const isPending = status === 'pending' || status === 'running';

  const markerIcon = isPending ? (
    <Spinner />
  ) : status === 'error' ? (
    <HugeiconsIcon icon={CancelCircleIcon} className="size-4 text-destructive" />
  ) : status === 'success' ? (
    <HugeiconsIcon icon={Tick02Icon} className="size-4 text-muted-foreground" strokeWidth={2.4} />
  ) : (
    <HugeiconsIcon icon={icon} className="size-4" strokeWidth={1.8} />
  );

  const markerBody = (
    <>
      <MarkerIcon>{markerIcon}</MarkerIcon>
      <MarkerContent
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-0.5 leading-tight',
          isPending && 'shimmer',
        )}
      >
        <span className="truncate font-medium">{label}</span>
        {summary ? <span className="truncate text-xs text-muted-foreground">{summary}</span> : null}
      </MarkerContent>
      {expandable ? (
        <HugeiconsIcon
          icon={ChevronRightIcon}
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
          aria-hidden
        />
      ) : null}
      {trailing}
    </>
  );

  if (expandable && onToggle) {
    return (
      <Marker
        variant="border"
        role={isPending ? 'status' : undefined}
        className={cn('not-typeset w-full', className)}
        render={
          <Button
            type="button"
            variant="ghost"
            aria-expanded={expanded}
            className="w-full transition-colors hover:text-foreground"
            onClick={onToggle}
          />
        }
      >
        {markerBody}
      </Marker>
    );
  }

  return (
    <Marker
      variant="border"
      role={isPending ? 'status' : undefined}
      className={cn('not-typeset w-full', className)}
    >
      {markerBody}
    </Marker>
  );
}

export interface ChatToolGroupMarkerProps {
  label: ReactNode;
  status: ToolCallData['status'];
  icon: IconSvgElement;
  expanded?: boolean;
  onToggle: () => void;
  className?: string;
}

/** Grouped tool calls header row. */
export function ChatToolGroupMarker({
  label,
  status,
  icon,
  expanded = false,
  onToggle,
  className,
}: ChatToolGroupMarkerProps) {
  return (
    <ChatToolMarker
      label={label}
      status={status}
      icon={icon}
      expanded={expanded}
      expandable
      onToggle={onToggle}
      className={className}
    />
  );
}
