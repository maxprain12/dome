import { cn } from '@/lib/utils';

/**
 * Dome active-selection surface (sidebar / filters / list rows).
 * Mint fill + forest border + rounded pill/soft rectangle.
 * See `.claude/rules/new-color-palette.md` → “Active selection”.
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
      ? 'border-primary bg-brand-mint text-foreground'
      : 'border-transparent bg-transparent text-foreground hover:bg-brand-mint/55',
    className,
  );
}
