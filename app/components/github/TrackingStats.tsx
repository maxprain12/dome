import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type TrackingFilter = 'all' | 'open' | 'due_soon' | 'no_objective' | 'done';

export function TrackingStats({
  openCount,
  dueSoonCount,
  noObjectiveCount,
  doneCount,
  activeFilter,
  onFilter,
}: {
  openCount: number;
  dueSoonCount: number;
  noObjectiveCount: number;
  doneCount: number;
  activeFilter: TrackingFilter;
  onFilter: (f: TrackingFilter) => void;
}) {
  const { t } = useTranslation();
  const items: Array<{ key: Exclude<TrackingFilter, 'all'>; label: string; value: number }> = [
    { key: 'open', label: t('github.dash_stat_open'), value: openCount },
    { key: 'due_soon', label: t('github.dash_stat_due_soon'), value: dueSoonCount },
    { key: 'no_objective', label: t('github.dash_stat_no_objective'), value: noObjectiveCount },
    { key: 'done', label: t('github.dash_stat_done'), value: doneCount },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      role="toolbar"
      aria-label={t('github.dash_filters')}
    >
      {items.map((item) => {
        const active = activeFilter === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onFilter(active ? 'all' : item.key)}
            className="text-left"
            aria-pressed={active}
          >
            <Card
              variant={active ? 'lime' : 'default'}
              className={cn(
                'gap-0 py-0 shadow-none transition-[background-color,box-shadow] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none',
                active && 'ring-2 ring-primary/40',
              )}
            >
              <CardContent className="flex flex-col gap-0.5 px-3 py-3">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {item.value}
                </span>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
