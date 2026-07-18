import type { ReactNode } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { Marker, MarkerContent, MarkerIcon, markerVariants } from '@/components/ui/marker';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type ChatStateMarkerProps = {
  label: string;
  /** Animated shimmer on label (streaming / in-progress). */
  shimmer?: boolean;
  /** Show spinner in icon slot (default true). */
  showSpinner?: boolean;
  icon?: ReactNode;
  className?: string;
  contentClassName?: string;
} & Pick<VariantProps<typeof markerVariants>, 'variant'>;

/** Inline status for streaming, analyzing, loading hints, and HITL wait states. */
export function ChatStateMarker({
  label,
  shimmer = true,
  showSpinner = true,
  icon,
  variant = 'default',
  className,
  contentClassName,
}: ChatStateMarkerProps) {
  return (
    <Marker role="status" variant={variant} className={className}>
      {showSpinner || icon ? (
        <MarkerIcon>{icon ?? (showSpinner ? <Spinner /> : null)}</MarkerIcon>
      ) : null}
      <MarkerContent
        className={cn(shimmer && 'shimmer', !shimmer && 'truncate', contentClassName)}
      >
        {label}
      </MarkerContent>
    </Marker>
  );
}

export type ChatSeparatorMarkerProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

/** Labeled divider (dates, section breaks). No role — visible text is announced normally. */
export function ChatSeparatorMarker({ children, className, contentClassName }: ChatSeparatorMarkerProps) {
  return (
    <Marker variant="separator" className={className}>
      <MarkerContent className={contentClassName}>{children}</MarkerContent>
    </Marker>
  );
}
