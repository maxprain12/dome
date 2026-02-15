'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Hook para cerrar elementos (menús, dropdowns) al hacer clic fuera.
 * Usa mousedown + pointerdown con setTimeout(0) para compatibilidad con Windows
 * y evitar que el clic que abre dispare el cierre (race condition).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClickOutside: () => void,
  excludeSelectors?: string[]
) {
  useEffect(() => {
    const handler = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target)) {
        if (excludeSelectors?.some((sel) => (target as Element).closest?.(sel))) {
          return;
        }
        onClickOutside();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('pointerdown', handler);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('pointerdown', handler);
    };
  }, [ref, onClickOutside, excludeSelectors]);
}
