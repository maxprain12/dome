import { useId, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface DomeToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
  size?: 'sm' | 'md';
}

const trackSize: Record<'sm' | 'md', { track: string; thumb: string; translate: string }> = {
  sm: { track: 'w-9 h-5', thumb: 'w-4 h-4', translate: 'translate-x-4' },
  md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
};

/**
 * Interruptor accesible (role="switch") con tokens del tema.
 */
export default function DomeToggle({
  checked,
  onChange,
  label,
  description,
  size = 'md',
  disabled,
  id,
  className,
  ...rest
}: DomeToggleProps) {
  const genId = useId();
  const switchId = id ?? `dome-toggle-${genId}`;
  const { track, thumb, translate } = trackSize[size];

  const control = (
    <button
      type="button"
      id={switchId}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        track,
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      style={{
        background: checked ? 'var(--accent)' : 'var(--border)',
      }}
      {...rest}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 rounded-full bg-[var(--base-text)] shadow-sm transition-transform motion-reduce:transition-none',
          thumb,
          checked && translate,
        )}
        aria-hidden
      />
    </button>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div className="flex items-start gap-3 min-w-0">
      {control}
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        {label ? (
          <label htmlFor={switchId} className="text-sm font-medium text-[var(--primary-text)] cursor-pointer">
            {label}
          </label>
        ) : null}
        {description ? (
          <p className="text-xs text-[var(--tertiary-text)]">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
