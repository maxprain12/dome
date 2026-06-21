import { useTranslation } from 'react-i18next';
import { Link2, Plus, RefreshCw, Upload } from 'lucide-react';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';

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

  const eyebrowDate = new Date()
    .toLocaleDateString(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(/\./g, '');

  return (
    <header className="h-hero c-calendar-hero">
      <div className="h-hero-main">
        <div className="h-eyebrow h-hero-eyebrow">
          <span>{eyebrowDate}</span>
          <span className="sep" aria-hidden />
          <span>{syncHint}</span>
        </div>

        <h1 className="h-page-title inline-flex items-center gap-2 min-w-0">
          <span className="min-w-0">{t('calendarPage.title')}</span>
          <SectionGuideHelp sectionKey="calendar" />
        </h1>
        <p className="h-hero-sub">{t('calendarPage.subtitle')}</p>

        <div className="h-hero-actions">
          <button type="button" className="h-pill-btn" onClick={onOpenSettings} title={t('calendarPage.open_settings')}>
            <Link2 size={12} strokeWidth={2} aria-hidden />
            {t('calendarPage.google_settings_short')}
          </button>
          <button type="button" className="h-pill-btn" onClick={onImport}>
            <Upload size={12} strokeWidth={2} aria-hidden />
            {t('calendarPage.import_ics_short')}
          </button>
          <button type="button" className="h-pill-btn" onClick={onSync} disabled={syncing} title={t('calendarPage.sync')}>
            <RefreshCw size={12} strokeWidth={2} className={syncing ? 'animate-spin' : ''} aria-hidden />
            {t('calendarPage.sync')}
          </button>
          <button type="button" className="h-pill-btn primary" onClick={onNewEvent}>
            <Plus size={12} strokeWidth={2} aria-hidden />
            {t('calendarPage.new_event_short')}
          </button>
        </div>
      </div>

      <div className="c-calendar-hero-card" aria-label={t('calendarPage.upcoming')}>
        <span className="label">{t('calendarPage.upcoming')}</span>
        <span className="value">{upcomingCount}</span>
        <span className="sub">{t('calendarPage.upcoming_hint')}</span>
      </div>
    </header>
  );
}
