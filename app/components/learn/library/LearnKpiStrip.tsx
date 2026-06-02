import { TrendingUp, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLearnKpis } from '@/lib/hooks/useLearnKpis';

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Delta({ value, vsYesterdayLabel }: { value: number; vsYesterdayLabel: string }) {
  if (value === 0) {
    return (
      <span className="flat">
        <Minus size={10} aria-hidden /> — {vsYesterdayLabel}
      </span>
    );
  }
  const sign = value > 0 ? '+' : '';
  return (
    <span className={value > 0 ? 'up' : 'flat'}>
      <TrendingUp size={10} aria-hidden /> {sign}
      {value} {vsYesterdayLabel}
    </span>
  );
}

export default function LearnKpiStrip() {
  const { t } = useTranslation();
  const { kpis } = useLearnKpis();
  const vsYesterday = t('learn.kpi_vs_yesterday');

  const dueToday = kpis?.dueToday ?? 0;
  const mastery = kpis?.masteryGlobal ?? 0;
  const streak = kpis?.streakDays ?? 0;
  const timeToday = kpis?.timeTodayMs ?? 0;
  const timeGoal = kpis?.timeTodayGoalMs ?? 20 * 60 * 1000;

  return (
    <div className="lr-stats lr-stats-strip">
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.kpi_due_today')}</span>
        <span className="lr-stat-value">{dueToday}</span>
        <span className="lr-stat-sub">
          <Delta value={kpis?.dueTodayDelta ?? 0} vsYesterdayLabel={vsYesterday} />
        </span>
      </div>
      <div className="lr-stat">
        <span className="lr-stat-label">{t('learn.kpi_mastery')}</span>
        <span className="lr-stat-value">{mastery}%</span>
        <span className="lr-stat-sub">
          <Delta value={kpis?.masteryDelta ?? 0} vsYesterdayLabel="%" />
        </span>
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
          {t('learn.kpi_time_goal', { goal: formatDuration(timeGoal) })}
        </span>
      </div>
    </div>
  );
}
