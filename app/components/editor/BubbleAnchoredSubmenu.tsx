import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface BubbleAnchoredSubmenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  width?: number;
  children: ReactNode;
}

function isValidAnchor(rect: DOMRect | null): rect is DOMRect {
  if (!rect) return false;
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return false;
  return true;
}

export function BubbleAnchoredSubmenu({
  open,
  onOpenChange,
  anchorRef,
  width = 220,
  children,
}: BubbleAnchoredSubmenuProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      const anchorEl = anchorRef.current;
      if (!anchorEl) {
        setPosition(null);
        return;
      }
      const rect = anchorEl.getBoundingClientRect();
      const valid = isValidAnchor(rect);
      if (!valid) {
        setPosition(null);
        return;
      }
      setPosition({
        top: rect.bottom + 8,
        left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      });
    };

    update();
    const raf = requestAnimationFrame(() => update());
    const onScrollOrResize = () => update();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (anchorRef.current?.contains(target)) return;
      const panel = document.querySelector('.bubble-submenu-panel');
      if (panel?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [open, onOpenChange, anchorRef]);

  if (!open || !position) return null;

  return createPortal(
    <div
      className="bubble-submenu-panel"
      tabIndex={-1}
      role="menu"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width,
        zIndex: 10001,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function BubbleSubmenuItem({
  children,
  disabled,
  onSelect,
}: {
  children: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="bubble-submenu-item"
      disabled={disabled}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

export function BubbleSubmenuLabel({ children }: { children: ReactNode }) {
  return <div className="bubble-submenu-label">{children}</div>;
}

export function BubbleSubmenuSeparator() {
  return <div className="bubble-submenu-sep" role="separator" aria-label="Separator" />;
}
