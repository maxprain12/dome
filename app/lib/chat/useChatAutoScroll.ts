import { useCallback, useEffect, useRef, type RefObject } from 'react';

export interface ChatAutoScrollOptions {
  /** Distance from bottom (px) treated as "pinned to bottom". */
  nearBottomThreshold?: number;
  /** When true, use instant scroll (streaming); otherwise smooth. */
  isStreaming?: boolean;
}

/**
 * Auto-scroll chat message lists without fighting manual scroll-up during generation.
 */
export function useChatAutoScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  endRef: RefObject<HTMLDivElement | null>,
  deps: unknown[],
  options: ChatAutoScrollOptions = {},
) {
  const { nearBottomThreshold = 100, isStreaming = false } = options;
  const userHasScrolledUpRef = useRef(false);
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    userHasScrolledUpRef.current = distanceFromBottom > nearBottomThreshold + 50;
  }, [containerRef, nearBottomThreshold]);

  const scrollToBottom = useCallback(
    (force = false) => {
      const container = containerRef.current;
      if (!container) return;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const isNearBottom = distanceFromBottom < nearBottomThreshold;
      if (!force && userHasScrolledUpRef.current && !isNearBottom) return;
      if (force) userHasScrolledUpRef.current = false;
      if (isNearBottom) userHasScrolledUpRef.current = false;

      const behavior =
        force || isStreaming || prefersReducedMotion ? 'auto' : 'smooth';
      endRef.current?.scrollIntoView({ behavior });
    },
    [containerRef, endRef, isStreaming, nearBottomThreshold, prefersReducedMotion],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, handleScroll]);

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps supplied by caller
  }, deps);

  return { scrollToBottom, resetScrollLock: () => { userHasScrolledUpRef.current = false; } };
}
