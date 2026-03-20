'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, RefreshCw } from 'lucide-react';
import {
  startOfWeek, endOfWeek, addDays,
  startOfYear, endOfYear, startOfMonth, endOfMonth,
} from 'date-fns';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import type { EventDateChangePayload } from '@/components/calendar/CalendarGrid';
import EventModal from '@/components/calendar/EventModal';
import { useCalendarStore, type CalendarEvent } from '@/lib/store/useCalendarStore';

export default function CalendarPage() {
  const {
    events,
    currentDate,
    viewMode,
    setEvents,
    setCurrentDate,
    setViewMode,
  } = useCalendarStore();

  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [initialModalDate, setInitialModalDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);

  const getDateRange = useCallback((date: Date, mode: typeof viewMode) => {
    switch (mode) {
      case 'day':
        return {
          startMs: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
          endMs: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59).getTime(),
        };
      case 'week': {
        const ws = startOfWeek(date, { weekStartsOn: 1 });
        const we = endOfWeek(date, { weekStartsOn: 1 });
        return { startMs: ws.getTime(), endMs: we.getTime() };
      }
      case 'year':
        return {
          startMs: startOfYear(date).getTime(),
          endMs: endOfYear(date).getTime(),
        };
      case 'month':
      default:
        return {
          startMs: startOfMonth(date).getTime(),
          endMs: endOfMonth(date).getTime(),
        };
    }
  }, []);

  const loadEvents = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const range = getDateRange(currentDate, viewMode);
    const result = await window.electron.calendar.listEvents(range);
    if (result.success && result.events) {
      setEvents(result.events as CalendarEvent[]);
    }
  }, [currentDate, viewMode, getDateRange, setEvents]);

  const loadUpcoming = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const result = await window.electron.calendar.getUpcoming({ windowMinutes: 60 * 24 * 7, limit: 8 });
    if (result.success && result.events) {
      setUpcomingEvents(result.events as CalendarEvent[]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadEvents(), loadUpcoming()]).finally(() => setLoading(false));
  }, [loadEvents, loadUpcoming]);

  const handleSyncNow = useCallback(async () => {
    if (!window.electron?.calendar?.syncNow) return;
    setSyncing(true);
    try {
      await window.electron.calendar.syncNow();
      await Promise.all([loadEvents(), loadUpcoming()]);
    } finally {
      setSyncing(false);
    }
  }, [loadEvents, loadUpcoming]);

  const handleDayClick = (date: Date) => {
    setSelectedEvent(null);
    setInitialModalDate(date);
    setShowModal(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setInitialModalDate(undefined);
    setShowModal(true);
  };

  const handleEventDateChange = async ({ eventId, newStartAt, newEndAt }: EventDateChangePayload) => {
    if (!window.electron?.calendar) return;
    await window.electron.calendar.updateEvent(eventId, {
      start_at: new Date(newStartAt).toISOString(),
      end_at: new Date(newEndAt).toISOString(),
    });
    loadEvents();
  };

  const handleSave = async (data: {
    title: string;
    description?: string;
    location?: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
  }) => {
    if (!window.electron?.calendar) return;
    if (selectedEvent) {
      await window.electron.calendar.updateEvent(selectedEvent.id, data);
    } else {
      await window.electron.calendar.createEvent(data);
    }
    loadEvents();
  };

  const handleDelete = async (eventId: string) => {
    if (!window.electron?.calendar) return;
    await window.electron.calendar.deleteEvent(eventId);
    loadEvents();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <div className="flex-1 min-h-0 flex flex-col" style={{ padding: '24px 32px 16px' }}>
        <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0 gap-4">

          {/* Page header */}
          <div className="flex items-start justify-between shrink-0">
            <div>
              <h1 className="page-title">Calendario</h1>
              <p className="page-subtitle">
                Tu calendario personal y eventos.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[var(--dome-surface)]"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                title="Sincronizar"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedEvent(null);
                  setInitialModalDate(new Date());
                  setShowModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--dome-accent)', color: 'var(--dome-accent-fg)' }}
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                Nuevo evento
              </button>
            </div>
          </div>

          {/* Main layout */}
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Calendar */}
            <div className="flex-1 min-h-0 min-w-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                </div>
              ) : (
                <div
                  className="h-full rounded-xl overflow-hidden border flex flex-col"
                  style={{ borderColor: 'var(--dome-border)' }}
                >
                  <CalendarGrid
                    currentDate={currentDate}
                    viewMode={viewMode}
                    events={events}
                    onCurrentDateChange={setCurrentDate}
                    onViewModeChange={setViewMode}
                    onDayClick={handleDayClick}
                    onEventClick={handleEventClick}
                    onEventDateChange={handleEventDateChange}
                  />
                </div>
              )}
            </div>

            {/* Upcoming events sidebar */}
            <aside className="w-[260px] shrink-0">
              <div
                className="rounded-xl border p-4 h-full overflow-auto"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
              >
                <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--dome-text)' }}>
                  Próximos eventos
                </h2>
                <p className="text-xs mb-4" style={{ color: 'var(--dome-text-muted)' }}>
                  Próximos 7 días
                </p>

                <div className="space-y-2">
                  {upcomingEvents.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                      Sin eventos próximos.
                    </p>
                  ) : (
                    upcomingEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => handleEventClick(event)}
                        className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-[var(--dome-bg)]"
                        style={{ borderColor: 'var(--dome-border)' }}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                            style={{ background: event.calendar_color ?? 'var(--dome-accent)' }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                              {event.title}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                              {new Date(event.start_at).toLocaleString('es', {
                                weekday: 'short', month: 'short', day: 'numeric',
                                hour: event.all_day ? undefined : '2-digit',
                                minute: event.all_day ? undefined : '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {showModal && (
        <EventModal
          event={selectedEvent}
          initialDate={initialModalDate}
          onClose={() => {
            setShowModal(false);
            setSelectedEvent(null);
          }}
          onSave={handleSave}
          onDelete={selectedEvent ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
