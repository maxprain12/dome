'use client';

import { Fragment, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  startOfDay, addDays, addWeeks, addMonths, addYears,
  subDays, subWeeks, subMonths, subYears,
  eachDayOfInterval, format, isSameDay, isSameMonth,
  isToday, getHours, getMinutes, differenceInMinutes,
  startOfYear, eachMonthOfInterval, endOfYear, addMinutes,
} from 'date-fns';
import type { CalendarEvent, CalendarViewMode } from '@/lib/store/useCalendarStore';
import type { Locale } from 'date-fns';
import { getDateFnsLocale } from '@/lib/i18n';
import { getEventSpanDays } from '@/lib/calendar/dayEvents';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EventDateChangePayload = {
  eventId: string;
  newStartAt: number;
  newEndAt: number;
};

interface CalendarGridProps {
  currentDate: Date;
  viewMode: CalendarViewMode;
  events: CalendarEvent[];
  onCurrentDateChange: (d: Date) => void;
  onViewModeChange: (m: CalendarViewMode) => void;
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onEventDateChange?: (p: EventDateChangePayload) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 56;
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const MODES: CalendarViewMode[] = ['day', 'week', 'month', 'year'];

function formatHeader(date: Date, mode: CalendarViewMode, locale: Locale): string {
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

function navigateDate(date: Date, mode: CalendarViewMode, dir: 1 | -1): Date {
  switch (mode) {
    case 'day':   return dir === 1 ? addDays(date, 1)   : subDays(date, 1);
    case 'week':  return dir === 1 ? addWeeks(date, 1)  : subWeeks(date, 1);
    case 'month': return dir === 1 ? addMonths(date, 1) : subMonths(date, 1);
    case 'year':  return dir === 1 ? addYears(date, 1)  : subYears(date, 1);
  }
}

// ─── EventChip (month view) ───────────────────────────────────────────────────

function EventChip({
  event,
  onClick,
  draggable,
  onDragStart,
}: {
  event: CalendarEvent;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const { t } = useTranslation();
  const bg = event.calendar_color ?? 'var(--primary)';
  const start = new Date(event.start_at);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-[18px] text-primary-foreground transition-opacity hover:opacity-80"
      style={{ backgroundColor: bg }}
      title={event.title}
    >
      {!event.all_day && (
        <span className="opacity-70 mr-1">{format(start, 'HH:mm')}</span>
      )}
      {event.title || t('workspace.untitled')}
    </Button>
  );
}

// ─── MonthView ────────────────────────────────────────────────────────────────

function MonthView({
  date,
  events,
  onDayClick,
  onEventClick,
  onEventDateChange,
  weekdayShortLabels,
}: {
  date: Date;
  events: CalendarEvent[];
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onEventDateChange?: (p: EventDateChangePayload) => void;
  weekdayShortLabels: string[];
}) {
  const { t } = useTranslation();
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const dragEventRef = useRef<CalendarEvent | null>(null);

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks = days.length / 7;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      for (const d of getEventSpanDays(ev)) {
        const dk = format(d, 'yyyy-MM-dd');
        if (!map.has(dk)) map.set(dk, []);
        map.get(dk)!.push(ev);
      }
    }
    return map;
  }, [events]);

  return (
    <div className="size-full flex flex-col">
      {/* Weekday header */}
      <div className="grid shrink-0 grid-cols-7 border-b">
        {weekdayShortLabels.map((wd) => (
          <div key={wd} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div
        className="grid grid-cols-7 flex-1 min-h-0"
        style={{ gridTemplateRows: `repeat(${weeks}, 1fr)` }}
      >
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvs = eventsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, date);
          const today = isToday(day);
          const isDragTarget = dragOverDay === key;

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              aria-label={format(day, 'PPPP')}
              className={cn(
                'cursor-pointer overflow-hidden border-b border-r p-1 transition-colors',
                !inMonth && 'opacity-35',
                isDragTarget ? 'bg-primary/10' : today && 'bg-primary/5',
              )}
              onClick={() => onDayClick(day)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onDayClick(day);
                }
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOverDay(key); }}
              onDragLeave={() => setDragOverDay(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDay(null);
                const ev = dragEventRef.current;
                if (!ev || !onEventDateChange) return;
                if (isSameDay(new Date(ev.start_at), day)) return;
                const delta = differenceInMinutes(startOfDay(day), startOfDay(new Date(ev.start_at)));
                const newStart = addMinutes(new Date(ev.start_at), delta);
                const newEnd = addMinutes(new Date(ev.end_at), delta);
                onEventDateChange({ eventId: ev.id, newStartAt: newStart.getTime(), newEndAt: newEnd.getTime() });
                dragEventRef.current = null;
              }}
            >
              {/* Day number */}
              <div className="mb-0.5 flex items-center justify-end">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs',
                    today ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>

              {/* Events */}
              <div className="flex flex-col gap-0.5">
                {dayEvs.slice(0, 3).map((ev) => (
                  <EventChip
                    key={ev.id}
                    event={ev}
                    onClick={() => onEventClick(ev)}
                    draggable={!!onEventDateChange}
                    onDragStart={() => { dragEventRef.current = ev; }}
                  />
                ))}
                {dayEvs.length > 3 && (
                  <span className="pl-1.5 text-[12px] text-muted-foreground">
                    {t('calendarPage.more_events', { count: dayEvs.length - 3 })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DraggableTimeEvent ───────────────────────────────────────────────────────

function DraggableTimeEvent({
  event,
  hourHeight,
  onEventClick,
  onEventDateChange,
}: {
  event: CalendarEvent;
  hourHeight: number;
  onEventClick?: (e: CalendarEvent) => void;
  onEventDateChange?: (p: EventDateChangePayload) => void;
}) {
  const { t } = useTranslation();
  const startDate = useMemo(() => new Date(event.start_at), [event.start_at]);
  const endDate = useMemo(() => new Date(event.end_at), [event.end_at]);

  const topMinutes = getHours(startDate) * 60 + getMinutes(startDate);
  const durationMins = Math.max(differenceInMinutes(endDate, startDate), 15);
  const topPx = (topMinutes / 60) * hourHeight;
  const heightPx = (durationMins / 60) * hourHeight;

  const [dragging, setDragging] = useState<'move' | 'resize' | null>(null);
  const dragStartRef = useRef({ y: 0, topMins: topMinutes, duration: durationMins });
  const [offsetY, setOffsetY] = useState(0);
  const [resizeDelta, setResizeDelta] = useState(0);

  const handleMoveStart = useCallback((e: React.PointerEvent) => {
    if (!onEventDateChange) return;
    e.preventDefault(); e.stopPropagation();
    setDragging('move');
    dragStartRef.current = { y: e.clientY, topMins: topMinutes, duration: durationMins };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [onEventDateChange, topMinutes, durationMins]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    if (!onEventDateChange) return;
    e.preventDefault(); e.stopPropagation();
    setDragging('resize');
    dragStartRef.current = { y: e.clientY, topMins: 0, duration: durationMins };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [onEventDateChange, durationMins]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - dragStartRef.current.y;
    if (dragging === 'move') setOffsetY(dy);
    else setResizeDelta(dy);
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging || !onEventDateChange) return;
    const dy = e.clientY - dragStartRef.current.y;
    const deltaMins = Math.round((dy / hourHeight) * 60 / 15) * 15;

    if (dragging === 'move' && deltaMins !== 0) {
      const newStart = addMinutes(startDate, deltaMins);
      const newEnd = addMinutes(endDate, deltaMins);
      onEventDateChange({ eventId: event.id, newStartAt: newStart.getTime(), newEndAt: newEnd.getTime() });
    } else if (dragging === 'resize' && deltaMins !== 0) {
      const newEnd = addMinutes(endDate, deltaMins);
      if (newEnd > startDate) {
        onEventDateChange({ eventId: event.id, newStartAt: startDate.getTime(), newEndAt: newEnd.getTime() });
      }
    }

    setDragging(null); setOffsetY(0); setResizeDelta(0);
  }, [dragging, onEventDateChange, event, hourHeight, startDate, endDate]);

  const renderTop = topPx + (dragging === 'move' ? offsetY : 0);
  const renderHeight = Math.max(heightPx + (dragging === 'resize' ? resizeDelta : 0), 20);

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'calendar-time-event absolute left-0.5 right-0.5 rounded-md px-1.5 text-[12px] select-none overflow-hidden text-primary-foreground z-[2]',
        dragging && 'calendar-time-event--dragging z-20 opacity-85',
        onEventDateChange && (dragging === 'move' ? 'cursor-grabbing' : 'cursor-grab'),
        !onEventDateChange && 'cursor-pointer',
      )}
      style={{
        top: renderTop,
        height: renderHeight,
        backgroundColor: event.calendar_color ?? 'var(--primary)',
      }}
      aria-label={event.title || t('workspace.untitled')}
      onPointerDown={handleMoveStart}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => { if (!dragging) { e.stopPropagation(); onEventClick?.(event); } }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !dragging) {
          e.preventDefault();
          e.stopPropagation();
          onEventClick?.(event);
        }
      }}
      title={event.title}
    >
      <div className="font-medium leading-[16px] truncate">{event.title || t('workspace.untitled')}</div>
      {renderHeight > 28 && (
        <div className="opacity-75 text-[12px] truncate">{format(startDate, 'HH:mm')} – {format(endDate, 'HH:mm')}</div>
      )}
      {onEventDateChange && (
        <button
          type="button"
          aria-label={t('calendarPage.resize_event_handle', { defaultValue: 'Resize event duration' })}
          className="absolute bottom-0 left-0 right-0 h-2 w-full cursor-ns-resize border-0 bg-transparent p-0"
          onPointerDown={handleResizeStart}
        />
      )}
    </div>
  );
}

