import { cn } from '@/lib/utils';

/**
 * Dome active-selection surface (sidebar / filters / list rows).
 * Soft mint fill with a hairline edge (liquid style).
 */
export function selectionSurfaceClass(
  active: boolean,
  className?: string,
  opts?: { shape?: 'row' | 'chip' },
) {
  const shape = opts?.shape ?? 'row';
  return cn(
    shape === 'chip' ? 'rounded-full' : 'rounded-xl',
    'border transition-[background-color,border-color,color] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none',
    active
      ? 'border-foreground/10 bg-brand-mint text-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,white_55%,transparent)]'
      : 'border-transparent bg-transparent text-foreground hover:bg-foreground/[0.05]',
    className,
  );
}
