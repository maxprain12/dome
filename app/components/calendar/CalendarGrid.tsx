'use client';

import { useMemo } from 'react';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function getDaysInMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
  const days: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length < totalCells) days.push(null);
  return days;
}

function formatTime(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

interface CalendarGridProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export default function CalendarGrid({
  currentDate,
  events,
  onDayClick,
  onEventClick,
}: CalendarGridProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonth(currentDate), [year, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = new Date(e.start_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => a.start_at - b.start_at);
    }
    return map;
  }, [events]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-surface)' }}>
      <div className="grid grid-cols-7 border-b shrink-0" style={{ borderColor: 'var(--dome-border)' }}>
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 grid-rows-6 min-h-0">
        {days.map((day, i) => {
          const date = day != null ? new Date(year, month, day) : null;
          const key = date ? `${year}-${month}-${day}` : `empty-${i}`;
          const dayEvents = date ? eventsByDay.get(key) ?? [] : [];

          return (
            <div
              key={key}
              className="border-b border-r p-1 min-h-[80px] overflow-auto"
              style={{ borderColor: 'var(--dome-border)' }}
            >
              {date ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onDayClick(date)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onDayClick(date);
                    }
                  }}
                  className="w-full h-full min-h-[80px] flex flex-col cursor-pointer rounded-lg hover:bg-[var(--dome-accent-bg)] transition-colors"
                  style={{ color: 'var(--dome-text)' }}
                >
                  <span className="w-7 h-7 rounded-full text-sm font-medium flex items-center justify-center shrink-0">
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5 flex-1">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEventClick(ev);
                        }}
                        className="w-full text-left truncate text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: ev.calendar_color || 'var(--dome-accent-bg)',
                          color: 'var(--dome-text)',
                        }}
                        title={ev.title}
                      >
                        {ev.all_day ? ev.title : `${formatTime(ev.start_at)} ${ev.title}`}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                        +{dayEvents.length - 3} más
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
