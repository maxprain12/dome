import { HugeiconsIcon } from '@hugeicons/react';
import {
  SlidersHorizontalIcon,
  FlameIcon,
  CheckIcon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { HomeGamification } from '@/lib/hooks/useDashboardData';
import { Progress } from '@/components/ui/progress';
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
    <Card className="p-6 rounded-2xl border-[var(--border)] bg-[var(--card)] sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
            {greeting}
            {nameFirst ? `, ${nameFirst}` : ''}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-muted-foreground">
            {today}
          </p>
        </div>
        <Button type="button"
  variant="outline"
  onClick={isEditing ? onDoneEditing : onStartCustomize}
  className="self-start shrink-0"
  size="sm">{
            isEditing ? (
              <HugeiconsIcon icon={CheckIcon} className="size-4" strokeWidth={2} aria-hidden />
            ) : (
              <HugeiconsIcon icon={SlidersHorizontalIcon} className="size-4" strokeWidth={2} aria-hidden />
            )
          }
          {isEditing ? t('dashboard.edit_mode_done') : t('dashboard.customize_home')}
        </Button>
      </div>

      <div className="mt-10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {t('dashboard.goal_today')}
        </p>

        <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-md flex-1">
            {loading ? (
              <div
                className="h-10 w-full animate-pulse motion-reduce:animate-none rounded-xl bg-border"
              />
            ) : (
              <>
                <p className="mb-3 text-sm font-medium text-muted-foreground">
                  {t('dashboard.goal_progress', { current: progress, target })}
                </p>
                <Progress value={pct} className="h-2.5" aria-label={t('dashboard.goal_today')} />
              </>
            )}
          </div>

          {!loading && (
            <div
              className="flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-2.5"
              style={{
                borderColor: 'color-mix(in srgb, var(--primary) 28%, var(--border))',
                background: 'color-mix(in srgb, var(--primary) 8%, var(--card))',
              }}
            >
              <span
                className="flex size-8 items-center justify-center rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 18%, transparent)',
                  color: 'var(--primary)',
                }}
              >
                <HugeiconsIcon icon={FlameIcon} className="size-4" strokeWidth={2.5} aria-hidden />
              </span>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold tabular-nums leading-none text-primary">
                  {gamification.streakDays}
                </p>
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'color-mix(in srgb, var(--primary) 75%, var(--muted-foreground))' }}
                >
                  {t('dashboard.streak_label')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
