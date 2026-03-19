import { useCallback, useRef } from 'react';

interface SidebarResizeHandleProps {
  onResize: (newWidth: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  min: number;
  max: number;
  side?: 'right' | 'left';
}

export default function SidebarResizeHandle({
  onResize,
  containerRef,
  min,
  max,
  side = 'right',
}: SidebarResizeHandleProps) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      const container = containerRef.current;
      startWidth.current = container ? container.getBoundingClientRect().width : 0;

      const onMove = (moveEvent: MouseEvent) => {
        if (!dragging.current) return;
        const delta = side === 'right'
          ? moveEvent.clientX - startX.current
          : startX.current - moveEvent.clientX;
        const newWidth = Math.min(max, Math.max(min, startWidth.current + delta));
        onResize(newWidth);
      };

      const onUp = () => {
        dragging.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [containerRef, min, max, onResize, side]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="sidebar-resize-handle"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side === 'right' ? 'right' : 'left']: -2,
        width: 4,
        cursor: 'col-resize',
        zIndex: 10,
        transition: 'background-color 150ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--accent)';
        (e.currentTarget as HTMLDivElement).style.opacity = '0.4';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = '';
        (e.currentTarget as HTMLDivElement).style.opacity = '';
      }}
    />
  );
}
