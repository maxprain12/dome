
import { useState, useRef, useCallback } from 'react';

interface FlashcardSwipeContainerProps {
  children: React.ReactNode;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  disabled?: boolean;
}

export default function FlashcardSwipeContainer({
  children,
  onSwipeLeft,
  onSwipeRight,
  disabled,
}: FlashcardSwipeContainerProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [exitClass, setExitClass] = useState('');
  const startX = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    setIsDragging(true);
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [disabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || disabled) return;
    const dx = e.clientX - startX.current;
    setOffsetX(dx);
  }, [isDragging, disabled]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging || disabled) return;
    setIsDragging(false);

    const threshold = 100;
    if (offsetX < -threshold) {
      setExitClass('flashcard-exit-left');
      setTimeout(() => {
        onSwipeLeft();
        setExitClass('');
        setOffsetX(0);
      }, 300);
    } else if (offsetX > threshold) {
      setExitClass('flashcard-exit-right');
      setTimeout(() => {
        onSwipeRight();
        setExitClass('');
        setOffsetX(0);
      }, 300);
    } else {
      setOffsetX(0);
    }
  }, [isDragging, disabled, offsetX, onSwipeLeft, onSwipeRight]);

  const rotation = isDragging ? offsetX * 0.05 : 0;
  const opacity = isDragging ? Math.max(0.5, 1 - Math.abs(offsetX) / 300) : 1;

  // Color feedback
  let borderColor = 'var(--border)';
  if (isDragging && offsetX < -50) borderColor = 'var(--error, #ef4444)';
  if (isDragging && offsetX > 50) borderColor = 'var(--success, #10b981)';

  return (
    <div
      className={`flashcard-swipe ${exitClass}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: exitClass ? undefined : `translateX(${offsetX}px) rotate(${rotation}deg)`,
        opacity: exitClass ? undefined : opacity,
        transition: isDragging ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
        borderColor,
        borderWidth: '2px',
        borderStyle: 'solid',
        borderRadius: 'var(--radius-xl, 12px)',
      }}
    >
      {children}

      {/* Swipe indicators */}
      {isDragging && offsetX < -30 && (
        <div
          className="absolute top-6 right-6 px-3 py-1 rounded-full text-sm font-bold"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--error, #ef4444)',
          }}
        >
          Incorrecto
        </div>
      )}
      {isDragging && offsetX > 30 && (
        <div
          className="absolute top-6 left-6 px-3 py-1 rounded-full text-sm font-bold"
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--success, #10b981)',
          }}
        >
          Correcto
        </div>
      )}
    </div>
  );
}
