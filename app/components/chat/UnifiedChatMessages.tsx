import { forwardRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/utils';

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
    <div
      ref={ref}
      {...(dataSurface ? { 'data-surface': dataSurface } : {})}
      {...(dataDensity ? { 'data-density': dataDensity } : {})}
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
