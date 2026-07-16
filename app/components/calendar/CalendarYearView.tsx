'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
    <div className="grid h-full min-h-0 grid-cols-3 gap-3 overflow-auto p-4 md:grid-cols-4">
      {months.map((month) => {
        const mStart = startOfMonth(month);
        const mEnd = endOfMonth(month);
        const calStart = startOfWeek(mStart, { weekStartsOn: 1 });
        const calEnd = endOfWeek(mEnd, { weekStartsOn: 1 });
        const days = eachDayOfInterval({ start: calStart, end: calEnd });
        const monthEvs = eventsByMonth.get(month.getMonth()) ?? [];
        const isCurrentMonth = isSameMonth(month, new Date());

        return (
          <Button
            key={month.toISOString()}
            type="button"
            variant="outline"
            aria-label={format(month, 'MMMM yyyy', { locale: dfLocale })}
            className={cn(
              'h-auto w-full cursor-pointer rounded-xl bg-card p-3 text-left transition-[box-shadow,border-color] hover:shadow-md',
              isCurrentMonth && 'border-primary',
            )}
            onClick={() => onMonthClick(month)}
          >
            <div
              className={cn(
                'mb-2 text-[12px] font-semibold capitalize',
                isCurrentMonth && 'text-primary',
              )}
            >
              {format(month, 'MMMM', { locale: dfLocale })}
            </div>

            <div className="mb-1 grid grid-cols-7 gap-px">
              {weekdayNarrowLabels.map((d, i) => (
                <div key={`${d}-${i}`} className="text-center text-[12px] leading-none text-muted-foreground">{d}</div>
              ))}
              {days.map((day) => {
                const inMonth = isSameMonth(day, month);
                const today = isToday(day);
                const hasEvs = monthEvs.some((ev) => isSameDay(new Date(ev.start_at), day));
                return (
                  <div
                    key={day.toISOString()}
                    className="relative flex h-4 items-center justify-center"
                  >
                    <span
                      className={cn(
                        'flex size-4 items-center justify-center rounded-full text-[12px] leading-none',
                        !inMonth && 'text-transparent',
                        inMonth && today && 'bg-primary font-bold text-primary-foreground',
                      )}
                    >
                      {inMonth ? format(day, 'd') : '·'}
                    </span>
                    {hasEvs && inMonth && !today && (
                      <div className="absolute bottom-0 left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>

            {monthEvs.length > 0 && (
              <div className="mt-1 text-[12px] text-muted-foreground">
                {t('calendarPage.events_count', { count: monthEvs.length })}
              </div>
            )}
          </Button>
        );
      })}
    </div>
  );
}
