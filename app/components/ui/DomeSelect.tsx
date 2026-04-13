import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface DomeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  selectClassName?: string;
}

/**
 * Select nativo con label, hint y error, alineado con `DomeInput`.
 */
export const DomeSelect = forwardRef<HTMLSelectElement, DomeSelectProps>(function DomeSelect(
  { label, error, hint, id, className, selectClassName, disabled, children, ...rest },
  ref,
) {
  const genId = useId();
  const selectId = id ?? (typeof rest.name === 'string' ? rest.name : undefined) ?? `dome-select-${genId}`;

  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label ? (
        <label htmlFor={selectId} className="text-xs font-medium text-[var(--primary-text)]">
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={selectId}
        disabled={disabled}
        className={cn('input', error && 'border-[var(--error)] focus:border-[var(--error)]', selectClassName)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined
        }
        {...rest}
      >
        {children}
      </select>
      {hint && !error ? (
        <p id={`${selectId}-hint`} className="text-xs text-[var(--tertiary-text)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${selectId}-error`} className="text-xs text-[var(--error)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
