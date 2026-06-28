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

const ARROW_PATH =
  'M2 1.5 L2 14 L5 10.5 L7.5 16 L9.5 15.2 L7 9.5 L11.5 9.5 Z';

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
    const tick = () => {
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
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, targetSelector]);

  /** Dismiss when the user activates the highlighted control (clicks pass through; overlay is pointer-events-none). */
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
  const CURSOR_W = 22;
  const CURSOR_H = 26;

  return ReactDOM.createPortal(
    <div
      aria-hidden="true"
      className="dome-ui-cursor-overlay pointer-events-none"
    >
      {/* Minimal focus ring */}
      <div
        className="dome-ui-cursor-ring"
        style={{
          left: pos.x - pos.w / 2 - 2,
          top: pos.y - pos.h / 2 - 2,
          width: pos.w + 4,
          height: pos.h + 4,
        }}
      />

      <svg
        width={CURSOR_W}
        height={CURSOR_H}
        viewBox="0 0 13 18"
        className="dome-ui-cursor-arrow"
        style={{
          left: tipX,
          top: tipY,
        }}
      >
        <path
          d={ARROW_PATH}
          fill="var(--dome-surface)"
          stroke="var(--dome-border)"
          strokeWidth="0.85"
          strokeLinejoin="round"
        />
      </svg>

      {tooltip ? (
        <div
          className="dome-ui-cursor-tooltip tabular-nums"
          style={{
            left: tipX + CURSOR_W + 6,
            top: tipY + CURSOR_H * 0.35,
          }}
        >
          {tooltip}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
