import {
  eachDayOfInterval,
  format,
  isSameDay,
  startOfDay,
  subDays,
} from 'date-fns';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';

/** Inclusive calendar days occupied by an event (month view). */
export function getEventSpanDays(ev: CalendarEvent): Date[] {
  const start = startOfDay(new Date(ev.start_at));
  let end = startOfDay(new Date(ev.end_at));

  if (ev.all_day && end > start) {
    const endRaw = new Date(ev.end_at);
    const isExclusiveMidnight =
      endRaw.getHours() === 0 &&
      endRaw.getMinutes() === 0 &&
      endRaw.getSeconds() === 0 &&
      endRaw.getMilliseconds() === 0;
    const isGoogleExclusiveEnd =
      endRaw.getUTCHours() === 23 && endRaw.getUTCMinutes() === 59;

    if (isExclusiveMidnight || isGoogleExclusiveEnd) {
      end = subDays(end, 1);
    }
  }

  if (end < start || isSameDay(start, end)) return [start];
  return eachDayOfInterval({ start, end });
}

/** Events that appear on a given calendar day, sorted by start time. */
export function getEventsForDay(day: Date, events: CalendarEvent[]): CalendarEvent[] {
  const key = format(day, 'yyyy-MM-dd');
  return events
    .filter((ev) => getEventSpanDays(ev).some((d) => format(d, 'yyyy-MM-dd') === key))
    .slice()
    .sort((a, b) => a.start_at - b.start_at);
}
