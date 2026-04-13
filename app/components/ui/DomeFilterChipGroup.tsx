import { cn } from '@/lib/utils';

export interface DomeFilterChipOption<T extends string | number> {
  value: T;
  label: string;
  /** Color opcional para estado seleccionado (hex o var CSS). */
  selectedColor?: string;
}

export interface DomeFilterChipGroupProps<T extends string | number> {
  options: DomeFilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Tamaño compacto (toolbar hub). */
  dense?: boolean;
  /** Columna (p. ej. sidebar marketplace). */
  layout?: 'horizontal' | 'vertical';
}

/**
 * Grupo de chips de filtro con un único valor activo.
 */
export default function DomeFilterChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  className,
  dense = true,
  layout = 'horizontal',
}: DomeFilterChipGroupProps<T>) {
  const pad = dense ? 'px-2 py-0.5' : 'px-3 py-1';
  const text = dense ? 'text-[10px] font-medium' : 'text-xs font-medium';
  const vertical = layout === 'vertical';

  return (
    <div
      className={cn(
        'flex gap-1',
        vertical ? 'flex-col items-stretch' : 'flex-wrap items-center',
        className,
      )}
      role="group"
      aria-label="Filter"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const accent = opt.selectedColor ?? 'var(--accent)';
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]',
              pad,
              text,
              vertical && 'w-full justify-between text-left inline-flex items-center',
            )}
            style={
              selected
                ? {
                    borderColor: accent,
                    background: `color-mix(in srgb, ${accent} 22%, transparent)`,
                    color: accent,
                  }
                : {
                    borderColor: 'var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--secondary-text)',
                  }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
