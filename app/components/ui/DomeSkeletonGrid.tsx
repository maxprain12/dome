import { cn } from '@/lib/utils';

export interface DomeSkeletonGridProps {
  count?: number;
  /** Clase Tailwind de altura de cada celda, p. ej. `h-32`. */
  cellHeightClass?: string;
  className?: string;
}

const DEFAULT_LIST = 'flex w-full max-w-full flex-col gap-3';

/**
 * Lista de placeholders de carga alineada con listados hub (vista lista).
 */
export default function DomeSkeletonGrid({
  count = 8,
  cellHeightClass = 'h-24',
  className,
}: DomeSkeletonGridProps) {
  return (
    <div className={cn(DEFAULT_LIST, className)} role="status" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-full rounded-xl border animate-pulse motion-reduce:animate-none',
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
