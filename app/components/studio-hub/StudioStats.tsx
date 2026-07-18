import { cn } from '@/lib/utils';

export type StudioStatTone = 'default' | 'accent' | 'success' | 'error' | 'warning' | 'info';

export interface StudioStat {
  id: string;
  label: string;
  value: string | number;
  sub?: string;
  tone?: StudioStatTone;
  active?: boolean;
  onClick?: () => void;
}

const TONE_CLASS: Record<StudioStatTone, string> = {
  default: 'text-foreground',
  accent: 'text-primary',
  success: 'text-success',
  error: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
};

/** Compact KPI chips (Social/Email style) — not dense Card grids. */
export function StudioStats({
  stats,
  className,
  compact,
}: {
  stats: StudioStat[];
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
          'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
          stat.active ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/40',
          stat.onClick && 'hover:bg-accent',
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
