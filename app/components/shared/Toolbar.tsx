import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { collectCompoundSlots, defineSlot } from '@/lib/utils/compoundSlots';

export interface ToolbarProps {
  className?: string;
  /** Padding vertical más compacto (p. ej. toolbars de viewers). */
  dense?: boolean;
  children?: ReactNode;
}

const Leading = defineSlot('Toolbar.Leading');
const Trailing = defineSlot('Toolbar.Trailing');

/**
 * Barra de herramientas con borde inferior y slots leading/trailing.
 * Usa tokens `--dome-border` con fallback a `--border`.
 */
function Toolbar({ className, dense = false, children }: ToolbarProps) {
  const { leading, trailing } = collectCompoundSlots(children, {
    leading: Leading,
    trailing: Trailing,
  });

  return (
    <div
      className={cn(
        'shrink-0 flex flex-wrap items-center justify-between gap-2 min-w-0',
        dense ? 'px-3 py-2' : 'px-4 py-3',
        'border-b border-border bg-card',
        className,
      )}
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

Toolbar.Leading = Leading;
Toolbar.Trailing = Trailing;

export default Toolbar;
