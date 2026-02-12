import { useCallback, useEffect, useRef } from 'react';

const MIN_HEIGHT = 60;

function adjustHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.max(MIN_HEIGHT, el.scrollHeight)}px`;
}

/**
 * Hook to auto-resize a textarea based on its content.
 * Uses JS for broad compatibility; field-sizing:content can be added as progressive enhancement.
 */
export function useTextareaAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback((el: HTMLTextAreaElement | null) => {
    ref.current = el;
    if (el) adjustHeight(el);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    adjustHeight(el);
  }, [value]);

  return setRef;
}
