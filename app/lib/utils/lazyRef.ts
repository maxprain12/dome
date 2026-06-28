import type { MutableRefObject } from 'react';

/** Lazily initialize a ref once (see react-doctor/rerender-lazy-ref-init). */
export function lazyRef<T>(ref: MutableRefObject<T | null>, init: () => T): T {
  if (ref.current === null) {
    ref.current = init();
  }
  return ref.current;
}
