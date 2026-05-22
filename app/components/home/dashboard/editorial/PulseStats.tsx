import { useTranslation } from 'react-i18next';
import type { DashboardStatsDeltas } from '@/lib/hooks/dashboardGamification';
import type { DashboardStats } from '@/lib/hooks/useDashboardData';
import { HomeSectionHeader } from '@/components/home/dashboard/editorial/HomeSectionHeader';

function formatDelta(delta: number): string {
  if (delta === 0) return '0';
  return delta > 0 ? `+${delta}` : String(delta);
}

export function PulseStats({
  stats,
  deltas,
  loading,
  onOpenAnalytics,
}: {
  stats: DashboardStats;
  deltas: DashboardStatsDeltas;
  loading: boolean;
  onOpenAnalytics: () => void;
}) {
  const { t } = useTranslation();

  const cells = [
    { key: 'resources', value: stats.resourceCount, delta: deltas.resources },
    { key: 'chats', value: stats.recentChats, delta: deltas.chats },
    { key: 'cards', value: stats.dueFlashcards, delta: deltas.dueCards },
    { key: 'studio', value: stats.studioCount, delta: deltas.studioDocs },
    { key: 'runs', value: stats.activeRuns, delta: deltas.activeRuns },
  ] as const;

  return (
    <section>
      <HomeSectionHeader
        title={t('dashboard.section_pulse')}
        linkLabel={t('dashboard.open_analytics')}
        onLinkClick={onOpenAnalytics}
      />
      <div className="h-stats">
        {cells.map((cell) => (
          <div key={cell.key} className="cell">
            {loading ? (
              <span className="v">—</span>
            ) : (
              <span className="v">
                {cell.value}
                <sup>{formatDelta(cell.delta)}</sup>
              </span>
            )}
            <span className="k">{t(`dashboard.stat_${cell.key}`)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
