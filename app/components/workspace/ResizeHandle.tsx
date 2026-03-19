import { useCallback, useRef, useEffect, useState } from 'react';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  direction: 'horizontal' | 'vertical';
  className?: string;
}

export default function ResizeHandle({ onResize, direction, className = '' }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const clientKey = direction === 'horizontal' ? 'clientX' : 'clientY';
      startPosRef.current = e[clientKey];
      setIsDragging(true);
    },
    [direction]
  );

  useEffect(() => {
    if (!isDragging) return;

    const clientKey = direction === 'horizontal' ? 'clientX' : 'clientY';

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = e[clientKey];
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, direction, onResize]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={handleRef}
      onMouseDown={handleMouseDown}
      className={`resize-handle ${isDragging ? 'dragging' : ''} ${className}`}
      style={{
        position: 'relative',
        width: isHorizontal ? 4 : '100%',
        height: isHorizontal ? '100%' : 4,
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: isHorizontal ? 0 : '50%',
          left: isHorizontal ? '50%' : 0,
          transform: isHorizontal ? 'translateX(-50%)' : 'translateY(-50%)',
          width: isHorizontal ? 4 : 24,
          height: isHorizontal ? 24 : 4,
          background: 'transparent',
          borderRadius: 2,
          transition: 'background 150ms ease',
        }}
        className="hover-show"
      />
      <style>{`
        .resize-handle:hover .hover-show,
        .resize-handle.dragging .hover-show {
          background: var(--dome-accent);
        }
        .resize-handle.dragging {
          background: var(--dome-accent);
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
