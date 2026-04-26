import { forwardRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/utils';

export interface UnifiedChatMessageAreaProps {
  children: ReactNode;
  className?: string;
  /** Optional inline styles (e.g. dynamic paddings for fullscreen). */
  style?: CSSProperties;
  /** e.g. flex-1 overflow-y-auto min-h-0 */
  fullHeight?: boolean;
}

/**
 * Shared scrollable region for chat message lists (Many + agent).
 * Parents pass the same `ref` to attach scroll/scrollIntoView behavior.
 */
export const UnifiedChatMessageArea = forwardRef(function UnifiedChatMessageArea(
  { children, className, style, fullHeight = true }: UnifiedChatMessageAreaProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'overflow-y-auto overflow-x-hidden overscroll-contain',
        fullHeight && 'flex-1 min-h-0',
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
});
