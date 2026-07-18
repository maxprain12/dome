import { useTranslation } from 'react-i18next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const metrics = [
    {
      label: t('learn.kpi_due_today'),
      value: kpis?.dueToday ?? 0,
      detail: t('learn.kpi_to_review', 'to review'),
    },
    {
      label: t('learn.kpi_mastery'),
      value: `${kpis?.masteryGlobal ?? 0}%`,
      detail: t('learn.kpi_mastery_sub', 'cards memorized'),
    },
    {
      label: t('learn.kpi_streak'),
      value: kpis?.streakDays ?? 0,
      detail: t('learn.kpi_longest_streak', {
        count: kpis?.longestStreak ?? kpis?.streakDays ?? 0,
      }),
    },
    {
      label: t('learn.kpi_time_today'),
      value: formatDuration(kpis?.timeTodayMs ?? 0),
      detail: t('learn.kpi_time_goal', {
        goal: formatDuration(kpis?.timeTodayGoalMs ?? 20 * 60 * 1000),
      }),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 @[40rem]/learn:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} size="sm">
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{metric.value}</CardTitle>
            <CardDescription className="line-clamp-2">{metric.detail}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
