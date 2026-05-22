import { useLayoutEffect, useState } from 'react';

function isValidSuggestionRect(rect: DOMRect | null): rect is DOMRect {
  if (!rect) return false;
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return false;
  return Number.isFinite(rect.bottom) && Number.isFinite(rect.left);
}

export function useSuggestionPortalPosition(
  clientRect: (() => DOMRect | null) | null,
  active: boolean,
  menuWidth: number,
  repaintKey: unknown = 0,
) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!active || !clientRect) {
      setPosition(null);
      return;
    }

    let raf1 = 0;
    let raf2 = 0;

    const update = () => {
      const rect = clientRect();
      const valid = isValidSuggestionRect(rect);
      if (!valid) {
        setPosition(null);
        return;
      }
      setPosition({
        top: rect.bottom + 6,
        left: Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8),
      });
    };

    update();
    raf1 = requestAnimationFrame(() => {
      update();
      raf2 = requestAnimationFrame(() => update());
    });

    const onScrollOrResize = () => update();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [active, clientRect, menuWidth, repaintKey]);

  return position;
}
