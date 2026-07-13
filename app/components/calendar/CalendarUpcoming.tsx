import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, Calendar03Icon } from '@hugeicons/core-free-icons';
import type { CalendarEvent } from '@/lib/store/useCalendarStore';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Button } from '@/components/ui/button';

function formatFeedTime(event: CalendarEvent, locale: string): string {
  const start = new Date(event.start_at);
  if (event.all_day) return start.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
  return start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function CalendarUpcoming({ events, onEventClick }: { events: CalendarEvent[]; onEventClick: (event: CalendarEvent) => void }) {
  const { t } = useTranslation();
  const locale = getDateTimeLocaleTag();

  return (
    <Card className="h-fit gap-3 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between text-sm">
          {t('calendarPage.upcoming')}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{events.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        {events.length === 0 ? (
          <Empty className="min-h-44 border-0 p-4">
            <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Calendar03Icon} /></EmptyMedia><EmptyTitle>{t('calendarPage.no_upcoming')}</EmptyTitle><EmptyDescription>{t('calendarPage.upcoming_hint')}</EmptyDescription></EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-1">
            {events.map((event) => (
              <Item key={event.id} size="xs" variant="default">
                <ItemMedia className="w-14 justify-start text-xs tabular-nums text-muted-foreground">{formatFeedTime(event, locale)}</ItemMedia>
                <ItemContent>
                  <ItemTitle>{event.title}</ItemTitle>
                  <ItemDescription>{new Date(event.start_at).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => onEventClick(event)} aria-label={event.title}>
                    <HugeiconsIcon icon={ArrowRight01Icon} />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
