'use client';

import { Fragment, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays, eachDayOfInterval, format, isSameDay, isToday,
  getHours, getMinutes, differenceInMinutes, addMinutes, startOfWeek,
} from 'date-fns';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import type { Locale } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  HOUR_HEIGHT, DAY_START_HOUR, DAY_END_HOUR,
  type EventDateChangePayload,
} from './calendarGridShared';

export function DraggableTimeEvent({
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
        'absolute left-0.5 right-0.5 z-[2] select-none overflow-hidden rounded-md px-1.5 text-[12px] text-primary-foreground transition-[top,height] duration-100',
        dragging && 'z-20 opacity-85 transition-none',
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

export function CurrentTimeLine({ hourHeight }: { hourHeight: number }) {
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

export function WeekView({
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
    <div ref={scrollRef} className="h-full min-h-0 overflow-auto">
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

export function DayView({
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
    <div ref={scrollRef} className="h-full min-h-0 overflow-auto">
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
