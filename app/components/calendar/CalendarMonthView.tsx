'use client';

import { useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  startOfDay, eachDayOfInterval, format, isSameDay, isSameMonth,
  isToday, differenceInMinutes, addMinutes,
} from 'date-fns';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { getEventSpanDays } from '@/lib/calendar/dayEvents';
import { cn } from '@/lib/utils';
import type { EventDateChangePayload } from './calendarGridShared';

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

export function MonthView({
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
