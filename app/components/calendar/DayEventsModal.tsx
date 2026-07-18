'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Clock01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { getDateFnsLocale, getDateTimeLocaleTag } from '@/lib/i18n';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';

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
    <AppModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="md">
        <AppModalHeader title={dayLabel} description={subtitle} />
        <AppModalBody>
          <ItemGroup className="max-h-[min(420px,60vh)] gap-1.5 overflow-y-auto">
            {events.map((event) => {
              const time = formatEventTime(event, locale);
              return (
                <Item
                  key={event.id}
                  variant="outline"
                  size="sm"
                  render={<button type="button" className="h-auto justify-start text-left" />}
                  onClick={() => onEventClick(event)}
                >
                  <ItemMedia>
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{event.title || t('workspace.untitled')}</ItemTitle>
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
        </AppModalBody>
        <AppModalFooter className="sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onCreateEvent}>
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            {t('calendarPage.new_event')}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
