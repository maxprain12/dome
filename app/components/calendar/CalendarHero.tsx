import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Link01Icon, RefreshIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
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
  const date = new Date().toLocaleDateString(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2"><span>{date}</span><Badge variant="secondary">{syncHint}</Badge></span>}
        title={<span className="inline-flex items-center gap-2">{t('calendarPage.title')}<SectionGuideHelp sectionKey="calendar" /></span>}
        description={t('calendarPage.subtitle')}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={onOpenSettings} title={t('calendarPage.open_settings')}>
              <HugeiconsIcon icon={Link01Icon} />{t('calendarPage.google_settings_short')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onImport}>
              <HugeiconsIcon icon={Upload04Icon} />{t('calendarPage.import_ics_short')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onSync} disabled={syncing}>
              <HugeiconsIcon icon={RefreshIcon} className={cn(syncing && 'animate-spin motion-reduce:animate-none')} />{t('calendarPage.sync')}
            </Button>
            <Button type="button" size="sm" onClick={onNewEvent}>
              <HugeiconsIcon icon={Add01Icon} />{t('calendarPage.new_event_short')}
            </Button>
          </>
        }
      />
      <Card className="gap-1 py-3 shadow-none">
        <CardContent className="px-4">
          <span className="text-xs font-medium text-muted-foreground">{t('calendarPage.upcoming')}</span>
          <span className="block text-3xl font-semibold tabular-nums">{upcomingCount}</span>
          <span className="text-xs text-muted-foreground">{t('calendarPage.upcoming_hint')}</span>
        </CardContent>
      </Card>
    </div>
  );
}
