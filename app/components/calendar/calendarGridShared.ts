import {
  startOfWeek, endOfWeek,
  addDays, addWeeks, addMonths, addYears,
  subDays, subWeeks, subMonths, subYears,
  format,
} from 'date-fns';
import type { Locale } from 'date-fns';
import type { CalendarViewMode } from '@/lib/store/useCalendarStore';

export type EventDateChangePayload = {
  eventId: string;
  newStartAt: number;
  newEndAt: number;
};

export const HOUR_HEIGHT = 56;
export const DAY_START_HOUR = 0;
export const DAY_END_HOUR = 24;
export const MODES: CalendarViewMode[] = ['day', 'week', 'month', 'year'];

export function formatHeader(date: Date, mode: CalendarViewMode, locale: Locale): string {
  switch (mode) {
    case 'day':
      return format(date, 'PPPP', { locale });
    case 'week': {
      const s = startOfWeek(date, { weekStartsOn: 1 });
      const e = endOfWeek(date, { weekStartsOn: 1 });
      return `${format(s, 'd MMM', { locale })} – ${format(e, 'd MMM yyyy', { locale })}`;
    }
    case 'month':
      return format(date, 'MMMM yyyy', { locale });
    case 'year':
      return format(date, 'yyyy');
  }
}

export function navigateDate(date: Date, mode: CalendarViewMode, dir: 1 | -1): Date {
  switch (mode) {
    case 'day':   return dir === 1 ? addDays(date, 1)   : subDays(date, 1);
    case 'week':  return dir === 1 ? addWeeks(date, 1)  : subWeeks(date, 1);
    case 'month': return dir === 1 ? addMonths(date, 1) : subMonths(date, 1);
    case 'year':  return dir === 1 ? addYears(date, 1)  : subYears(date, 1);
  }
}
