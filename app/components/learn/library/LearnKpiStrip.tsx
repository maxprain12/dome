import { TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLearnKpis } from '@/lib/hooks/useLearnKpis';

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function LearnKpiStrip() {
  const { t } = useTranslation();
  const { kpis } = useLearnKpis();

  const dueToday = kpis?.dueToday ?? 0;
  const dueDelta = kpis?.dueTodayDelta ?? 0;
  const mastery = kpis?.masteryGlobal ?? 0;
  const streak = kpis?.streakDays ?? 0;
  const timeToday = kpis?.timeTodayMs ?? 0;
  const timeGoal = kpis?.timeTodayGoalMs ?? 20 * 60 * 1000;
  const timePct = Math.min(100, Math.round((timeToday / timeGoal) * 100));

  // Due sub: only show a delta when it's meaningful; otherwise a calm "caught up".
  const dueSub =
    dueDelta !== 0 ? (
      <span className={dueDelta > 0 ? 'up' : 'flat'}>
        {dueDelta > 0 ? <TrendingUp size={10} aria-hidden /> : <TrendingDown size={10} aria-hidden />}
        {dueDelta > 0 ? `+${dueDelta}` : dueDelta} {t('learn.kpi_vs_yesterday', 'vs yesterday')}
      </span>
    ) : dueToday === 0 ? (
      <span className="flat">{t('learn.kpi_caught_up', 'Caught up')}</span>
    ) : (
      <span className="flat">{t('learn.kpi_to_review', 'to review')}</span>
    );

  return (
    <div className="lr-stats lr-stats-strip">
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.kpi_due_today')}</span>
        <span className="lr-stat-value">{dueToday}</span>
        <span className="lr-stat-sub">{dueSub}</span>
      </div>
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.kpi_mastery')}</span>
        <span className="lr-stat-value">{mastery}%</span>
        <span className="lr-stat-sub">{t('learn.kpi_mastery_sub', 'cards memorized')}</span>
      </div>
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.kpi_streak')}</span>
        <span className="lr-stat-value">{streak}</span>
        <span className="lr-stat-sub">
          {t('learn.kpi_longest_streak', { count: kpis?.longestStreak ?? streak })}
        </span>
      </div>
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.kpi_time_today')}</span>
        <span className="lr-stat-value">{formatDuration(timeToday)}</span>
        <span className="lr-stat-sub">
          {timePct >= 100
            ? t('learn.kpi_goal_reached', 'Goal reached')
            : t('learn.kpi_time_goal', { goal: formatDuration(timeGoal) })}
        </span>
      </div>
    </div>
  );
}
