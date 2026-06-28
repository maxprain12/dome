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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount listener cleanup via ref
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
    <button
      type="button"
      aria-label="Resize panel"
      className="shrink-0 w-1.5 cursor-col-resize flex items-center justify-center group hover:bg-[var(--accent)]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] border-0 p-0 m-0 min-w-0 self-stretch"
      style={{ minWidth: 6, height: 'auto' }}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    />
  );
}
