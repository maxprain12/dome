import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface DomeInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  inputClassName?: string;
}

/**
 * Campo de texto con label y error, usando clase `.input` del tema.
 */
export const DomeInput = forwardRef<HTMLInputElement, DomeInputProps>(function DomeInput(
  { label, error, hint, id, className, inputClassName, disabled, ...rest },
  ref,
) {
  const genId = useId();
  const inputId = id ?? (typeof rest.name === 'string' ? rest.name : undefined) ?? `dome-input-${genId}`;

  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label ? (
        <label htmlFor={inputId} className="text-xs font-medium text-[var(--primary-text)]">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        className={cn('input', error && 'border-[var(--error)] focus:border-[var(--error)]', inputClassName)}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        {...rest}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-xs text-[var(--tertiary-text)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-[var(--error)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export interface DomeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  textareaClassName?: string;
}

export const DomeTextarea = forwardRef<HTMLTextAreaElement, DomeTextareaProps>(function DomeTextarea(
  { label, error, hint, id, className, textareaClassName, disabled, rows = 4, ...rest },
  ref,
) {
  const genId = useId();
  const tid = id ?? (typeof rest.name === 'string' ? rest.name : undefined) ?? `dome-textarea-${genId}`;

  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label ? (
        <label htmlFor={tid} className="text-xs font-medium text-[var(--primary-text)]">
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={tid}
        rows={rows}
        disabled={disabled}
        className={cn(
          'input min-h-[96px] resize-y',
          error && 'border-[var(--error)] focus:border-[var(--error)]',
          textareaClassName,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${tid}-error` : hint ? `${tid}-hint` : undefined}
        {...rest}
      />
      {hint && !error ? (
        <p id={`${tid}-hint`} className="text-xs text-[var(--tertiary-text)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${tid}-error`} className="text-xs text-[var(--error)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
