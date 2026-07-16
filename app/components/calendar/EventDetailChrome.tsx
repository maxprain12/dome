import {
  ColorPill,
  InlineDetailCard,
  type InlineDetailCardProps,
} from '@/components/shared/InlineDetailCard';

/** Re-export for calendar callers that used EventColorPill. */
export const EventColorPill = ColorPill;

export type EventDetailChromeProps = InlineDetailCardProps;

/**
 * Calendar event ficha — thin wrapper over shared InlineDetailCard.
 */
export function EventDetailChrome({
  children,
  footer,
  ...rest
}: EventDetailChromeProps) {
  return (
    <InlineDetailCard containerName="event-card" footer={footer ?? <span />} {...rest}>
      {children}
    </InlineDetailCard>
  );
}
