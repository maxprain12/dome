'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, eachDayOfInterval, format, isSameDay, isSameMonth,
  isToday, startOfYear, eachMonthOfInterval, endOfYear,
} from 'date-fns';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import type { Locale } from 'date-fns';
import { cn } from '@/lib/utils';

export function YearView({
  date,
  events,
  onMonthClick,
  dfLocale,
}: {
  date: Date;
  events: CalendarEvent[];
  onMonthClick: (d: Date) => void;
  dfLocale: Locale;
}) {
  const { t } = useTranslation();
  const months = eachMonthOfInterval({ start: startOfYear(date), end: endOfYear(date) });

  const weekdayNarrowLabels = useMemo(() => {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(ws, i), 'EEEEE', { locale: dfLocale }).toUpperCase(),
    );
  }, [dfLocale]);

  const eventsByMonth = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const ev of events) {
      const m = new Date(ev.start_at).getMonth();
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(ev);
    }
    return map;
  }, [events]);

  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-3 overflow-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
      {months.map((month) => {
        const mStart = startOfMonth(month);
        const mEnd = endOfMonth(month);
        const calStart = startOfWeek(mStart, { weekStartsOn: 1 });
        const calEnd = endOfWeek(mEnd, { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start: calStart, end: calEnd });
        const monthEvs = eventsByMonth.get(month.getMonth()) ?? [];
        const isCurrentMonth = isSameMonth(month, new Date());

        return (
          <button
            key={month.toISOString()}
            type="button"
            aria-label={format(month, 'MMMM yyyy', { locale: dfLocale })}
            className={cn(
              'flex w-full flex-col items-stretch rounded-xl border bg-card p-3 text-left transition-[box-shadow,border-color] hover:shadow-md',
              'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none',
              isCurrentMonth && 'border-primary',
            )}
            onClick={() => onMonthClick(month)}
          >
            <div
              className={cn(
                'mb-2 text-xs font-semibold capitalize',
                isCurrentMonth && 'text-primary',
              )}
            >
              {format(month, 'MMMM', { locale: dfLocale })}
            </div>

            <div className="mb-1 grid w-full grid-cols-7 gap-px">
              {weekdayNarrowLabels.map((d, i) => (
                <div
                  key={`${d}-${i}`}
                  className="text-center text-[10px] leading-none text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const inMonth = isSameMonth(day, month);
                const today = isToday(day);
                const hasEvs = monthEvs.some((ev) => isSameDay(new Date(ev.start_at), day));
                return (
                  <div
                    key={day.toISOString()}
                    className="relative flex aspect-square items-center justify-center"
                  >
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full text-[10px] leading-none tabular-nums',
                        !inMonth && 'text-transparent',
                        inMonth && !today && 'text-foreground',
                        inMonth && today && 'bg-primary font-bold text-primary-foreground',
                      )}
                    >
                      {inMonth ? format(day, 'd') : ''}
                    </span>
                    {hasEvs && inMonth && !today ? (
                      <div className="absolute bottom-0.5 left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-primary" />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {monthEvs.length > 0 ? (
              <div className="mt-1 text-[10px] text-muted-foreground">
                {t('calendarPage.events_count', { count: monthEvs.length })}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
