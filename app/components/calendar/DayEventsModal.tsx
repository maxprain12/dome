'use client';

import { CalendarDays, Clock, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { getDateFnsLocale, getDateTimeLocaleTag } from '@/lib/i18n';

function formatEventTime(event: CalendarEvent, locale: string): string {
  if (event.all_day) return '';
  return new Date(event.start_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export default function DayEventsModal({
  date,
  events,
  onClose,
  onEventClick,
  onCreateEvent,
}: {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
  onCreateEvent: () => void;
}) {
  const { t } = useTranslation();
  const locale = getDateTimeLocaleTag();
  const dfLocale = getDateFnsLocale();

  const dayLabel = format(date, 'PPPP', { locale: dfLocale });
  const subtitle =
    events.length === 1
      ? t('calendarPage.day_events_count_one', { count: events.length })
      : t('calendarPage.day_events_count_other', { count: events.length });

  return (
    <DomeModal
      open
      onClose={onClose}
      size="md"
      title={dayLabel}
      subtitle={subtitle}
      headerIcon={
        <span
          className="inline-flex items-center justify-center rounded-md"
          style={{
            width: 28,
            height: 28,
            background: 'color-mix(in srgb, var(--dome-accent) 12%, var(--dome-bg))',
            color: 'var(--dome-accent)',
          }}
        >
          <CalendarDays size={16} />
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <DomeButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </DomeButton>
          <DomeButton variant="primary" onClick={onCreateEvent}>
            <Plus size={14} className="mr-1.5" />
            {t('calendarPage.new_event')}
          </DomeButton>
        </div>
      }
    >
      <ul className="flex flex-col gap-1.5 max-h-[min(420px,60vh)] overflow-y-auto -mx-1 px-1">
        {events.map((event) => {
          const time = formatEventTime(event, locale);
          const color = event.calendar_color ?? 'var(--dome-accent)';
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onEventClick(event)}
                className="w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
                style={{
                  borderColor: 'var(--dome-border)',
                  background: 'var(--dome-surface)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-surface)';
                }}
              >
                <span
                  className="mt-1.5 shrink-0 rounded-full"
                  style={{ width: 8, height: 8, background: color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                    {event.title || t('workspace.untitled')}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    {time ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} aria-hidden />
                        {time}
                      </span>
                    ) : (
                      <span>{t('calendarPage.all_day')}</span>
                    )}
                    {event.calendar_title ? (
                      <span
                        className="rounded px-1.5 py-0.5"
                        style={{
                          background: `color-mix(in srgb, ${color} 12%, transparent)`,
                          color,
                        }}
                      >
                        {event.calendar_title}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </DomeModal>
  );
}
