import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Link01Icon, RefreshIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';
import { cn } from '@/lib/utils';

export function CalendarHero({
  syncHint,
  syncing,
  upcomingCount,
  onOpenSettings,
  onImport,
  onSync,
  onNewEvent,
}: {
  syncHint: string;
  syncing: boolean;
  upcomingCount: number;
  onOpenSettings: () => void;
  onImport: () => void;
  onSync: () => void;
  onNewEvent: () => void;
}) {
  const { t, i18n } = useTranslation();
  const date = new Date().toLocaleDateString(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b px-4 py-3 md:px-5">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{date}</span>
          <Badge variant="secondary" className="font-normal">
            {syncHint}
          </Badge>
          <Badge variant="outline" className="tabular-nums font-normal">
            {t('calendarPage.upcoming')}: {upcomingCount}
          </Badge>
        </div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {t('calendarPage.title')}
          <SectionGuideHelp sectionKey="calendar" />
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">{t('calendarPage.subtitle')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={onOpenSettings}>
          <HugeiconsIcon icon={Link01Icon} />
          {t('calendarPage.google_settings_short')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onImport}>
          <HugeiconsIcon icon={Upload04Icon} />
          {t('calendarPage.import_ics_short')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onSync} disabled={syncing}>
          <HugeiconsIcon
            icon={RefreshIcon}
            className={cn(syncing && 'animate-spin motion-reduce:animate-none')}
          />
          {t('calendarPage.sync')}
        </Button>
        <Button type="button" size="sm" onClick={onNewEvent}>
          <HugeiconsIcon icon={Add01Icon} />
          {t('calendarPage.new_event_short')}
        </Button>
      </div>
    </div>
  );
}
