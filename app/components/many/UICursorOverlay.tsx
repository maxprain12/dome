import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useUICursorStore, resolveSelector } from '@/lib/store/useUICursorStore';

interface CursorPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

function getElementPos(selector: string): CursorPos | null {
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  } catch {
    return null;
  }
}

const ARROW_PATH = 'M2 1.5 L2 14 L5 10.5 L7.5 16 L9.5 15.2 L7 9.5 L11.5 9.5 Z';
const CURSOR_W = 22;
const CURSOR_H = 26;

/**
 * Guided-pointer overlay: when Many wants to show a control, it highlights the
 * target with a focus ring plus a floating arrow + tooltip. Pointer events pass
 * through; activating the highlighted control dismisses the hint.
 */
export default function UICursorOverlay() {
  const { visible, targetSelector, tooltip } = useUICursorStore();
  const [pos, setPos] = useState<CursorPos | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible || !targetSelector) {
      setPos(null);
      return;
    }
    const selector = resolveSelector(targetSelector);
    const update = () => {
      const next = getElementPos(selector);
      setPos((prev) => {
        if (!next && !prev) return prev;
        if (!next) return null;
        if (
          prev &&
          Math.abs(next.x - prev.x) < 0.5 &&
          Math.abs(next.y - prev.y) < 0.5 &&
          Math.abs(next.w - prev.w) < 0.5 &&
          Math.abs(next.h - prev.h) < 0.5
        ) {
          return prev;
        }
        return next;
      });
    };
    const scheduleUpdate = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        update();
      });
    };
    const element = document.querySelector(selector);
    const resizeObserver = element ? new ResizeObserver(scheduleUpdate) : null;
    if (element) resizeObserver?.observe(element);
    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [visible, targetSelector]);

  /** Dismiss when the user activates the highlighted control (overlay is pointer-events-none). */
  useEffect(() => {
    if (!visible || !targetSelector) return;
    const selector = resolveSelector(targetSelector);

    const onPointerDownCapture = (ev: PointerEvent) => {
      const hinted = document.querySelector(selector);
      if (!hinted) return;
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (hinted === t || hinted.contains(t)) {
        useUICursorStore.getState().hide();
      }
    };

    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => document.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [visible, targetSelector]);

  if (!visible || !pos) return null;

  const tipX = pos.x + pos.w * 0.12;
  const tipY = pos.y + pos.h * 0.12;
  const overlayTransition =
    'transition-transform duration-(--duration-overlay) ease-(--ease-out) motion-reduce:transition-none';

  return ReactDOM.createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-(--z-max)">
      <div
        className={`absolute rounded-md border border-primary/55 shadow-lg ${overlayTransition}`}
        style={{
          transform: `translate3d(${pos.x - pos.w / 2 - 2}px, ${pos.y - pos.h / 2 - 2}px, 0)`,
          width: pos.w + 4,
          height: pos.h + 4,
        }}
      />

      <svg
        width={CURSOR_W}
        height={CURSOR_H}
        viewBox="0 0 13 18"
        className={`absolute overflow-visible drop-shadow-sm ${overlayTransition}`}
        style={{ transform: `translate3d(${tipX}px, ${tipY}px, 0)` }}
      >
        <path
          d={ARROW_PATH}
          strokeWidth="0.85"
          strokeLinejoin="round"
          className="fill-card stroke-border"
        />
      </svg>

      {tooltip ? (
        <div
          className={`absolute max-w-70 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium leading-snug text-muted-foreground shadow-md ${overlayTransition}`}
          style={{
            transform: `translate3d(${tipX + CURSOR_W + 6}px, ${tipY + CURSOR_H * 0.35}px, 0)`,
          }}
        >
          {tooltip}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
