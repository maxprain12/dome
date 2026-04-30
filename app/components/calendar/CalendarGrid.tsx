'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const bg = event.calendar_color ?? 'var(--dome-accent)';
  const start = new Date(event.start_at);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="text-left rounded px-1.5 truncate w-full text-[11px] py-0.5 transition-opacity hover:opacity-80"
      style={{ backgroundColor: bg, color: 'var(--dome-on-accent)', lineHeight: '18px' }}
      title={event.title}
    >
      {!event.all_day && (
        <span className="opacity-70 mr-1">{format(start, 'HH:mm')}</span>
      )}
      {event.title || t('workspace.untitled')}
    </button>
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
      const evStart = new Date(ev.start_at);
      const evEnd = new Date(ev.end_at);
      const key = format(evStart, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
      if (!isSameDay(evStart, evEnd)) {
        const span = eachDayOfInterval({ start: addDays(evStart, 1), end: evEnd });
        for (const d of span) {
          const dk = format(d, 'yyyy-MM-dd');
          if (!map.has(dk)) map.set(dk, []);
          map.get(dk)!.push(ev);
        }
      }
    }
    return map;
  }, [events]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b shrink-0" style={{ borderColor: 'var(--dome-border)' }}>
        {weekdayShortLabels.map((wd) => (
          <div key={wd} className="py-2 text-center text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
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
              className="border-b border-r p-1 transition-colors cursor-pointer overflow-hidden"
              style={{
                borderColor: 'var(--dome-border)',
                opacity: inMonth ? 1 : 0.35,
                background: isDragTarget
                  ? 'var(--dome-accent-bg)'
                  : today
                    ? 'color-mix(in srgb, var(--dome-accent) 8%, transparent)'
                    : undefined,
              }}
              onClick={() => onDayClick(day)}
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
              <div className="flex items-center justify-end mb-0.5">
                <span
                  className="w-6 h-6 flex items-center justify-center text-xs rounded-full"
                  style={{
                    background: today ? 'var(--dome-accent)' : undefined,
                    color: today ? 'var(--dome-on-accent)' : 'var(--dome-text-muted)',
                    fontWeight: today ? 700 : 400,
                  }}
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
                  <span className="text-[10px] pl-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                    +{dayEvs.length - 3} más
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
      className="absolute left-0.5 right-0.5 rounded-md px-1.5 text-[11px] select-none overflow-hidden"
      style={{
        top: renderTop,
        height: renderHeight,
        backgroundColor: event.calendar_color ?? 'var(--dome-accent)',
        color: 'var(--dome-on-accent, #fff)',
        zIndex: dragging ? 20 : 2,
        cursor: onEventDateChange ? (dragging === 'move' ? 'grabbing' : 'grab') : 'pointer',
        opacity: dragging ? 0.85 : 1,
        transition: dragging ? 'none' : 'top 0.1s, height 0.1s',
      }}
      onPointerDown={handleMoveStart}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => { if (!dragging) { e.stopPropagation(); onEventClick?.(event); } }}
      title={event.title}
    >
      <div className="font-medium leading-[16px] truncate">{event.title || t('workspace.untitled')}</div>
      {renderHeight > 28 && (
        <div className="opacity-75 text-[10px] truncate">{format(startDate, 'HH:mm')} – {format(endDate, 'HH:mm')}</div>
      )}
      {onEventDateChange && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
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
        <div className="w-2 h-2 rounded-full shrink-0 -ml-1" style={{ background: 'var(--dome-accent)' }} />
        <div className="flex-1 h-px" style={{ background: 'var(--dome-accent)' }} />
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
        <div className="sticky top-0 z-10" style={{ background: 'var(--dome-bg)' }} />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="sticky top-0 z-10 text-center py-2 border-b border-l"
            style={{
              borderColor: 'var(--dome-border)',
              background: 'var(--dome-bg)',
            }}
          >
            <div className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>{format(day, 'EEE', { locale: dfLocale })}</div>
            <div
              className="text-base mx-auto mt-0.5 w-8 h-8 flex items-center justify-center rounded-full font-medium"
              style={{
                background: isToday(day) ? 'var(--dome-accent)' : undefined,
                color: isToday(day) ? 'var(--dome-on-accent, #fff)' : 'var(--dome-text)',
                fontWeight: isToday(day) ? 700 : 500,
              }}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}

        {/* Hour rows */}
        {hours.map((hour) => (
          <>
            <div
              key={`label-${hour}`}
              className="text-[10px] text-right pr-2 pt-1 shrink-0"
              style={{ color: 'var(--dome-text-muted)', height: HOUR_HEIGHT }}
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
                  key={`${key}-${hour}`}
                  className="border-b border-l relative"
                  style={{ borderColor: 'var(--dome-border)', height: HOUR_HEIGHT }}
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
          </>
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
            <>
              <div
                key={`label-${hour}`}
                className="text-[11px] text-right pr-3 pt-1"
                style={{ color: 'var(--dome-text-muted)', height: HOUR_HEIGHT }}
              >
                {hour > 0 ? `${hour}:00` : ''}
              </div>
              <div
                key={`cell-${hour}`}
                className="border-b border-l relative"
                style={{ borderColor: 'var(--dome-border)', height: HOUR_HEIGHT }}
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
            </>
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
  const months = eachMonthOfInterval({ start: startOfYear(date), end: endOfYear(date) });

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
          <div
            key={month.toISOString()}
            className="rounded-xl border p-3 cursor-pointer transition-all hover:shadow-md"
            style={{
              borderColor: isCurrentMonth ? 'var(--dome-accent)' : 'var(--dome-border)',
              background: 'var(--dome-surface)',
            }}
            onClick={() => onMonthClick(month)}
          >
            <div
              className="text-[12px] font-semibold mb-2 capitalize"
              style={{ color: isCurrentMonth ? 'var(--dome-accent)' : 'var(--dome-text)' }}
            >
              {format(month, 'MMMM', { locale: dfLocale })}
            </div>

            <div className="grid grid-cols-7 gap-px mb-1">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
                <div key={i} className="text-[8px] text-center" style={{ color: 'var(--dome-text-muted)' }}>{d}</div>
              ))}
              {days.map((day) => {
                const inMonth = isSameMonth(day, month);
                const today = isToday(day);
                const hasEvs = monthEvs.some((ev) => isSameDay(new Date(ev.start_at), day));
                return (
                  <div
                    key={day.toISOString()}
                    className="flex items-center justify-center relative"
                    style={{ height: 16 }}
                  >
                    <span
                      className="w-4 h-4 flex items-center justify-center rounded-full text-[9px]"
                      style={{
                        background: today && inMonth ? 'var(--dome-accent)' : undefined,
                        color: !inMonth ? 'transparent' : today ? 'var(--dome-on-accent, #fff)' : 'var(--dome-text)',
                        fontWeight: today ? 700 : 400,
                      }}
                    >
                      {inMonth ? format(day, 'd') : '·'}
                    </span>
                    {hasEvs && inMonth && !today && (
                      <div
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full"
                        style={{ background: 'var(--dome-accent)' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {monthEvs.length > 0 && (
              <div className="text-[10px] mt-1" style={{ color: 'var(--dome-text-muted)' }}>
                {monthEvs.length} evento{monthEvs.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
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
  const { t, i18n } = useTranslation();
  const dfLocale = useMemo(() => getDateFnsLocale(), [i18n.language]);
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
    <div className="w-full flex flex-col h-full">
      {/* Navigation bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 rounded-lg hover:bg-[var(--dome-surface)] transition-colors"
            style={{ color: 'var(--dome-text)' }}
            aria-label={t('common.back')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 rounded-lg hover:bg-[var(--dome-surface)] transition-colors"
            style={{ color: 'var(--dome-text)' }}
            aria-label={t('common.next')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="text-xs px-2.5 py-1 rounded-lg border hover:bg-[var(--dome-surface)] transition-colors ml-1"
            style={{ color: 'var(--dome-text)', borderColor: 'var(--dome-border)' }}
          >
            {t('calendarPage.today')}
          </button>
          <span className="text-sm font-semibold ml-2 capitalize" style={{ color: 'var(--dome-text)' }}>
            {headerTitle}
          </span>
        </div>

        {/* View mode switcher */}
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--dome-border)' }}>
          {MODES.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => onViewModeChange(m)}
              className="text-[11px] px-3 py-1 transition-colors"
              style={{
                background: m === viewMode ? 'var(--dome-accent)' : 'var(--dome-surface)',
                color: m === viewMode ? 'var(--dome-on-accent, #fff)' : 'var(--dome-text-muted)',
                borderRight: i < MODES.length - 1 ? '1px solid var(--dome-border)' : undefined,
              }}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>
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
