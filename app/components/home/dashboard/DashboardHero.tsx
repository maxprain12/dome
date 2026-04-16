import { useTranslation } from 'react-i18next';
import { Settings2, Flame, Check } from 'lucide-react';
import type { HomeGamification } from '@/lib/hooks/useDashboardData';
import DomeCard from '@/components/ui/DomeCard';
import DomeButton from '@/components/ui/DomeButton';
import DomeProgressBar from '@/components/ui/DomeProgressBar';

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
  isEditing,
  onStartCustomize,
  onDoneEditing,
}: {
  nameFirst: string;
  gamification: HomeGamification;
  loading: boolean;
  isEditing: boolean;
  onStartCustomize: () => void;
  onDoneEditing: () => void;
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
    <DomeCard
      padding="lg"
      className="rounded-2xl border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] sm:p-8"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--dome-text, var(--primary-text))' }}>
            {greeting}
            {nameFirst ? `, ${nameFirst}` : ''}
          </h1>
          <p className="mt-1.5 text-sm font-medium" style={{ color: 'var(--dome-text-secondary, var(--tertiary-text))' }}>
            {today}
          </p>
        </div>
        <DomeButton
          type="button"
          variant="outline"
          size="sm"
          leftIcon={
            isEditing ? (
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
            ) : (
              <Settings2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            )
          }
          onClick={isEditing ? onDoneEditing : onStartCustomize}
          className="self-start shrink-0"
        >
          {isEditing ? t('dashboard.edit_mode_done') : t('dashboard.customize_home')}
        </DomeButton>
      </div>

      <div className="mt-10">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--dome-text-secondary, var(--tertiary-text))' }}>
          {t('dashboard.goal_today')}
        </p>

        <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-md flex-1">
            {loading ? (
              <div
                className="h-10 w-full animate-pulse motion-reduce:animate-none rounded-xl"
                style={{ background: 'var(--dome-border, var(--border))' }}
              />
            ) : (
              <>
                <p className="mb-3 text-sm font-medium" style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}>
                  {t('dashboard.goal_progress', { current: progress, target })}
                </p>
                <DomeProgressBar value={pct} max={100} size="md" aria-label={t('dashboard.goal_today')} />
              </>
            )}
          </div>

          {!loading && (
            <div
              className="flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-2.5"
              style={{
                borderColor: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 28%, var(--dome-border, var(--border)))',
                background: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 8%, var(--dome-surface, var(--bg-secondary)))',
              }}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 18%, transparent)',
                  color: 'var(--dome-accent, var(--accent))',
                }}
              >
                <Flame className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </span>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: 'var(--dome-accent, var(--accent))' }}>
                  {gamification.streakDays}
                </p>
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 75%, var(--dome-text-muted, var(--tertiary-text)))' }}
                >
                  {t('dashboard.streak_label')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DomeCard>
  );
}
