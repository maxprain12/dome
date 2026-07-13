import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import { useTranslation, Trans } from 'react-i18next';
import type { HomeGamification } from '@/lib/hooks/useDashboardData';

function getGreeting(t: (k: string) => string): string {
  const h = new Date().getHours();
  if (h < 5) return t('dashboard.greeting_late');
  if (h < 12) return t('dashboard.greeting_morning');
  if (h < 18) return t('dashboard.greeting_afternoon');
  return t('dashboard.greeting_evening');
}

function formatEyebrowDate(locale: string): { short: string; week: number } {
  const now = new Date();
  const short = now
    .toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(/\./g, '');
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return { short, week };
}

export function EditorialHero({
  nameFirst,
  gamification,
  loading,
  isEditing,
  onStartCustomize,
  onDoneEditing,
  onAskMany,
}: {
  nameFirst: string;
  gamification: HomeGamification;
  loading: boolean;
  isEditing: boolean;
  onStartCustomize: () => void;
  onDoneEditing: () => void;
  onAskMany: () => void;
}) {
  const { t, i18n } = useTranslation();
  const greeting = getGreeting(t);
  const { short, week } = formatEyebrowDate(i18n.language);
  const energy = gamification.momentumPercent;
  const delta = gamification.weeklyEnergyDelta;
  const waiting = gamification.pendingTodayCount;

  return (
    <header className="h-hero">
      <div className="h-hero-main">
        <div className="h-eyebrow h-hero-eyebrow">
          <span>{short}</span>
          <span className="sep" aria-hidden />
          <span>{t('dashboard.week_label', { week })}</span>
        </div>

        <h1 className="h-greeting">
          {greeting}
          {nameFirst ? (
            <>
              , <span className="accent">{nameFirst}</span>.
            </>
          ) : (
            '.'
          )}
        </h1>

        {!loading && (
          <p className="h-hero-sub">
            <Trans
              i18nKey="dashboard.hero_narrative"
              values={{
                current: gamification.dailyGoalProgress,
                target: gamification.dailyGoalTarget,
                energy: Math.round(energy),
                waiting,
              }}
              components={{ b: <b /> }}
            />
          </p>
        )}

        <div className="h-hero-actions">
          {isEditing ? (
            <button type="button" className="h-pill-btn primary" onClick={onDoneEditing}>
              <HugeiconsIcon icon={CheckIcon} size={12} strokeWidth={2.2} aria-hidden />
              {t('dashboard.edit_mode_done')}
            </button>
          ) : (
            <button type="button" className="h-pill-btn" onClick={onStartCustomize}>
              <HugeiconsIcon icon={SlidersHorizontalIcon} size={12} strokeWidth={2} aria-hidden />
              {t('dashboard.customize_home_short')}
            </button>
          )}
          <button type="button" className="h-pill-btn" onClick={onAskMany}>
            <HugeiconsIcon icon={SparklesIcon} size={12} strokeWidth={2} aria-hidden />
            {t('dashboard.ask_many_short')}
          </button>
        </div>
      </div>

      <div className="h-hero-stats">
        <div className="h-streak-card">
          <span className="label">{t('dashboard.streak_card_label')}</span>
          {loading ? (
            <span className="value">—</span>
          ) : (
            <span className="value">
              {gamification.streakDays}{' '}
              <small>{t('dashboard.streak_days', { count: gamification.streakDays })}</small>
            </span>
          )}
          <span className="flame" aria-hidden>
            🔥
          </span>
        </div>
        <div className="h-energy-card">
          <span className="label">{t('dashboard.energy_card_label')}</span>
          {loading ? (
            <span className="value">—</span>
          ) : (
            <>
              <span className="value">{Math.round(energy)}%</span>
              <div className="h-energy-bar">
                <div className="fill" style={{ width: `${Math.min(energy, 100)}%` }} />
              </div>
              <span className={`delta ${delta >= 0 ? 'up' : ''}`}>
                {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% {t('dashboard.vs_last_week')}
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
