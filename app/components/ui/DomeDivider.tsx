import { cn } from '@/lib/utils';

export interface DomeDividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Espacio alrededor (Tailwind), p. ej. `my-2` o `mx-2`. */
  spacingClass?: string;
  className?: string;
  /** Etiqueta accesible opcional (ARIA) para lectores de pantalla. */
  ariaLabel?: string;
}

/**
 * Separador accesible (roles WAI-ARIA).
 */
export default function DomeDivider({
  orientation = 'horizontal',
  spacingClass,
  className,
  ariaLabel,
}: DomeDividerProps) {
  const a11yLabel = ariaLabel ?? 'Separator';
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={a11yLabel}
        className={cn(
          'shrink-0 inline-block w-px self-stretch min-h-[12px]',
          spacingClass ?? 'mx-2',
          'bg-[var(--border)]',
          className,
        )}
      />
    );
  }

  return (
    <div
      role="separator"
      aria-label={a11yLabel}
      className={cn('h-px w-full', spacingClass ?? 'my-3', 'bg-[var(--border)]', className)}
    />
  );
}
