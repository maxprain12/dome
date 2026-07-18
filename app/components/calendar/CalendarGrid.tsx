'use client';

import { useMemo, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { startOfWeek, addDays, format } from 'date-fns';
import type { CalendarEvent, CalendarViewMode } from '@/lib/store/useCalendarStore';
import { getDateFnsLocale } from '@/lib/i18n';
import { MonthView } from './CalendarMonthView';
import { WeekView, DayView } from './CalendarTimeViews';
import { YearView } from './CalendarYearView';
import {
  MODES,
  formatHeader,
  navigateDate,
  type EventDateChangePayload,
} from './calendarGridShared';

export type { EventDateChangePayload };

interface CalendarGridProps {
  currentDate: Date;
  viewMode: CalendarViewMode;
  events: CalendarEvent[];
  onCurrentDateChange: (d: Date) => void;
  onViewModeChange: (m: CalendarViewMode) => void;
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onEventDateChange?: (p: EventDateChangePayload) => void;
}

export default function CalendarGrid({
  currentDate,
  viewMode,
  events,
  onCurrentDateChange,
  onViewModeChange,
  onDayClick,
  onEventClick,
  onEventDateChange,
}: CalendarGridProps) {
  const { t } = useTranslation();
  const dfLocale = getDateFnsLocale();
  const modeLabels = useMemo(
    (): Record<CalendarViewMode, string> => ({
      day: t('calendarPage.view_day'),
      week: t('calendarPage.view_week'),
      month: t('calendarPage.view_month'),
      year: t('calendarPage.view_year'),
    }),
    [t],
  );
  const weekdayShortLabels = useMemo(() => {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(ws, i), 'EEE', { locale: dfLocale }));
  }, [dfLocale]);
  const headerTitle = useMemo(
    () => formatHeader(currentDate, viewMode, dfLocale),
    [currentDate, viewMode, dfLocale],
  );

  const handlePrev = useCallback(
    () => onCurrentDateChange(navigateDate(currentDate, viewMode, -1)),
    [currentDate, viewMode, onCurrentDateChange],
  );
  const handleNext = useCallback(
    () => onCurrentDateChange(navigateDate(currentDate, viewMode, 1)),
    [currentDate, viewMode, onCurrentDateChange],
  );
  const handleToday = useCallback(() => onCurrentDateChange(new Date()), [onCurrentDateChange]);

  const handleYearMonthClick = useCallback((month: Date) => {
    onCurrentDateChange(month);
    onViewModeChange('month');
  }, [onCurrentDateChange, onViewModeChange]);

  return (
    <div className="flex size-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handlePrev}
            aria-label={t('common.back')}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleNext}
            aria-label={t('common.next')}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleToday}>
            {t('calendarPage.today')}
          </Button>
          <span className="ml-2 truncate text-[15px] font-medium capitalize tracking-tight">
            {headerTitle}
          </span>
        </div>

        <Tabs
          value={viewMode}
          onValueChange={(v) => onViewModeChange(v as CalendarViewMode)}
          className="shrink-0"
        >
          <TabsList className="h-8">
            {MODES.map((m) => (
              <TabsTrigger key={m} value={m} className="px-2.5 text-xs">
                {modeLabels[m]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Calendar content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'month' && (
          <MonthView
            date={currentDate}
            events={events}
            onDayClick={onDayClick}
            onEventClick={onEventClick}
            onEventDateChange={onEventDateChange}
            weekdayShortLabels={weekdayShortLabels}
          />
        )}
        {viewMode === 'week' && (
          <WeekView
            date={currentDate}
            events={events}
            onEventClick={onEventClick}
            onEventDateChange={onEventDateChange}
            dfLocale={dfLocale}
          />
        )}
        {viewMode === 'day' && (
          <DayView
            date={currentDate}
            events={events}
            onEventClick={onEventClick}
            onEventDateChange={onEventDateChange}
          />
        )}
        {viewMode === 'year' && (
          <YearView
            date={currentDate}
            events={events}
            onMonthClick={handleYearMonthClick}
            dfLocale={dfLocale}
          />
        )}
      </div>
    </div>
  );
}
