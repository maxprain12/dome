'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, Loader2, RefreshCw } from 'lucide-react';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import EventModal from '@/components/calendar/EventModal';
import { useCalendarStore, type CalendarEvent } from '@/lib/store/useCalendarStore';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function CalendarPage() {
  const {
    events,
    currentDate,
    setEvents,
    setCurrentDate,
  } = useCalendarStore();

  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [initialModalDate, setInitialModalDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);

  const loadEvents = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
    const result = await window.electron.calendar.listEvents({
      startMs: start.getTime(),
      endMs: end.getTime(),
    });
    if (result.success && result.events) {
      setEvents(result.events as CalendarEvent[]);
    }
  }, [currentDate, setEvents]);

  const loadOperationalData = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const upcomingResult = await window.electron.calendar.getUpcoming({ windowMinutes: 60 * 24 * 7, limit: 12 });
    if (upcomingResult.success && upcomingResult.events) {
      setUpcomingEvents(upcomingResult.events as CalendarEvent[]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadEvents(), loadOperationalData()]).finally(() => setLoading(false));
  }, [loadEvents, loadOperationalData]);

  const handleSyncNow = useCallback(async () => {
    if (!window.electron?.calendar?.syncNow) {
      return;
    }
    setSyncing(true);
    try {
      await window.electron.calendar.syncNow();
      await Promise.all([loadEvents(), loadOperationalData()]);
    } finally {
      setSyncing(false);
    }
  }, [loadEvents, loadOperationalData]);

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

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ background: 'var(--dome-bg)' }}
    >
      <div className="flex-1 min-h-0" style={{ padding: '32px' }}>
        <div className="max-w-6xl mx-auto">
          {/* Page header - consistente con Studio, Flashcards, etc. */}
          <div className="page-header">
            <h1 className="page-title">Calendario</h1>
            <p className="page-subtitle">
              Tu calendario personal y eventos. Haz clic en un día para crear un evento.
            </p>
          </div>

          {/* Controles y calendario */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="flex items-center justify-center rounded-lg min-w-[40px] min-h-[40px] hover:bg-[var(--dome-surface)] transition-colors"
                  style={{ color: 'var(--dome-text)' }}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="min-w-[140px] text-center text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                  {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="flex items-center justify-center rounded-lg min-w-[40px] min-h-[40px] hover:bg-[var(--dome-surface)] transition-colors"
                  style={{ color: 'var(--dome-text)' }}
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-1">
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

            <div className="min-h-[500px]">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                </div>
              ) : (
                <div className="h-full min-h-[500px] rounded-xl overflow-hidden border" style={{ borderColor: 'var(--dome-border)' }}>
                  <CalendarGrid
                    currentDate={currentDate}
                    events={events}
                    onDayClick={handleDayClick}
                    onEventClick={handleEventClick}
                  />
                </div>
              )}
            </div>
            </div>

            <aside className="flex min-h-[500px] flex-col gap-4">
              <section
                className="rounded-xl border p-4"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>Panel operativo</h2>
                    <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                      Próximos eventos y sincronización rápida.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSyncNow()}
                    disabled={syncing}
                    className="rounded-lg border p-2"
                    style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                    title="Sincronizar ahora"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {upcomingEvents.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                      No hay eventos próximos en los siguientes 7 días.
                    </p>
                  ) : (
                    upcomingEvents.slice(0, 6).map((event) => (
                      <div
                        key={event.id}
                        className="rounded-lg border p-3"
                        style={{ borderColor: 'var(--dome-border)' }}
                      >
                        <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{event.title}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                          {new Date(event.start_at).toLocaleString('es')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

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
