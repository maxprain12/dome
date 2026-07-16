import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const WEEKS = 18;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOfWeek(d: Date): Date {
  const x = startOfLocalDay(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function levelForCount(c: number): number {
  if (c <= 0) return 0;
  if (c <= 2) return 1;
  if (c <= 5) return 2;
  if (c <= 9) return 3;
  return 4;
}

const LEVEL_CLASS = [
  'bg-muted',
  'bg-primary/25',
  'bg-primary/45',
  'bg-primary/70',
  'bg-primary',
] as const;

export function ActivityHeatmap({
  activityDayCounts,
  loading,
}: {
  activityDayCounts: Record<string, number>;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();

  const heatmapDateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [i18n.language],
  );

  const { monthLabels, weeks, totalActions } = useMemo(() => {
    const end = startOfLocalDay(new Date());
    const endMonday = mondayOfWeek(end);
    const startMonday = addDays(endMonday, -(WEEKS - 1) * 7);
    const monthFormatter = new Intl.DateTimeFormat(i18n.language, { month: 'short' });
    const labels: Array<{ col: number; label: string }> = [];
    let prevMonth = -1;
    for (let col = 0; col < WEEKS; col++) {
      const sample = addDays(startMonday, col * 7 + 3);
      const m = sample.getMonth();
      if (col === 0 || m !== prevMonth) {
        labels.push({ col, label: monthFormatter.format(sample) });
        prevMonth = m;
      }
    }

    const weekCols: Array<
      Array<{ date: Date; key: string; level: number; inRange: boolean; count: number }>
    > = [];
    let total = 0;
    for (let col = 0; col < WEEKS; col++) {
      const days: Array<{
        date: Date;
        key: string;
        level: number;
        inRange: boolean;
        count: number;
      }> = [];
      for (let row = 0; row < 7; row++) {
        const date = addDays(startMonday, col * 7 + row);
        const inRange = date <= end && date >= startMonday;
        const key = dayKey(date);
        const raw = activityDayCounts[key] ?? 0;
        if (inRange) total += raw;
        days.push({
          date,
          key,
          level: inRange ? levelForCount(raw) : 0,
          inRange,
          count: raw,
        });
      }
      weekCols.push(days);
    }
    return { monthLabels: labels, weeks: weekCols, totalActions: total };
  }, [activityDayCounts, i18n.language]);

  const weekdayLabels = [
    t('dashboard.weekday_mon_short'),
    '',
    t('dashboard.weekday_wed_short'),
    '',
    t('dashboard.weekday_fri_short'),
    '',
    '',
  ];

  return (
    <div className="flex flex-col gap-3" aria-label={t('dashboard.heatmap_aria')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('dashboard.heatmap_weeks_summary', { weeks: WEEKS, count: totalActions })}
        </p>
        <div className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
          <span>{t('dashboard.heatmap_less')}</span>
          {LEVEL_CLASS.map((cls, i) => (
            <span key={cls} className={cn('size-2.5 rounded-[2px]', cls)} aria-hidden data-level={i} />
          ))}
          <span>{t('dashboard.heatmap_more')}</span>
        </div>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <div className="flex flex-col justify-between py-4 text-[0.625rem] text-muted-foreground">
            {weekdayLabels.map((label, i) => (
              <span key={`wd-${i}`} className="h-2.5 leading-none">
                {label}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1">
              {weeks.map((_, col) => (
                <div
                  key={`ml-${col}`}
                  className="w-2.5 text-center text-[0.625rem] text-muted-foreground"
                >
                  {monthLabels.find((m) => m.col === col)?.label ?? ''}
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              {weeks.map((days, col) => (
                <div key={`w-${col}`} className="flex flex-col gap-1">
                  {days.map((cell) => {
                    const title = t('dashboard.heatmap_tooltip', {
                      date: heatmapDateFmt.format(cell.date),
                      count: cell.count,
                    });
                    return (
                      <Tooltip key={cell.key}>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className={cn(
                                'size-2.5 rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                cell.inRange ? LEVEL_CLASS[cell.level] : 'bg-transparent',
                              )}
                              aria-label={title}
                            />
                          }
                        />
                        <TooltipContent side="top">{title}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
