import { useRef } from 'react';

/**
 * Track a prop/value across renders without useState (avoids rerender-state-only-in-handlers).
 * Returns true on the render where `value` changed since the previous render.
 */
export function useRenderPrevRef<T>(value: T): boolean {
  const ref = useRef(value);
  if (Object.is(ref.current, value)) {
    return false;
  }
  ref.current = value;
  return true;
}
