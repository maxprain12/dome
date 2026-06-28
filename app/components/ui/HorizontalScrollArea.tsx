import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * Horizontal strip with wheel → scrollLeft translation and click-drag panning.
 * Used for macro chips, tab bars, Kanban-adjacent tool rows, etc.
 */
export default function HorizontalScrollArea({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useHorizontalScroll(ref);

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-0.5',
        className,
      )}
    >
      {children}
    </div>
  );
}
