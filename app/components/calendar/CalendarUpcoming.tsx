import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon } from '@hugeicons/core-free-icons';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';

function formatTimeRange(event: CalendarEvent, locale: string): string {
  if (event.all_day) return new Date(event.start_at).toLocaleDateString(locale, { weekday: 'long' });
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const start = new Date(event.start_at).toLocaleTimeString(locale, opts);
  const end = new Date(event.end_at).toLocaleTimeString(locale, opts);
  return event.end_at > event.start_at ? `${start} – ${end}` : start;
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
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-2xl py-0 shadow-none">
      <CardHeader className="shrink-0 px-4 pb-2 pt-3.5">
        <CardTitle className="flex items-center justify-between text-[15px] font-semibold">
          {t('calendarPage.upcoming')}
          <Badge variant="outline" className="tabular-nums">{events.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        {events.length === 0 ? (
          <Empty className="min-h-44 border-0 p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Calendar03Icon} />
              </EmptyMedia>
              <EmptyTitle>{t('calendarPage.no_upcoming')}</EmptyTitle>
              <EmptyDescription>{t('calendarPage.upcoming_hint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="h-full">
            <ul className="flex flex-col gap-0.5 px-2 pb-2.5">
              {events.map((event) => {
                const start = new Date(event.start_at);
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => onEventClick(event)}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:outline-none"
                    >
                      <span aria-hidden="true" className="flex h-11 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-muted leading-[1.1]">
                        <span className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                          {start.toLocaleDateString(locale, { month: 'short' }).replace('.', '')}
                        </span>
                        <b className="text-base font-semibold">{start.getDate()}</b>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col leading-snug">
                        <span className="truncate text-sm font-medium">{event.title}</span>
                        <span className="truncate text-xs text-muted-foreground">{formatTimeRange(event, locale)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
