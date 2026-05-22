import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { DailyGoalId } from '@/lib/hooks/dashboardGamification';
import type { HomeGamification } from '@/lib/hooks/useDashboardData';

const RIBBON_KEYS: Record<DailyGoalId, string> = {
  write: 'dashboard.goal_ribbon_write',
  think: 'dashboard.goal_ribbon_think',
  build: 'dashboard.goal_ribbon_build',
};

const TITLE_KEYS: Record<DailyGoalId, string> = {
  write: 'dashboard.goal_title_write',
  think: 'dashboard.goal_title_think',
  build: 'dashboard.goal_title_build',
};

const SUB_KEYS: Record<DailyGoalId, string> = {
  write: 'dashboard.goal_sub_write',
  think: 'dashboard.goal_sub_think',
  build: 'dashboard.goal_sub_build',
};

export function DailyGoals({
  gamification,
  loading,
  onGoalClick,
}: {
  gamification: HomeGamification;
  loading: boolean;
  onGoalClick: (id: DailyGoalId) => void;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="h-goals">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-goal animate-pulse motion-reduce:animate-none" style={{ minHeight: 120 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="h-goals">
      {gamification.dailyGoals.map((goal) => (
        <button
          key={goal.id}
          type="button"
          className={`h-goal ${goal.done ? 'done' : ''}`}
          onClick={() => onGoalClick(goal.id)}
        >
          <div className="h-goal-head">
            <span className="ribbon">{t(RIBBON_KEYS[goal.id])}</span>
            <span className="check">{goal.done ? <Check size={14} strokeWidth={2.2} /> : null}</span>
          </div>
          <div className="title">{t(TITLE_KEYS[goal.id])}</div>
          <div className="sub">{t(SUB_KEYS[goal.id])}</div>
          <div className="h-goal-prog">
            <div className="bar">
              <div className="fill" style={{ width: `${goal.progress}%` }} />
            </div>
            <span>{goal.progressLabel}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
