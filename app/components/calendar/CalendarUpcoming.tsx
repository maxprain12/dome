import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { getDateTimeLocaleTag } from '@/lib/i18n';

function formatFeedTime(event: CalendarEvent, locale: string): { time: string; ampm?: string } {
  const start = new Date(event.start_at);
  if (event.all_day) {
    return {
      time: start.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }),
    };
  }
  const hours = start.getHours();
  const h12 = hours % 12 || 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const minutes = String(start.getMinutes()).padStart(2, '0');
  return { time: `${h12}:${minutes}`, ampm };
}

export function CalendarUpcoming({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}) {
  const { t } = useTranslation();
  const locale = getDateTimeLocaleTag();

  return (
    <aside className={`c-calendar-sidebar${events.length === 0 ? ' is-empty' : ''}`}>
      <div className="h-today">
        <div className="h-today-hd">
          <h2 className="h-today-title">{t('calendarPage.upcoming')}</h2>
          <span className="h-today-count">{t('dashboard.today_count', { count: events.length })}</span>
        </div>
        <p className="h-today-sub">{t('calendarPage.upcoming_hint')}</p>

        {events.length === 0 ? (
          <p className="h-feed-empty">{t('calendarPage.no_upcoming')}</p>
        ) : (
          <div className="h-feed">
            {events.map((event) => {
              const { time, ampm } = formatFeedTime(event, locale);
              const dateLabel = new Date(event.start_at).toLocaleDateString(locale, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              return (
                <button
                  key={event.id}
                  type="button"
                  className="h-feed-item"
                  onClick={() => onEventClick(event)}
                >
                  <div className="h-feed-time">
                    {time}
                    {ampm ? <span className="ampm">{ampm}</span> : null}
                  </div>
                  <div className="h-feed-body">
                    <div className="h-feed-title">{event.title}</div>
                    <div className="h-feed-meta">
                      <span
                        className="tag"
                        style={
                          event.calendar_color
                            ? {
                                borderColor: event.calendar_color,
                                color: event.calendar_color,
                                background: `color-mix(in srgb, ${event.calendar_color} 12%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        {event.calendar_title ?? t('calendarPage.title')}
                      </span>
                      <span className="dotsep" aria-hidden />
                      <span>{dateLabel}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-feed-arrow" size={16} strokeWidth={2} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
