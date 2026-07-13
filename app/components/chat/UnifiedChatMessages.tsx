import { forwardRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/utils';
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerProvider, MessageScrollerViewport } from '@/components/ui/message-scroller';

export interface UnifiedChatMessageAreaProps {
  children: ReactNode;
  className?: string;
  /** Optional inline styles (e.g. dynamic paddings for fullscreen). */
  style?: CSSProperties;
  /** e.g. flex-1 overflow-y-auto min-h-0 */
  fullHeight?: boolean;
  /** Scope CSS hooks for Many minimal skin */
  dataSurface?: 'many';
  /** Message list density (Many redesign — compact spacing). */
  dataDensity?: 'compact';
}

/**
 * Shared scrollable region for chat message lists (Many + agent).
 * Parents pass the same `ref` to attach scroll/scrollIntoView behavior.
 */
export const UnifiedChatMessageArea = forwardRef(function UnifiedChatMessageArea(
  { children, className, style, fullHeight = true, dataSurface, dataDensity }: UnifiedChatMessageAreaProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <MessageScrollerProvider>
    <MessageScroller
      {...(dataSurface ? { 'data-surface': dataSurface } : {})}
      {...(dataDensity ? { 'data-density': dataDensity } : {})}
      className={cn(
        fullHeight && 'flex-1 min-h-0',
        className,
      )}
      style={style}
    >
      <MessageScrollerViewport ref={ref}>
        <MessageScrollerContent className="gap-5 p-4">{children}</MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
    </MessageScrollerProvider>
  );
});
