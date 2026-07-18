'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  startOfWeek, endOfWeek,
  startOfYear, endOfYear, startOfMonth, endOfMonth,
} from 'date-fns';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import type { EventDateChangePayload } from '@/components/calendar/CalendarGrid';
import EventModal from '@/components/calendar/EventModal';
import DayEventsModal from '@/components/calendar/DayEventsModal';
import { CalendarHero } from '@/components/calendar/CalendarHero';
import { CalendarUpcoming } from '@/components/calendar/CalendarUpcoming';
import { useCalendarStore, type CalendarEvent } from '@/lib/store/useCalendarStore';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { showToast } from '@/lib/store/useToastStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { getEventsForDay } from '@/lib/calendar/dayEvents';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Toggle } from '@/components/ui/toggle';

type CalRow = { id: string; title: string; color?: string; account_id?: string; is_selected?: boolean };

function openCalendarSettings() {
  useTabStore.getState().openSettingsTab();
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'calendar' }));
  }, 80);
}

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

  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

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
  const importPathRef = useRef<string | null>(null);
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
    const r = await window.electron.calendar.listCalendars({ projectId });
    if (r.success && r.calendars) {
      const rows = r.calendars as CalRow[];
      setCalendars(rows);
      const rowIds = new Set(rows.map((c) => c.id));
      const isVisibleCalendar = (id: string) => rowIds.has(id);
      setVisibleCalendarIds((prev) => {
        if (prev.length === 0) return rows.map((c) => c.id);
        const valid = prev.filter(isVisibleCalendar);
        return valid.length > 0 ? valid : rows.map((c) => c.id);
      });
      const def = rows.find((c) => c.account_id === 'local' || !c.account_id) ?? rows[0];
      if (def) setImportTargetId((tid) => (tid && rows.some((c) => c.id === tid) ? tid : def.id));
    }
  }, [projectId]);

  const loadEvents = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const range = getDateRange(currentDate, viewMode);
    const params: { startMs: number; endMs: number; calendarIds?: string[]; projectId: string } = {
      ...range,
      projectId,
    };
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
  }, [currentDate, viewMode, getDateRange, setEvents, calendarIdsParam, projectId]);

  const loadUpcoming = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.calendar) return;
    const result = await window.electron.calendar.getUpcoming({
      windowMinutes: 60 * 24 * 7,
      limit: 12,
      projectId,
    });
    if (result.success && result.events) {
      setUpcomingEvents(result.events as CalendarEvent[]);
    }
  }, [projectId]);

  useEffect(() => {
    void loadCalendars();
  }, [loadCalendars, projectId]);

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
      const r = await window.electron.calendar.syncNow({ projectId });
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
  }, [loadEvents, loadUpcoming, setLastSyncAt, setSyncStatus, projectId]);

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
      importPathRef.current = p;
      setImportPreview({ events: prev.events ?? [], rawCount: prev.rawCount ?? 0 });
      setShowImport(true);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('calendarPage.import_error'));
    }
  };

  const runImport = async () => {
    if (!importPathRef.current || !importTargetId) return;
    setImportBusy(true);
    try {
      const r = await window.electron.calendar.importIcs(importPathRef.current, importTargetId, { skipDuplicates: importSkipDup });
      if (r.success) {
        showToast(
          'success',
          t('calendarPage.import_done', { n: r.imported ?? 0, s: r.skipped ?? 0 }),
        );
        setShowImport(false);
        importPathRef.current = null;
        setImportPreview(null);
        await Promise.all([loadEvents(), loadUpcoming()]);
      } else {
        showToast('error', r.error || t('calendarPage.import_error'));
      }
    } finally {
      setImportBusy(false);
    }
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
    metadata?: Record<string, unknown>;
  }) => {
    if (!window.electron?.calendar) {
      throw new Error(t('calendarPage.import_error'));
    }
    const result = selectedEvent
      ? await window.electron.calendar.updateEvent(selectedEvent.id, data)
      : await window.electron.calendar.createEvent({ ...data, projectId });
    if (!result.success) {
      throw new Error(result.error || t('calendarPage.import_error'));
    }
    void loadEvents();
    void loadUpcoming();
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
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
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-2 md:px-5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('calendarPage.filter_calendars')}
          </span>
          {calendars.map((c) => {
            const on = visibleCalendarIds.includes(c.id);
            return (
              <Toggle
                key={c.id}
                variant="outline"
                size="sm"
                pressed={on}
                onPressedChange={() => toggleCalendarFilter(c.id)}
                className={cn('h-6 rounded-full px-2.5 text-[11px]', !on && 'opacity-50')}
                style={{ borderColor: c.color || undefined }}
              >
                {c.title}
              </Toggle>
            );
          })}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row md:p-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Spinner className="size-7" aria-hidden />
            </div>
          ) : (
            <CalendarGrid
              currentDate={currentDate}
              viewMode={viewMode}
              events={events}
              onCurrentDateChange={setCurrentDate}
              onViewModeChange={setViewMode}
              onDayClick={handleDayClick}
              onEventClick={(ev) => void handleEventClick(ev)}
              onEventDateChange={(p) => void handleEventDateChange(p)}
            />
          )}
        </div>

        {showModal ? (
          <div className="flex h-[min(70vh,32rem)] min-h-0 w-full shrink-0 flex-col md:h-auto md:w-72 lg:w-80">
            <EventModal
              key={selectedEvent?.id ?? `new-${initialModalDate?.getTime() ?? 'blank'}`}
              event={selectedEvent}
              initialDate={initialModalDate}
              onClose={() => {
                setShowModal(false);
                setSelectedEvent(null);
              }}
              onSave={handleSave}
              onDelete={selectedEvent ? handleDelete : undefined}
            />
          </div>
        ) : (
          <aside className="h-64 shrink-0 md:h-auto md:w-72 lg:w-80">
            <CalendarUpcoming
              events={upcomingEvents}
              onEventClick={(ev) => void handleEventClick(ev)}
            />
          </aside>
        )}
      </div>

      {showImport && importPreview ? (
        <Dialog open onOpenChange={(next) => { if (!next && !importBusy) setShowImport(false); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('calendarPage.import_title')}</DialogTitle>
              <DialogDescription>
                {t('calendarPage.import_preview', { count: importPreview.events.length, raw: importPreview.rawCount })}
              </DialogDescription>
            </DialogHeader>

            <Field className="gap-1.5">
              <FieldLabel className="text-xs">{t('calendarPage.import_target')}</FieldLabel>
              <Select
                value={importTargetId || null}
                onValueChange={(next) => { if (next != null) setImportTargetId(String(next)); }}
                items={calendars.map((c) => ({ value: c.id, label: c.title }))}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {calendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="block truncate">{c.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <FieldLabel className="flex items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={importSkipDup}
                onCheckedChange={(checked) => setImportSkipDup(checked === true)}
              />
              {t('calendarPage.import_skip_dup')}
            </FieldLabel>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={importBusy} onClick={() => setShowImport(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={importBusy || importPreview.events.length === 0}
                loading={importBusy}
                onClick={() => void runImport()}
              >
                {t('calendarPage.import_confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

    </div>
  );
}

