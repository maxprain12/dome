import { useTranslation } from 'react-i18next';
import type { HomeGamification } from '@/lib/hooks/useDashboardData';
import { DashboardSectionLabel } from '@/components/home/dashboard/DashboardSectionLabel';

export function DashboardWeeklyActivity({
  gamification,
  loading,
}: {
  gamification: HomeGamification;
  loading: boolean;
}) {
  const { t } = useTranslation();

  const rows: { label: string; value: number }[] = [
    { label: t('dashboard.weekly_created'), value: gamification.weeklyResourcesCreated },
    { label: t('dashboard.weekly_touches'), value: gamification.weeklyResourceTouches },
    { label: t('dashboard.weekly_chats'), value: gamification.weeklyChatSessions },
    { label: t('dashboard.weekly_runs'), value: gamification.weeklyRunsCompleted },
  ];

  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <section className="mb-8">
      <DashboardSectionLabel>{t('dashboard.section_weekly')}</DashboardSectionLabel>
      <div
        className="rounded-[24px] border px-6 py-8"
        style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
      >
        {loading ? (
          <div className="h-32 animate-pulse motion-reduce:animate-none rounded-xl" style={{ background: 'var(--dome-border)' }} />
        ) : (
          <ul className="flex flex-col gap-6">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-4">
                <span className="w-48 shrink-0 text-sm font-medium" style={{ color: 'var(--dome-text-secondary)' }}>
                  {row.label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--dome-border)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500 motion-reduce:transition-none"
                    style={{
                      width: `${Math.min(100, Math.round((row.value / max) * 100))}%`,
                      background: 'var(--dome-accent)',
                    }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums" style={{ color: 'var(--dome-text)' }}>
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
