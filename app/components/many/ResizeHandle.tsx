import { useCallback, useRef, useEffect } from 'react';

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
  onResizeEnd?: () => void;
}

export default function ResizeHandle({ onResize, onResizeEnd }: ResizeHandleProps) {
  const listenersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let lastX = e.clientX;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = lastX - moveEvent.clientX;
        lastX = moveEvent.clientX;
        onResize(deltaX);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        onResizeEnd?.();
        listenersRef.current = null;
      };

      listenersRef.current = { move: handleMouseMove, up: handleMouseUp };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize, onResizeEnd],
  );

  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        document.removeEventListener('mousemove', listenersRef.current.move);
        document.removeEventListener('mouseup', listenersRef.current.up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        onResize(e.key === 'ArrowLeft' ? 16 : -16);
        onResizeEnd?.();
      }
    },
    [onResize, onResizeEnd],
  );

  return (
    // Focusable window-splitter (separator + tabIndex + arrow keys) — a valid
    // ARIA pattern the static rule below doesn't model.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable splitter
      tabIndex={0}
      className="shrink-0 w-1.5 cursor-col-resize flex items-center justify-center group hover:bg-[var(--accent)]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={{ minWidth: 6 }}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-0.5 h-8 rounded-full opacity-0 group-hover:opacity-60 transition-opacity"
        style={{ backgroundColor: 'var(--accent)' }}
      />
    </div>
  );
}
