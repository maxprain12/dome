import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DomeCollapsibleRowProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Contenido del trigger (título, icono, etc.). El chevron se añade al final. */
  trigger: ReactNode;
  /** Contenido colapsable debajo del trigger. */
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  /** Cuando el trigger es solo icono, p. ej. `aria-label="Expandir herramienta"`. */
  'aria-label'?: string;
}

/**
 * Fila colapsable con chevron, `aria-expanded` y panel asociado.
 */
export default function DomeCollapsibleRow({
  expanded,
  onExpandedChange,
  trigger,
  children,
  disabled = false,
  className,
  triggerClassName,
  panelClassName,
  'aria-label': ariaLabel,
}: DomeCollapsibleRowProps) {
  const panelId = useId();
  const hasBody = children != null;

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        disabled={disabled || !hasBody}
        aria-expanded={hasBody ? expanded : undefined}
        aria-controls={hasBody ? panelId : undefined}
        onClick={() => hasBody && !disabled && onExpandedChange(!expanded)}
        aria-label={ariaLabel}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 text-left rounded-lg px-2 py-1.5',
          'text-[var(--primary-text)] transition-colors',
          hasBody && !disabled
            ? 'hover:bg-[var(--bg-hover,var(--bg-secondary))] cursor-pointer'
            : 'cursor-default',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 flex items-center gap-2">{trigger}</span>
        {hasBody ? (
          <ChevronDown
            className={cn(
              'shrink-0 w-4 h-4 text-[var(--tertiary-text)] transition-transform motion-reduce:transition-none',
              expanded ? 'rotate-180' : 'rotate-0',
            )}
            aria-hidden
          />
        ) : null}
      </button>
      {hasBody && expanded ? (
        <div
          id={panelId}
          role="region"
          className={cn('min-w-0 pt-1 pb-2 pl-1', panelClassName)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
