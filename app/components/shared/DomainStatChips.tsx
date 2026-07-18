import { cn } from '@/lib/utils';

export type DomainStatTone = 'default' | 'accent' | 'success' | 'error' | 'warning' | 'info';

export interface DomainStat {
  id: string;
  label: string;
  value: string | number;
  sub?: string;
  tone?: DomainStatTone;
  active?: boolean;
  onClick?: () => void;
}

const TONE_CLASS: Record<DomainStatTone, string> = {
  default: 'text-foreground',
  accent: 'text-primary',
  success: 'text-success',
  error: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
};

/** Compact domain KPI chips — not a page shell. */
export function DomainStatChips({
  stats,
  className,
  compact,
}: {
  stats: DomainStat[];
  className?: string;
  compact?: boolean;
}) {
  if (stats.length === 0) return null;
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-1.5',
        compact ? 'gap-1' : 'gap-1.5',
        className,
      )}
    >
      {stats.map((stat) => {
        const body = (
          <>
            <span className={cn('font-semibold tabular-nums', TONE_CLASS[stat.tone ?? 'default'])}>
              {stat.value}
            </span>
            <span className="text-muted-foreground">{stat.label}</span>
            {stat.sub && !compact ? (
              <span className="hidden text-muted-foreground/80 sm:inline">· {stat.sub}</span>
            ) : null}
          </>
        );
        const cls = cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
          'transition-[background-color,border-color,transform] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none motion-reduce:active:scale-100',
          stat.active ? 'border-primary bg-brand-mint' : 'border-border bg-muted/40',
          stat.onClick && 'hover:bg-brand-mint/70 active:scale-[0.97]',
        );
        if (stat.onClick) {
          return (
            <button key={stat.id} type="button" onClick={stat.onClick} className={cls}>
              {body}
            </button>
          );
        }
        return (
          <span key={stat.id} className={cls}>
            {body}
          </span>
        );
      })}
    </div>
  );
}
