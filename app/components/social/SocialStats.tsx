import { useTranslation } from 'react-i18next';
import { HubMetricGrid } from '@/components/shared/HubMetricGrid';
import type { DomainStat } from '@/components/shared/DomainStatChips';
import type { SocialFilter } from '@/lib/social/socialQueues';

export function SocialStats({
  drafts,
  scheduled,
  attention,
  campaigns,
  recent,
  activeFilter,
  onFilter,
}: {
  drafts: number;
  scheduled: number;
  attention: number;
  campaigns: number;
  recent: number;
  activeFilter: SocialFilter;
  onFilter: (f: SocialFilter) => void;
}) {
  const { t } = useTranslation();
  const chips: DomainStat[] = [
    { id: 'all', label: t('social.agent_filter_all'), value: '' },
    { id: 'drafts', label: t('social.agent_stat_drafts'), value: drafts },
    { id: 'scheduled', label: t('social.agent_stat_scheduled'), value: scheduled },
    { id: 'attention', label: t('social.agent_stat_attention'), value: attention },
    { id: 'campaigns', label: t('social.agent_stat_campaigns'), value: campaigns },
    { id: 'recent', label: t('social.agent_stat_recent'), value: recent },
  ].map((item) => ({
    ...item,
    active: activeFilter === item.id,
    onClick: () => onFilter(item.id as SocialFilter),
  }));

  return (
    <div role="toolbar" aria-label={t('social.agent_filter_all')}>
      <HubMetricGrid chips={chips} />
    </div>
  );
}
