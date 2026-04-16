import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@mantine/core';
import DomeCard from '@/components/ui/DomeCard';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';

const WEEKS = 18;

/** Altura del bloque de 7 filas (celdas); el ancho lo llenan las columnas `flex-1`. */
const HEATMAP_BODY_H = 'h-28';

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

const LEVEL_BG: Record<number, string> = {
  0: 'color-mix(in srgb, var(--dome-text, var(--primary-text)) 8%, var(--dome-border, var(--border)))',
  1: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 22%, var(--dome-border, var(--border)))',
  2: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 45%, var(--dome-border, var(--border)))',
  3: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 68%, var(--dome-border, var(--border)))',
  4: 'var(--dome-accent, var(--accent))',
};

export function DashboardWeeklyActivity({
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

  const { monthLabels, cells } = useMemo(() => {
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

    const cells: Array<{ date: Date; key: string; level: number; inRange: boolean }> = [];
    for (let col = 0; col < WEEKS; col++) {
      for (let row = 0; row < 7; row++) {
        const date = addDays(startMonday, col * 7 + row);
        const inRange = date <= end && date >= startMonday;
        const key = dayKey(date);
        const raw = activityDayCounts[key] ?? 0;
        const level = inRange ? levelForCount(raw) : 0;
        cells.push({ date, key, level, inRange });
      }
    }

    return { monthLabels, cells };
  }, [activityDayCounts, i18n.language]);

  const monthLabelAtCol = (col: number) => monthLabels.find((m) => m.col === col)?.label ?? '';

  const legendLevels = [0, 1, 2, 3, 4] as const;
  const weekdayLabel = (row: number) => {
    if (row === 0) return t('dashboard.weekday_mon_short');
    if (row === 2) return t('dashboard.weekday_wed_short');
    if (row === 4) return t('dashboard.weekday_fri_short');
    return '';
  };

  return (
    <section className="mb-8">
      <DashboardSectionLabel>{t('dashboard.section_activity_grid')}</DashboardSectionLabel>
      <DomeCard
        padding="lg"
        className="rounded-2xl border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))]"
      >
        {loading ? (
          <div
            className="h-[140px] animate-pulse motion-reduce:animate-none rounded-xl"
            style={{ background: 'var(--dome-border, var(--border))' }}
          />
        ) : (
          <div className="w-full min-w-0 pb-1" role="img" aria-label={t('dashboard.heatmap_aria')}>
            <div className="w-full min-w-0">
              <div className="mb-1 flex w-full min-w-0 gap-[3px]">
                <div className="w-7 shrink-0" aria-hidden />
                {Array.from({ length: WEEKS }, (_, col) => (
                  <div
                    key={`mh-${col}`}
                    className="flex min-h-4 min-w-0 flex-1 basis-0 items-end"
                    style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
                  >
                    <span className="truncate text-[10px] font-medium leading-none">{monthLabelAtCol(col)}</span>
                  </div>
                ))}
              </div>

              <div className="flex w-full min-w-0 gap-[3px]">
                <div className={`flex w-7 shrink-0 flex-col gap-[3px] ${HEATMAP_BODY_H}`}>
                  {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                    <div
                      key={`wl-${row}`}
                      className="flex min-h-0 flex-1 items-center text-[9px] font-medium leading-none tabular-nums"
                      style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
                    >
                      {weekdayLabel(row)}
                    </div>
                  ))}
                </div>

                {Array.from({ length: WEEKS }, (_, col) => (
                  <div
                    key={`wc-${col}`}
                    className={`flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-[3px] ${HEATMAP_BODY_H}`}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((row) => {
                      const idx = col * 7 + row;
                      const cell = cells[idx];
                      if (!cell) return null;
                      const count = activityDayCounts[cell.key] ?? 0;
                      const tooltipLabel = t('dashboard.heatmap_tooltip', {
                        date: heatmapDateFmt.format(cell.date),
                        count,
                      });
                      return (
                        <Tooltip
                          key={cell.key}
                          label={tooltipLabel}
                          position="top"
                          withArrow
                          arrowSize={6}
                          openDelay={120}
                          closeDelay={80}
                          transitionProps={{ duration: 120 }}
                          className="min-h-0 min-w-0 flex-1 basis-0"
                          classNames={{
                            tooltip:
                              'border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] text-[var(--dome-text,var(--primary-text))] text-xs font-medium shadow-md',
                          }}
                        >
                          <div
                            className="h-full min-h-[5px] w-full cursor-default rounded-[3px] transition-opacity hover:opacity-[0.92] motion-reduce:transition-none"
                            style={{
                              background: cell.inRange ? LEVEL_BG[cell.level] : LEVEL_BG[0],
                              opacity: cell.inRange ? 1 : 0.38,
                              boxShadow: cell.inRange ? undefined : 'inset 0 0 0 1px color-mix(in srgb, var(--dome-border, var(--border)) 65%, transparent)',
                            }}
                            role="presentation"
                            tabIndex={-1}
                          />
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div
                className="mt-4 flex flex-wrap items-center justify-end gap-3 text-[10px] font-medium"
                style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
              >
                <span>{t('dashboard.heatmap_less')}</span>
                <div className="flex gap-1" aria-hidden>
                  {legendLevels.map((lv) => (
                    <span
                      key={lv}
                      className="inline-block h-[11px] w-[11px] rounded-[3px]"
                      style={{ background: LEVEL_BG[lv] }}
                    />
                  ))}
                </div>
                <span>{t('dashboard.heatmap_more')}</span>
              </div>
            </div>
          </div>
        )}
      </DomeCard>
    </section>
  );
}
