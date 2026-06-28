import { useCallback, useRef, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  direction: 'horizontal' | 'vertical';
  className?: string;
}

export default function ResizeHandle({ onResize, direction, className = '' }: ResizeHandleProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);
  const handleRef = useRef<HTMLButtonElement>(null);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
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

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLHRElement>) => {
      const step = 8;
      if (direction === 'horizontal') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onResize(-step);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onResize(step);
        }
      } else {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          onResize(-step);
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          onResize(step);
        }
      }
    },
    [direction, onResize],
  );

  const separatorOrientation = direction === 'horizontal' ? 'vertical' : 'horizontal';
  const isHorizontal = direction === 'horizontal';

  return (
    <button
      type="button"
      ref={handleRef}
      aria-label={t('workspace.panel_resize_handle')}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      className={`resize-handle border-0 p-0 m-0 min-w-0 ${isDragging ? 'dragging' : ''} ${className}`}
      style={{
        position: 'relative',
        width: isHorizontal ? 4 : '100%',
        height: isHorizontal ? '100%' : 4,
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        flexShrink: 0,
        zIndex: 10,
        background: 'transparent',
      }}
    />
  );
}
