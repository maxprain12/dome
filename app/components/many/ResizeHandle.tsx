import { useCallback } from 'react';

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
  onResizeEnd?: () => void;
}

export default function ResizeHandle({ onResize, onResizeEnd }: ResizeHandleProps) {
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
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [onResize, onResizeEnd],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="shrink-0 w-1.5 cursor-col-resize flex items-center justify-center group hover:bg-[var(--accent)]/10 transition-colors"
      style={{ minWidth: 6 }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="w-0.5 h-8 rounded-full opacity-0 group-hover:opacity-60 transition-opacity"
        style={{ backgroundColor: 'var(--accent)' }}
      />
    </div>
  );
}
