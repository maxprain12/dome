import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Link01Icon, MoreHorizontalIcon, RefreshIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';
import { HubSectionShell } from '@/components/shared/HubSectionShell';
import { cn } from '@/lib/utils';

export function CalendarHero({
  syncHint,
  syncing,
  upcomingCount,
  onOpenSettings,
  onImport,
  onSync,
  onNewEvent,
  children,
}: {
  syncHint: string;
  syncing: boolean;
  upcomingCount: number;
  onOpenSettings: () => void;
  onImport: () => void;
  onSync: () => void;
  onNewEvent: () => void;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const date = new Date().toLocaleDateString(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <HubSectionShell
      title={t('calendarPage.title')}
      description={t('calendarPage.subtitle')}
      actions={
        <>
          <Button type="button" size="sm" onClick={onNewEvent}>
            <HugeiconsIcon icon={Add01Icon} />
            {t('calendarPage.new_event_short')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" size="icon-sm" />}
              aria-label={t('calendarPage.more_actions')}
              title={t('calendarPage.more_actions')}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenSettings}>
                <HugeiconsIcon icon={Link01Icon} />
                {t('calendarPage.google_settings_short')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImport}>
                <HugeiconsIcon icon={Upload04Icon} />
                {t('calendarPage.import_ics_short')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSync} disabled={syncing}>
                <HugeiconsIcon
                  icon={RefreshIcon}
                  className={cn(syncing && 'animate-spin motion-reduce:animate-none')}
                />
                {t('calendarPage.sync')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{date}</span>
          <Badge variant="lavender" className="font-normal">
            {syncHint}
          </Badge>
          <Badge variant="outline" className="tabular-nums font-normal">
            {t('calendarPage.upcoming')}: {upcomingCount}
          </Badge>
          <SectionGuideHelp sectionKey="calendar" />
        </div>
      }
    >
      {children}
    </HubSectionShell>
  );
}