// ─── CurrentTimeLine ──────────────────────────────────────────────────────────

function CurrentTimeLine({ hourHeight }: { hourHeight: number }) {
  const [minuteOffset, setMinuteOffset] = useState(() => (getMinutes(new Date()) / 60) * hourHeight);

  useEffect(() => {
    const tick = () => setMinuteOffset((getMinutes(new Date()) / 60) * hourHeight);
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [hourHeight]);

  return (
    <div className="absolute left-0 right-0 pointer-events-none z-10" style={{ top: minuteOffset }}>
      <div className="flex items-center">
        <div className="size-2 rounded-full shrink-0 -ml-1 bg-primary" />
        <div className="flex-1 h-px bg-primary" />
      </div>
    </div>
  );
}

// ─── WeekView ─────────────────────────────────────────────────────────────────

function WeekView({
  date,
  events,
  onEventClick,
  onEventDateChange,
  dfLocale,
}: {
  date: Date;
  events: CalendarEvent[];
  onEventClick?: (e: CalendarEvent) => void;
  onEventDateChange?: (p: EventDateChangePayload) => void;
  dfLocale: Locale;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => i + DAY_START_HOUR);

  const currentHour = getHours(new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(new Date(ev.start_at), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = Math.max(((getHours(now) * 60 + getMinutes(now)) / 60) * HOUR_HEIGHT - 150, 0);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  return (
    <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
      <div className="grid" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="sticky top-0 z-10 border-b border-l bg-background py-2 text-center"
          >
            <div className="text-[11px] text-muted-foreground">{format(day, 'EEE', { locale: dfLocale })}</div>
            <div
              className={cn(
                'mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-base font-medium',
                isToday(day) && 'bg-primary font-bold text-primary-foreground',
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}

        {/* Hour rows */}
        {hours.map((hour) => (
          <Fragment key={hour}>
            <div
              className="shrink-0 pr-2 pt-1 text-right text-[10px] text-muted-foreground"
              style={{ height: HOUR_HEIGHT }}
            >
              {hour > 0 ? `${hour}:00` : ''}
            </div>
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvs = (eventsByDay.get(key) ?? []).filter(
                (ev) => getHours(new Date(ev.start_at)) === hour,
              );
              return (
                <div
                  key={key}
                  className="relative border-b border-l"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {hour === currentHour && isToday(day) && (
                    <CurrentTimeLine hourHeight={HOUR_HEIGHT} />
                  )}
                  {dayEvs.map((ev) => (
                    <DraggableTimeEvent
                      key={ev.id}
                      event={ev}
                      hourHeight={HOUR_HEIGHT}
                      onEventClick={onEventClick}
                      onEventDateChange={onEventDateChange}
                    />
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── DayView ──────────────────────────────────────────────────────────────────

function DayView({
  date,
  events,
  onEventClick,
  onEventDateChange,
}: {
  date: Date;
  events: CalendarEvent[];
  onEventClick?: (e: CalendarEvent) => void;
  onEventDateChange?: (p: EventDateChangePayload) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => i + DAY_START_HOUR);
  const currentHour = getHours(new Date());

  const dayEvents = useMemo(
    () => events.filter((ev) => isSameDay(new Date(ev.start_at), date)),
    [events, date],
  );

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const scrollTo = Math.max(((getHours(now) * 60 + getMinutes(now)) / 60) * HOUR_HEIGHT - 150, 0);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  return (
    <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
      <div className="grid" style={{ gridTemplateColumns: '60px 1fr' }}>
        {hours.map((hour) => {
          const hourEvs = dayEvents.filter((ev) => getHours(new Date(ev.start_at)) === hour);
          return (
            <Fragment key={hour}>
              <div
                className="pr-3 pt-1 text-right text-[11px] text-muted-foreground"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour > 0 ? `${hour}:00` : ''}
              </div>
              <div
                className="relative border-b border-l"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour === currentHour && isToday(date) && (
                  <CurrentTimeLine hourHeight={HOUR_HEIGHT} />
                )}
                {hourEvs.map((ev) => (
                  <DraggableTimeEvent
                    key={ev.id}
                    event={ev}
                    hourHeight={HOUR_HEIGHT}
                    onEventClick={onEventClick}
                    onEventDateChange={onEventDateChange}
                  />
                ))}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── YearView ─────────────────────────────────────────────────────────────────

function YearView({
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
    <div className="grid grid-cols-3 md:grid-cols-4 gap-3 p-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
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

// ─── CalendarGrid (main export) ───────────────────────────────────────────────

export default function CalendarGrid({
  currentDate,
  viewMode,
  events,
  onCurrentDateChange,
  onViewModeChange,
  onDayClick,
  onEventClick,
  onEventDateChange,
}: CalendarGridProps) {
  const { t } = useTranslation();
  const dfLocale = getDateFnsLocale();
  const modeLabels = useMemo(
    (): Record<CalendarViewMode, string> => ({
      day: t('calendarPage.view_day'),
      week: t('calendarPage.view_week'),
      month: t('calendarPage.view_month'),
      year: t('calendarPage.view_year'),
    }),
    [t],
  );
  const weekdayShortLabels = useMemo(() => {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(ws, i), 'EEE', { locale: dfLocale }));
  }, [dfLocale]);
  const headerTitle = useMemo(
    () => formatHeader(currentDate, viewMode, dfLocale),
    [currentDate, viewMode, dfLocale],
  );

  const handlePrev = useCallback(
    () => onCurrentDateChange(navigateDate(currentDate, viewMode, -1)),
    [currentDate, viewMode, onCurrentDateChange],
  );
  const handleNext = useCallback(
    () => onCurrentDateChange(navigateDate(currentDate, viewMode, 1)),
    [currentDate, viewMode, onCurrentDateChange],
  );
  const handleToday = useCallback(() => onCurrentDateChange(new Date()), [onCurrentDateChange]);

  const handleYearMonthClick = useCallback((month: Date) => {
    onCurrentDateChange(month);
    onViewModeChange('month');
  }, [onCurrentDateChange, onViewModeChange]);

  return (
    <div className="flex size-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handlePrev}
            aria-label={t('common.back')}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleNext}
            aria-label={t('common.next')}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleToday}>
            {t('calendarPage.today')}
          </Button>
          <span className="ml-2 truncate text-[15px] font-medium capitalize tracking-tight">
            {headerTitle}
          </span>
        </div>

        <Tabs
          value={viewMode}
          onValueChange={(v) => onViewModeChange(v as CalendarViewMode)}
          className="shrink-0"
        >
          <TabsList className="h-8">
            {MODES.map((m) => (
              <TabsTrigger key={m} value={m} className="px-2.5 text-xs">
                {modeLabels[m]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Calendar content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'month' && (
          <MonthView
            date={currentDate}
            events={events}
            onDayClick={onDayClick}
            onEventClick={onEventClick}
            onEventDateChange={onEventDateChange}
            weekdayShortLabels={weekdayShortLabels}
          />
        )}
        {viewMode === 'week' && (
          <WeekView
            date={currentDate}
            events={events}
            onEventClick={onEventClick}
            onEventDateChange={onEventDateChange}
            dfLocale={dfLocale}
          />
        )}
        {viewMode === 'day' && (
          <DayView
            date={currentDate}
            events={events}
            onEventClick={onEventClick}
            onEventDateChange={onEventDateChange}
          />
        )}
        {viewMode === 'year' && (
          <YearView
            date={currentDate}
            events={events}
            onMonthClick={handleYearMonthClick}
            dfLocale={dfLocale}
          />
        )}
      </div>
    </div>
  );
}
