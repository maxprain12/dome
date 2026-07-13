'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, CalendarDaysIcon, Clock01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { getDateFnsLocale, getDateTimeLocaleTag } from '@/lib/i18n';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
    <Dialog open onOpenChange={(next) => { if (!next) (onClose)(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3">{<span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <HugeiconsIcon icon={CalendarDaysIcon} className="size-4" />
        </span>}<div className="min-w-0"><DialogTitle className="truncate">{dayLabel}</DialogTitle>{subtitle ? <DialogDescription className="truncate">{subtitle}</DialogDescription> : null}</div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <ItemGroup className="max-h-[min(420px,60vh)] gap-1.5 overflow-y-auto">
        {events.map((event) => {
          const time = formatEventTime(event, locale);
          return (
            <Item key={event.id} variant="outline" size="sm" render={<button type="button" className="h-auto justify-start text-left" />}
                onClick={() => onEventClick(event)}
              >
                <ItemMedia><span className="size-2 rounded-full bg-primary" aria-hidden /></ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {event.title || t('workspace.untitled')}
                  </ItemTitle>
                  <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {time ? (
                      <span className="inline-flex items-center gap-1">
                        <HugeiconsIcon icon={Clock01Icon} className="size-3" aria-hidden />
                        {time}
                      </span>
                    ) : (
                      <span>{t('calendarPage.all_day')}</span>
                    )}
                    {event.calendar_title ? (
                      <Badge variant="secondary">{event.calendar_title}</Badge>
                    ) : null}
                  </ItemDescription>
                </ItemContent>
              </Item>
          );
        })}
      </ItemGroup>
    </div><DialogFooter className="border-t px-4 py-3">{<div className="flex items-center justify-between gap-2 w-full">
          <Button variant="ghost"
  onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onCreateEvent}>
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            {t('calendarPage.new_event')}
          </Button>
        </div>}</DialogFooter></DialogContent></Dialog>
  );
}
