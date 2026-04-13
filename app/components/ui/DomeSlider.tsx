import { forwardRef, useMemo } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface DomeSliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Clase extra para el track (input). */
  trackClassName?: string;
}

function clampPct(n: number) {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * `<input type="range">` con progreso visual vía gradiente y tokens del tema.
 */
const DomeSlider = forwardRef<HTMLInputElement, DomeSliderProps>(function DomeSlider(
  { className, trackClassName, min = 0, max = 100, value, defaultValue, disabled, style, ...rest },
  ref,
) {
  const minN = Number(min);
  const maxN = Number(max);
  const span = maxN - minN || 1;

  const numericValue = useMemo(() => {
    if (value !== undefined && value !== '') return Number(value);
    if (defaultValue !== undefined && defaultValue !== '') return Number(defaultValue);
    return minN;
  }, [value, defaultValue, minN]);

  const pct = clampPct(((numericValue - minN) / span) * 100);

  const trackStyle = useMemo(
    () => ({
      background: disabled
        ? 'var(--bg-tertiary, var(--bg-secondary))'
        : `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--bg-tertiary, var(--bg-secondary)) ${pct}%, var(--bg-tertiary, var(--bg-secondary)) 100%)`,
      ...style,
    }),
    [disabled, pct, style],
  );

  return (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      className={cn(
        'w-full h-2 rounded-full appearance-none cursor-pointer',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--base-text)]',
        '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)]',
        '[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:mt-[-5px]',
        '[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full',
        '[&::-moz-range-thumb]:bg-[var(--base-text)] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--accent)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        disabled && 'opacity-50 cursor-not-allowed',
        trackClassName,
        className,
      )}
      style={trackStyle}
      {...rest}
    />
  );
});

export default DomeSlider;
