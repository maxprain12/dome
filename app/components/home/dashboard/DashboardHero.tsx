import { useTranslation } from 'react-i18next';
import { Settings2, Flame } from 'lucide-react';
import type { HomeGamification } from '@/lib/hooks/useDashboardData';

function getGreeting(t: (k: string) => string): string {
  const h = new Date().getHours();
  if (h < 12) return t('dashboard.greeting_morning');
  if (h < 18) return t('dashboard.greeting_afternoon');
  return t('dashboard.greeting_evening');
}

export function DashboardHero({
  nameFirst,
  gamification,
  loading,
  onCustomize,
}: {
  nameFirst: string;
  gamification: HomeGamification;
  loading: boolean;
  onCustomize: () => void;
}) {
  const { t } = useTranslation();
  const greeting = getGreeting(t);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const target = gamification.dailyGoalTarget || 3;
  const progress = Math.min(target, gamification.dailyGoalProgress);
  const pct = target > 0 ? Math.round((progress / target) * 100) : 0;

  return (
    <div className="mb-8 rounded-[24px] border p-6 sm:p-8" style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--dome-text)' }}>
            {greeting}
            {nameFirst ? `, ${nameFirst}` : ''}
          </h1>
          <p className="mt-1.5 text-sm font-medium" style={{ color: 'var(--dome-text-secondary, #4a4766)' }}>
            {today}
          </p>
        </div>
        <button
          type="button"
          onClick={onCustomize}
          className="inline-flex cursor-pointer items-center gap-2 self-start rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
          style={{
            borderColor: 'var(--dome-border)',
            color: 'var(--dome-text)',
            background: 'var(--dome-bg)',
          }}
        >
          <Settings2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t('dashboard.customize_home')}
        </button>
      </div>

      <div className="mt-10">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--dome-text-secondary)' }}>
          {t('dashboard.goal_today')}
        </p>
        
        <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 min-w-0 max-w-md">
            {loading ? (
              <div className="h-10 w-full animate-pulse motion-reduce:animate-none rounded-xl" style={{ background: 'var(--dome-border)' }} />
            ) : (
              <>
                <p className="text-sm font-medium mb-3" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('dashboard.goal_progress', { current: progress, target })}
                </p>
                <div
                  className="h-3.5 w-full overflow-hidden rounded-full"
                  style={{ background: 'var(--dome-border)' }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={t('dashboard.goal_today')}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500 motion-reduce:transition-none"
                    style={{
                      width: `${pct}%`,
                      background: 'var(--dome-accent)',
                      boxShadow: '0 0 12px rgba(124,111,205,0.35)',
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {!loading && (
            <div
              className="flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-2.5"
              style={{ borderColor: 'rgba(249,115,22,0.2)', background: 'rgba(249,115,22,0.04)' }}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>
                <Flame className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </span>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: '#f97316' }}>
                  {gamification.streakDays}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(249,115,22,0.8)' }}>
                  {t('dashboard.streak_label')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
