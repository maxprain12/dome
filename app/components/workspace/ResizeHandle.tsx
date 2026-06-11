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
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
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
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
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
    // Focusable window-splitter (separator + tabIndex + arrow keys) — a valid
    // ARIA pattern these static rules don't model.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={handleRef}
      role="separator"
      aria-orientation={separatorOrientation}
      aria-label={t('workspace.panel_resize_handle')}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable splitter
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
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
