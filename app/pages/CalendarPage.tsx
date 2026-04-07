'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Loader2, RefreshCw, Upload, Link2 } from 'lucide-react';
import {
  startOfWeek, endOfWeek,
  startOfYear, endOfYear, startOfMonth, endOfMonth,
} from 'date-fns';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import type { EventDateChangePayload } from '@/components/calendar/CalendarGrid';
import EventModal from '@/components/calendar/EventModal';
import { useCalendarStore, type CalendarEvent } from '@/lib/store/useCalendarStore';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { showToast } from '@/lib/store/useToastStore';
import { useTabStore } from '@/lib/store/useTabStore';

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
    const unsubEv = window.electron?.on?.('calendar:eventsUpdated', () => {
      void loadEvents();
      void loadUpcoming();
    });
    return () => {
      unsub?.();
      unsubEv?.();
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

  const syncHint =
    syncStatus === 'error'
      ? t('calendarPage.sync_error_hint')
      : lastSyncAt
        ? t('calendarPage.last_sync', {
            time: new Date(lastSyncAt).toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'short' }),
          })
        : t('calendarPage.sync_never');

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <div className="flex-1 min-h-0 flex flex-col" style={{ padding: '24px 32px 16px' }}>
        <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0 gap-4">
          <div className="flex flex-col gap-3 shrink-0 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="page-title">{t('calendarPage.title')}</h1>
              <p className="page-subtitle">{t('calendarPage.subtitle')}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--dome-text-muted)' }}>
                {syncHint}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => void openCalendarSettings()}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[var(--dome-surface)]"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                title={t('calendarPage.open_settings')}
              >
                <Link2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t('calendarPage.google_settings')}</span>
              </button>
              <button
                type="button"
                onClick={() => void openImport()}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[var(--dome-surface)]"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">{t('calendarPage.import_ics')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[var(--dome-surface)]"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                title={t('calendarPage.sync')}
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{t('calendarPage.sync')}</span>
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
                {t('calendarPage.new_event')}
              </button>
            </div>
          </div>

          {calendars.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
                {t('calendarPage.filter_calendars')}
              </span>
              {calendars.map((c) => {
                const on = visibleCalendarIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCalendarFilter(c.id)}
                    className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                    style={{
                      borderColor: c.color || 'var(--dome-border)',
                      background: on ? 'var(--dome-surface)' : 'transparent',
                      color: 'var(--dome-text)',
                      opacity: on ? 1 : 0.55,
                    }}
                  >
                    {c.title}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-4 flex-1 min-h-0">
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

            <aside className="w-[280px] shrink-0 hidden lg:block">
              <div
                className="rounded-xl border p-4 h-full overflow-auto"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
              >
                <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--dome-text)' }}>
                  {t('calendarPage.upcoming')}
                </h2>
                <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('calendarPage.upcoming_hint')}
                </p>

                <div className="space-y-2">
                  {upcomingEvents.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                      {t('calendarPage.no_upcoming')}
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
                            className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ring-1 ring-[var(--dome-border)]"
                            style={{ background: event.calendar_color ?? 'var(--dome-accent)' }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--dome-text)' }}>
                              {event.title}
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--dome-text-muted)' }}>
                              {new Date(event.start_at).toLocaleString(dateLocale, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
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

      {showImport && importPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => !importBusy && setShowImport(false)}
        >
          <div
            className="rounded-xl shadow-xl max-w-md w-full p-5"
            style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--dome-text)' }}>
              {t('calendarPage.import_title')}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--dome-text-muted)' }}>
              {t('calendarPage.import_preview', { count: importPreview.events.length, raw: importPreview.rawCount })}
            </p>
            <label className="block text-xs mb-1" style={{ color: 'var(--dome-text-muted)' }}>
              {t('calendarPage.import_target')}
            </label>
            <select
              value={importTargetId}
              onChange={(e) => setImportTargetId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm mb-4"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer" style={{ color: 'var(--dome-text)' }}>
              <input type="checkbox" checked={importSkipDup} onChange={(e) => setImportSkipDup(e.target.checked)} />
              {t('calendarPage.import_skip_dup')}
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={importBusy}
                onClick={() => setShowImport(false)}
                className="px-3 py-2 text-sm rounded-lg border"
                style={{ borderColor: 'var(--dome-border)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={importBusy || importPreview.events.length === 0}
                onClick={() => void runImport()}
                className="px-4 py-2 text-sm rounded-lg font-medium"
                style={{ background: 'var(--dome-accent)', color: 'var(--dome-accent-fg)' }}
              >
                {importBusy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : t('calendarPage.import_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

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
