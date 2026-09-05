import { HubMetricGrid } from '@/components/shared/HubMetricGrid';
import type { DomainStat } from '@/components/shared/DomainStatChips';
import { useTranslation } from 'react-i18next';

export type TrackingFilter = 'all' | 'open' | 'due_soon' | 'no_objective' | 'done';

export function TrackingStats({
  openCount,
  dueSoonCount,
  noObjectiveCount,
  doneCount,
  activeFilter,
  onFilter,
}: {
  openCount: number;
  dueSoonCount: number;
  noObjectiveCount: number;
  doneCount: number;
  activeFilter: TrackingFilter;
  onFilter: (f: TrackingFilter) => void;
}) {
  const { t } = useTranslation();
  const chips: DomainStat[] = [
    { key: 'open' as const, label: t('github.dash_stat_open'), value: openCount },
    { key: 'due_soon' as const, label: t('github.dash_stat_due_soon'), value: dueSoonCount },
    { key: 'no_objective' as const, label: t('github.dash_stat_no_objective'), value: noObjectiveCount },
    { key: 'done' as const, label: t('github.dash_stat_done'), value: doneCount },
  ].map((item) => {
    const active = activeFilter === item.key;
    return {
      id: item.key,
      label: item.label,
      value: item.value,
      active,
      onClick: () => onFilter(active ? 'all' : item.key),
    };
  });

  return (
    <div role="toolbar" aria-label={t('github.dash_filters')}>
      <HubMetricGrid chips={chips} />
    </div>
  );
}
