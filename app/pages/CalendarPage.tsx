'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import {
  startOfWeek, endOfWeek,
  startOfYear, endOfYear, startOfMonth, endOfMonth,
} from 'date-fns';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import type { EventDateChangePayload } from '@/components/calendar/CalendarGrid';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import EventModal from '@/components/calendar/EventModal';
import DayEventsModal from '@/components/calendar/DayEventsModal';
import { CalendarHero } from '@/components/calendar/CalendarHero';
import { CalendarUpcoming } from '@/components/calendar/CalendarUpcoming';
import { useCalendarStore, type CalendarEvent } from '@/lib/store/useCalendarStore';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { showToast } from '@/lib/store/useToastStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { getEventsForDay } from '@/lib/calendar/dayEvents';

type CalRow = { id: string; title: string; color?: string; account_id?: string; is_selected?: boolean };

export default function CalendarPage() {
  const { t } = useTranslation();
  const dateLocale = getDateTimeLocaleTag();
  const {
    events,
    currentDate,
    viewMode,
    setEvents,
    setCurrentDate,
    setViewMode,
    syncStatus,
    lastSyncAt,
    setSyncStatus,
    setLastSyncAt,
  } = useCalendarStore();

  const [showModal, setShowModal] = useState(false);
  const [dayModalDate, setDayModalDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [initialModalDate, setInitialModalDate] = useState<Date | undefined>();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<CalRow[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<{ events: unknown[]; rawCount: number } | null>(null);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [importTargetId, setImportTargetId] = useState<string>('');
  const [importSkipDup, setImportSkipDup] = useState(true);
  const [importBusy, setImportBusy] = useState(false);

  const allCalendarIds = useMemo(() => calendars.map((c) => c.id), [calendars]);

  const calendarIdsParam = useMemo(() => {
    if (allCalendarIds.length === 0) return undefined;
    if (visibleCalendarIds.length === allCalendarIds.length) return undefined;
    if (visibleCalendarIds.length === 0) return [] as string[];
    return visibleCalendarIds;
  }, [allCalendarIds, visibleCalendarIds]);

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

  const loadCalendars = useCallback(async () => {
    if (!window.electron?.calendar?.listCalendars) return;
    const r = await window.electron.calendar.listCalendars(null);
    if (r.success && r.calendars) {
      const rows = r.calendars as CalRow[];
      setCalendars(rows);
      setVisibleCalendarIds((prev) => {
        if (prev.length === 0) return rows.map((c) => c.id);
        const valid = prev.filter((id) => rows.some((c) => c.id === id));
        return valid.length > 0 ? valid : rows.map((c) => c.id);
      });
      const def = rows.find((c) => c.account_id === 'local' || !c.account_id) ?? rows[0];
      if (def) setImportTargetId((tid) => (tid && rows.some((c) => c.id === tid) ? tid : def.id));
    }
  }, []);

  const loadEvents = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const range = getDateRange(currentDate, viewMode);
    const params: { startMs: number; endMs: number; calendarIds?: string[] } = { ...range };
    if (calendarIdsParam !== undefined) {
      if (calendarIdsParam.length === 0) {
        setEvents([]);
        return;
      }
      params.calendarIds = calendarIdsParam;
    }
    const result = await window.electron.calendar.listEvents(params);
    if (result.success && result.events) {
      setEvents(result.events as CalendarEvent[]);
    }
  }, [currentDate, viewMode, getDateRange, setEvents, calendarIdsParam]);

  const loadUpcoming = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const result = await window.electron.calendar.getUpcoming({ windowMinutes: 60 * 24 * 7, limit: 12 });
    if (result.success && result.events) {
      setUpcomingEvents(result.events as CalendarEvent[]);
    }
  }, []);

  useEffect(() => {
    void loadCalendars();
  }, [loadCalendars]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadEvents(), loadUpcoming()]).finally(() => setLoading(false));
  }, [loadEvents, loadUpcoming]);

  useEffect(() => {
    const unsub = window.electron?.calendar?.onSyncStatus?.((data: { status?: string; lastSync?: number; error?: string }) => {
      if (data.status === 'error') {
        setSyncStatus('error');
        if (data.error) showToast('error', data.error);
      } else {
        setSyncStatus('idle');
        if (data.lastSync) setLastSyncAt(data.lastSync);
      }
    });
    const reloadTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const scheduleReload = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        void loadEvents();
        void loadUpcoming();
      }, 300);
    };
    const unsubEv = window.electron?.on?.('calendar:eventsUpdated', () => {
      scheduleReload();
    });
    return () => {
      unsub?.();
      unsubEv?.();
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, [loadEvents, loadUpcoming, setLastSyncAt, setSyncStatus]);

  const handleSyncNow = useCallback(async () => {
    if (!window.electron?.calendar?.syncNow) return;
    setSyncing(true);
    setSyncStatus('syncing');
    try {
      const r = await window.electron.calendar.syncNow();
      if (r.success) {
        setLastSyncAt(Date.now());
        setSyncStatus('idle');
        await Promise.all([loadEvents(), loadUpcoming()]);
      } else {
        setSyncStatus('error');
        if (r.error) showToast('error', r.error);
      }
    } finally {
      setSyncing(false);
    }
  }, [loadEvents, loadUpcoming, setLastSyncAt, setSyncStatus]);

  const toggleCalendarFilter = (id: string) => {
    setVisibleCalendarIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length === 0 ? allCalendarIds : next;
      }
      return [...prev, id];
    });
  };

  const openImport = async () => {
    try {
      const paths = await window.electron?.selectFile?.({
        filters: [{ name: 'iCalendar', extensions: ['ics'] }],
      });
      const p = paths?.[0];
      if (!p || !window.electron?.calendar?.previewIcs) return;
      const prev = await window.electron.calendar.previewIcs(p);
      if (!prev.success) {
        showToast('error', prev.error || t('calendarPage.import_error'));
        return;
      }
      setImportPath(p);
      setImportPreview({ events: prev.events ?? [], rawCount: prev.rawCount ?? 0 });
      setShowImport(true);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('calendarPage.import_error'));
    }
  };

  const runImport = async () => {
    if (!importPath || !importTargetId) return;
    setImportBusy(true);
    try {
      const r = await window.electron.calendar.importIcs(importPath, importTargetId, { skipDuplicates: importSkipDup });
      if (r.success) {
        showToast(
          'success',
          t('calendarPage.import_done', { n: r.imported ?? 0, s: r.skipped ?? 0 }),
        );
        setShowImport(false);
        setImportPath(null);
        setImportPreview(null);
        await Promise.all([loadEvents(), loadUpcoming()]);
      } else {
        showToast('error', r.error || t('calendarPage.import_error'));
      }
    } finally {
      setImportBusy(false);
    }
  };

  const openCalendarSettings = () => {
    useTabStore.getState().openSettingsTab();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'calendar' }));
    }, 80);
  };

  const openNewEvent = () => {
    setSelectedEvent(null);
    setInitialModalDate(new Date());
    setShowModal(true);
  };

  const handleDayClick = (date: Date) => {
    const dayEvents = getEventsForDay(date, events);
    if (dayEvents.length === 0) {
      setSelectedEvent(null);
      setInitialModalDate(date);
      setShowModal(true);
      return;
    }
    setDayModalDate(date);
  };

  const dayModalEvents = useMemo(
    () => (dayModalDate ? getEventsForDay(dayModalDate, events) : []),
    [dayModalDate, events],
  );

  const handleEventClick = async (event: CalendarEvent) => {
    let full: CalendarEvent = event;
    if (window.electron?.calendar?.getEvent) {
      try {
        const r = await window.electron.calendar.getEvent(event.id);
        if (r.success && r.event) full = r.event as CalendarEvent;
      } catch {
        /* use summary row */
      }
    }
    setSelectedEvent(full);
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

  const syncHint =
    syncStatus === 'error'
      ? t('calendarPage.sync_error_hint')
      : lastSyncAt
        ? t('calendarPage.last_sync', {
            time: new Date(lastSyncAt).toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'short' }),
          })
        : t('calendarPage.sync_never');

  return (
    <div className="home-shell c-calendar-shell">
      <div className="home-scroll">
        <div className="home-canvas">
          <CalendarHero
            syncHint={syncHint}
            syncing={syncing}
            upcomingCount={upcomingEvents.length}
            onOpenSettings={openCalendarSettings}
            onImport={() => void openImport()}
            onSync={() => void handleSyncNow()}
            onNewEvent={openNewEvent}
          />

          {calendars.length > 0 ? (
            <div className="c-calendar-filters">
              <span className="c-calendar-filters-label">{t('calendarPage.filter_calendars')}</span>
              {calendars.map((c) => {
                const on = visibleCalendarIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCalendarFilter(c.id)}
                    className={`c-calendar-filter-chip ${on ? 'is-on' : 'is-off'}`}
                    style={{ borderColor: c.color || undefined }}
                  >
                    {c.title}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="c-calendar-body">
            <div className="c-calendar-main">
              {loading ? (
                <div className="c-calendar-loading">
                  <Loader2 className="size-7 animate-spin" aria-hidden />
                </div>
              ) : (
                <div className="c-calendar-grid-panel">
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

            <CalendarUpcoming events={upcomingEvents} onEventClick={handleEventClick} />
          </div>
        </div>
      </div>

      {showImport && importPreview ? (
        <dialog
          open
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4 m-0 max-w-none max-h-none w-full h-full border-0"
          aria-modal="true"
          aria-labelledby="calendar-import-dialog-title"
          onCancel={(e) => { e.preventDefault(); setShowImport(false); }}
        >
          <div className="p-projects-modal">
            <h3 id="calendar-import-dialog-title" className="p-projects-modal-title">
              {t('calendarPage.import_title')}
            </h3>
            <p className="p-projects-modal-body">
              {t('calendarPage.import_preview', { count: importPreview.events.length, raw: importPreview.rawCount })}
            </p>
            <DomeSelectMenu
              label={t('calendarPage.import_target')}
              value={importTargetId}
              onChange={setImportTargetId}
              options={calendars.map((c) => ({ value: c.id, label: c.title }))}
            />
            <label className="c-calendar-modal-check mt-3">
              <input type="checkbox" checked={importSkipDup} onChange={(e) => setImportSkipDup(e.target.checked)} />
              {t('calendarPage.import_skip_dup')}
            </label>
            <div className="p-projects-modal-actions">
              <button type="button" disabled={importBusy} onClick={() => setShowImport(false)} className="h-pill-btn">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={importBusy || importPreview.events.length === 0}
                onClick={() => void runImport()}
                className="h-pill-btn primary"
              >
                {importBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : t('calendarPage.import_confirm')}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {dayModalDate ? (
        <DayEventsModal
          date={dayModalDate}
          events={dayModalEvents}
          onClose={() => setDayModalDate(null)}
          onEventClick={(event) => {
            setDayModalDate(null);
            void handleEventClick(event);
          }}
          onCreateEvent={() => {
            const d = dayModalDate;
            setDayModalDate(null);
            setSelectedEvent(null);
            setInitialModalDate(d);
            setShowModal(true);
          }}
        />
      ) : null}

      {showModal ? (
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
      ) : null}
    </div>
  );
}
