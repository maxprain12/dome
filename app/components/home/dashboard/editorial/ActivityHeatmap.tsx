import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HomeCardHeader } from '@/components/home/dashboard/editorial/HomeSectionHeader';

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

  const { monthLabels, cells, totalActions } = useMemo(() => {
    const end = startOfLocalDay(new Date());
    const endMonday = mondayOfWeek(end);
    const startMonday = addDays(endMonday, -(WEEKS - 1) * 7);

    const monthFormatter = new Intl.DateTimeFormat(i18n.language, { month: 'short' });
    const monthLabels: Array<{ col: number; label: string }> = [];
    let prevMonth = -1;
    for (let col = 0; col < WEEKS; col++) {
      const sample = addDays(startMonday, col * 7 + 3);
      const m = sample.getMonth();
      if (col === 0 || m !== prevMonth) {
        monthLabels.push({ col, label: monthFormatter.format(sample) });
        prevMonth = m;
      }
    }

    const cells: Array<{ date: Date; key: string; level: number; inRange: boolean; count: number }> = [];
    let totalActions = 0;
    for (let col = 0; col < WEEKS; col++) {
      for (let row = 0; row < 7; row++) {
        const date = addDays(startMonday, col * 7 + row);
        const inRange = date <= end && date >= startMonday;
        const key = dayKey(date);
        const raw = activityDayCounts[key] ?? 0;
        if (inRange) totalActions += raw;
        const level = inRange ? levelForCount(raw) : 0;
        cells.push({ date, key, level, inRange, count: raw });
      }
    }

    return { monthLabels, cells, totalActions };
  }, [activityDayCounts, i18n.language]);

  const monthLabelAtCol = (col: number) => monthLabels.find((m) => m.col === col)?.label ?? '';

  const weekdayLabel = (row: number) => {
    if (row === 0) return t('dashboard.weekday_mon_short');
    if (row === 2) return t('dashboard.weekday_wed_short');
    if (row === 4) return t('dashboard.weekday_fri_short');
    return '';
  };

  return (
    <div className="h-card">
      <HomeCardHeader title={t('dashboard.section_activity_grid')} />
      {loading ? (
        <div className="h-heat animate-pulse motion-reduce:animate-none" style={{ minHeight: 120 }} />
      ) : (
        <figure className="h-heat" aria-label={t('dashboard.heatmap_aria')}>
          <div className="h-heat-months">
            {Array.from({ length: WEEKS }, (_, col) => (
              <span key={col} style={{ flex: 1, minWidth: 0 }}>
                {monthLabelAtCol(col)}
              </span>
            ))}
          </div>
          <div className="h-heat-grid">
            <div className="h-heat-days">
              {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                <span key={row} className="h-heat-day-label">
                  {weekdayLabel(row)}
                </span>
              ))}
            </div>
            <div className="h-heat-weeks">
              {Array.from({ length: WEEKS }, (_, col) => (
                <div key={col} className="h-heat-week">
                  {[0, 1, 2, 3, 4, 5, 6].map((row) => {
                    const idx = col * 7 + row;
                    const cell = cells[idx];
                    if (!cell) return null;
                    const tooltipLabel = t('dashboard.heatmap_tooltip', {
                      date: heatmapDateFmt.format(cell.date),
                      count: cell.count,
                    });
                    return (
                      <Tooltip key={cell.key}>
                        <TooltipTrigger
                          render={
                            <div
                              className={`h-heat-cell lvl-${cell.level} ${cell.inRange ? '' : 'future'}`}
                              role="presentation"
                            />
                          }
                        />
                        <TooltipContent
                          side="top"
                          className="border border-[var(--home-edge)] bg-[var(--home-surface)] text-[var(--home-ink)] text-xs font-medium shadow-md"
                        >
                          {tooltipLabel}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="h-heat-legend">
            <span>{t('dashboard.heatmap_weeks_summary', { weeks: WEEKS, count: totalActions })}</span>
            <div className="scale" aria-hidden>
              <span>{t('dashboard.heatmap_less')}</span>
              {[0, 1, 2, 3, 4].map((lv) => (
                <span key={lv} className={`cell lvl-${lv}`} />
              ))}
              <span>{t('dashboard.heatmap_more')}</span>
            </div>
          </div>
        </figure>
      )}
    </div>
  );
}
