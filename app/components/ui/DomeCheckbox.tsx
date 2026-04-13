import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface DomeCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  error?: string;
  /** Si es true, muestra etiqueta a la izquierda del control (fila invertida). */
  reverse?: boolean;
}

/**
 * Casilla de verificación con etiqueta y tokens del tema.
 */
export default function DomeCheckbox({
  label,
  description,
  error,
  reverse,
  id,
  className,
  disabled,
  ...rest
}: DomeCheckboxProps) {
  const genId = useId();
  const inputId = id ?? `dome-checkbox-${genId}`;

  return (
    <div className={cn('flex flex-col gap-1 min-w-0', className)}>
      <div
        className={cn(
          'flex items-start gap-3 min-w-0',
          reverse && 'flex-row-reverse justify-between items-center',
        )}
      >
        <input
          id={inputId}
          type="checkbox"
          disabled={disabled}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 rounded border cursor-pointer',
            'border-[var(--border)] bg-[var(--bg)] text-[var(--accent)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          style={{ accentColor: 'var(--accent)' }}
          {...rest}
        />
        {(label || description) && (
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            {label ? (
              <label
                htmlFor={inputId}
                className={cn(
                  'text-sm font-medium text-[var(--primary-text)] cursor-pointer',
                  disabled && 'cursor-not-allowed opacity-70',
                )}
              >
                {label}
              </label>
            ) : null}
            {description ? (
              <p className="text-xs text-[var(--tertiary-text)]">{description}</p>
            ) : null}
          </div>
        )}
      </div>
      {error ? <p className="text-xs text-[var(--error)] pl-7">{error}</p> : null}
    </div>
  );
}
