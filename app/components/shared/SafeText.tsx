import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SafeTextLines = 1 | 2 | 3;

export type SafeTextProps = {
  children: ReactNode;
  /**
   * Full string for the native tooltip when the visible text is clamped.
   * Defaults to `children` when it is a string.
   */
  title?: string;
  /** 1 = single-line ellipsis; 2–3 = multi-line clamp. */
  lines?: SafeTextLines;
  className?: string;
  as?: ElementType;
};

/**
 * Text that cannot escape its box.
 *
 * Always pair with a parent that has `min-w-0` (flex/grid children default to
 * `min-width: auto` and will blow past the column). Prefer this over raw
 * `truncate` / `line-clamp-*` so the full value stays available via `title`.
 *
 * @see `.claude/sops/text-containment.md`
 */
export function SafeText({
  children,
  title,
  lines = 1,
  className,
  as: Comp = 'span',
}: SafeTextProps) {
  const tip = title ?? (typeof children === 'string' ? children : undefined);

  return (
    <Comp
      className={cn(
        'min-w-0 max-w-full',
        lines === 1 && 'truncate',
        lines === 2 && 'line-clamp-2 break-words',
        lines === 3 && 'line-clamp-3 break-words',
        className,
      )}
      title={tip}
    >
      {children}
    </Comp>
  );
}

export type MetaLineProps = {
  leading: ReactNode;
  trailing: ReactNode;
  /** Full trailing value for tooltip (e.g. long relative time). */
  trailingTitle?: string;
  className?: string;
};

/**
 * Badge/label + secondary meta (time, count) that share one row without
 * either side pushing the other out of the card.
 */
export function MetaLine({ leading, trailing, trailingTitle, className }: MetaLineProps) {
  const tip =
    trailingTitle
    ?? (typeof trailing === 'string' ? trailing : undefined);

  return (
    <div className={cn('flex min-w-0 w-full items-center gap-1.5', className)}>
      <div className="min-w-0 flex-1 overflow-hidden">{leading}</div>
      <SafeText
        className="shrink text-[10px] text-muted-foreground tabular-nums"
        title={tip}
      >
        {trailing}
      </SafeText>
    </div>
  );
}
