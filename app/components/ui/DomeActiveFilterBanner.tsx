import type { ReactNode } from 'react';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DomeActiveFilterBannerProps {
  /** Texto principal (p. ej. "Filtrando por X"). */
  label: ReactNode;
  onClear: () => void;
  clearLabel?: string;
  className?: string;
}

/**
 * Franja informativa de filtro activo con acción limpiar.
 */
export default function DomeActiveFilterBanner({
  label,
  onClear,
  clearLabel = 'Clear',
  className,
}: DomeActiveFilterBannerProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-4 py-2 border-b text-xs',
        className,
      )}
      style={{
        borderColor: 'var(--dome-border, var(--border))',
        background: 'var(--dome-surface, var(--bg-secondary))',
        color: 'var(--dome-text, var(--primary-text))',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Filter className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{ color: 'var(--dome-accent, var(--accent))' }}
        aria-label={clearLabel}
      >
        <X className="w-3 h-3" aria-hidden />
        {clearLabel}
      </button>
    </div>
  );
}
