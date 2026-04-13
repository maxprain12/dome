import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DomeToolbarProps {
  /** Contenido principal (título, meta, chips). */
  leading?: ReactNode;
  /** Acciones / controles a la derecha. */
  trailing?: ReactNode;
  className?: string;
  /** Padding vertical más compacto (p. ej. toolbars de viewers). */
  dense?: boolean;
}

/**
 * Barra de herramientas con borde inferior y slots leading/trailing.
 * Usa tokens `--dome-border` con fallback a `--border`.
 */
export default function DomeToolbar({ leading, trailing, className, dense = false }: DomeToolbarProps) {
  return (
    <div
      className={cn(
        'shrink-0 flex flex-wrap items-center justify-between gap-2 min-w-0',
        dense ? 'px-3 py-2' : 'px-4 py-3',
        'border-b bg-[var(--dome-surface,var(--bg-secondary))]',
        className,
      )}
      style={{ borderBottomColor: 'var(--dome-border, var(--border))' }}
      role="toolbar"
    >
      {leading != null ? (
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">{leading}</div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {trailing != null ? (
        <div className="shrink-0 flex flex-wrap items-center justify-end gap-1.5">{trailing}</div>
      ) : null}
    </div>
  );
}
