import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DomeButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type DomeButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface DomeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: DomeButtonVariant;
  size?: DomeButtonSize;
  iconOnly?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const sizeClasses: Record<DomeButtonSize, string> = {
  xs: 'text-[10px] font-semibold px-2 py-1 rounded-md gap-1',
  sm: 'text-xs font-medium px-2.5 py-1.5 rounded-md gap-1.5',
  md: 'text-sm font-medium px-4 py-2 rounded-lg gap-2',
  lg: 'text-base font-medium px-5 py-2.5 rounded-lg gap-2',
};

const iconOnlyPadding: Record<DomeButtonSize, string> = {
  xs: 'p-1 rounded-md',
  sm: 'p-1.5 rounded-md',
  md: 'p-2 rounded-lg',
  lg: 'p-2.5 rounded-lg',
};

/**
 * Botón unificado con tokens de tema (`globals.css` / variables CSS).
 */
const DomeButton = forwardRef<HTMLButtonElement, DomeButtonProps>(function DomeButton(
  {
    variant = 'primary',
    size = 'md',
    iconOnly = false,
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  const variantClass =
    variant === 'primary'
      ? 'btn btn-primary'
      : variant === 'secondary'
        ? 'btn btn-secondary'
        : variant === 'ghost'
          ? 'btn btn-ghost'
          : '';

  const outlineOrDanger =
    variant === 'outline'
      ? cn(
          'border font-medium transition-all',
          'border-[var(--border)] bg-transparent text-[var(--primary-text)]',
          'hover:bg-[var(--bg-secondary)] hover:border-[var(--border-hover)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        )
      : variant === 'danger'
        ? cn(
            'font-medium text-[var(--base-text)] transition-all',
            'bg-[var(--error)] shadow-sm',
            'hover:brightness-110 active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
          )
        : '';

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center select-none transition-all',
        variant === 'outline' || variant === 'danger' ? outlineOrDanger : variantClass,
        iconOnly ? iconOnlyPadding[size] : sizeClasses[size],
        isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn('shrink-0 animate-spin', size === 'xs' ? 'w-3 h-3' : 'w-4 h-4')} aria-hidden />
      ) : (
        <>
          {leftIcon}
          {iconOnly ? children : null}
        </>
      )}
      {!iconOnly && !loading && children}
      {!loading && !iconOnly && rightIcon}
    </button>
  );
});

export default DomeButton;
