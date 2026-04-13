import { cn } from '@/lib/utils';

export interface DomeSkeletonGridProps {
  count?: number;
  /** Clase Tailwind de altura de cada celda, p. ej. `h-32`. */
  cellHeightClass?: string;
  className?: string;
}

const DEFAULT_GRID =
  'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';

/**
 * Rejilla de placeholders de carga alineada con listados hub.
 */
export default function DomeSkeletonGrid({
  count = 8,
  cellHeightClass = 'h-32',
  className,
}: DomeSkeletonGridProps) {
  return (
    <div className={cn(DEFAULT_GRID, className)} role="status" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-xl border animate-pulse motion-reduce:animate-none',
            cellHeightClass,
          )}
          style={{
            background: 'var(--dome-surface, var(--bg-secondary))',
            borderColor: 'var(--dome-border, var(--border))',
          }}
        />
      ))}
    </div>
  );
}
