import { cn } from '@/lib/utils';

export interface DomeDividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Espacio alrededor (Tailwind), p. ej. `my-2` o `mx-2`. */
  spacingClass?: string;
  className?: string;
}

/**
 * Separador accesible (roles WAI-ARIA).
 */
export default function DomeDivider({
  orientation = 'horizontal',
  spacingClass,
  className,
}: DomeDividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
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
      className={cn('h-px w-full', spacingClass ?? 'my-3', 'bg-[var(--border)]', className)}
    />
  );
}
