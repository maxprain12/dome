import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { DashboardRow } from '@/components/shared/dashboard/DashboardCollection';
import { localDayKey, toEpochMs } from '@/lib/hooks/dashboardGamification';
import type { DashboardUpcomingEvent, PendingTodayItem } from '@/lib/hooks/useDashboardData';

export function DashboardAgenda({ events, pending, loading, onCalendar, onPending }: {
  events: DashboardUpcomingEvent[]; pending: PendingTodayItem[]; loading: boolean;
  onCalendar: () => void; onPending: (item: PendingTodayItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const today = localDayKey(Date.now());
  const [selected, setSelected] = useState(today);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date;
  });
  const dayEvents = events.filter((event) => localDayKey(toEpochMs(event.start_at)) === selected).sort((a, b) => toEpochMs(a.start_at) - toEpochMs(b.start_at));
  const otherPending = selected === today ? pending.filter((item) => item.kind !== 'calendar') : [];
  return <Card>
    <CardHeader><CardTitle>{t('dashboardPanels.agenda')}</CardTitle><CardDescription>{t('dashboardPanels.agenda_week')}</CardDescription><CardAction><Button size="sm" variant="ghost" onClick={onCalendar}>{t('dashboardPanels.calendar')}</Button></CardAction></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <ToggleGroup value={[selected]} className="w-full justify-between" aria-label={t('dashboardPanels.agenda')} onValueChange={(values) => { if (values[0]) setSelected(values[0]); }}>
        {days.map((date) => <ToggleGroupItem key={localDayKey(date.getTime())} value={localDayKey(date.getTime())} className="h-auto min-w-0 flex-1 flex-col gap-1 py-2" aria-label={date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}><span className="text-xs text-muted-foreground">{date.toLocaleDateString(i18n.language, { weekday: 'short' })}</span><span className="text-base tabular-nums">{date.getDate()}</span></ToggleGroupItem>)}
      </ToggleGroup>
      <div className="flex flex-col gap-2" aria-live="polite">
        {loading ? <Skeleton className="h-28 w-full" /> : <>
          {dayEvents.slice(0, 4).map((event) => <DashboardRow key={event.id} title={event.title} detail={t('dashboardPanels.calendar')} marker={<span className="text-xs tabular-nums">{new Date(toEpochMs(event.start_at)).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</span>} onClick={onCalendar} />)}
          {otherPending.slice(0, 3).map((item) => <DashboardRow key={item.id} title={item.title} detail={item.subtitle} onClick={() => onPending(item)} />)}
          {dayEvents.length + otherPending.length === 0 && <Empty><EmptyHeader><EmptyTitle>{t('dashboard.table_empty_pending')}</EmptyTitle></EmptyHeader></Empty>}
        </>}
      </div>
    </CardContent>
  </Card>;
}
