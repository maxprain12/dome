import {
  ColorPill,
  InlineDetailCard,
  type InlineDetailCardProps,
} from '@/components/shared/InlineDetailCard';

/** Re-export for calendar callers that used EventColorPill. */
export const EventColorPill = ColorPill;

export type EventDetailChromeProps = InlineDetailCardProps;

/**
 * Calendar event detail — shared modal with calendar identity and persistent actions.
 */
export function EventDetailChrome({
  children,
  footer,
  ...rest
}: EventDetailChromeProps) {
  return (
    <InlineDetailCard containerName="event-card" size="compact" footer={footer} {...rest}>
      {children}
    </InlineDetailCard>
  );
}
