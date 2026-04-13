import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface DomeSectionLabelProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Si true, usa estilo “overline” compacto (hub / detalle). */
  compact?: boolean;
}

/**
 * Etiqueta de sección (overline) alineada con tokens del tema.
 */
export default function DomeSectionLabel({
  className,
  compact = true,
  children,
  ...rest
}: DomeSectionLabelProps) {
  return (
    <p
      className={cn(
        'font-semibold uppercase tracking-wide text-[var(--tertiary-text)]',
        compact ? 'text-[10px]' : 'text-xs',
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
}
