import { HubMetricGrid } from '@/components/shared/HubMetricGrid';
import type { DomainStat } from '@/components/shared/DomainStatChips';
import { useTranslation } from 'react-i18next';
import type { MailFilter } from '@/lib/email/mailQueues';

export function MailStats({
  attend,
  network,
  needsReply,
  recentSent,
  activeFilter,
  onFilter,
}: {
  attend: number;
  network: number;
  needsReply: number;
  recentSent: number;
  activeFilter: MailFilter;
  onFilter: (f: MailFilter) => void;
}) {
  const { t } = useTranslation();
  const chips: DomainStat[] = (
    [
      { key: 'attend', label: t('email.agent_stat_attend'), value: attend },
      { key: 'network', label: t('email.agent_stat_network'), value: network },
      { key: 'needs_reply', label: t('email.agent_stat_needs_reply'), value: needsReply },
      { key: 'recent_sent', label: t('email.agent_stat_recent_sent'), value: recentSent },
    ] as const
  ).map((item) => {
    const active = activeFilter === item.key;
    return {
      id: item.key,
      label: item.label,
      value: item.value,
      active,
      onClick: () => onFilter(active ? 'all' : item.key),
    };
  });

  return <HubMetricGrid chips={chips} />;
}
