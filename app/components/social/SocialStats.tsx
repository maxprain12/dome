import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
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
  const items: Array<{ key: SocialFilter; label: string; value?: number }> = [
    { key: 'all', label: t('social.agent_filter_all') },
    { key: 'drafts', label: t('social.agent_stat_drafts'), value: drafts },
    { key: 'scheduled', label: t('social.agent_stat_scheduled'), value: scheduled },
    { key: 'attention', label: t('social.agent_stat_attention'), value: attention },
    { key: 'campaigns', label: t('social.agent_stat_campaigns'), value: campaigns },
    { key: 'recent', label: t('social.agent_stat_recent'), value: recent },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const active = activeFilter === item.key;
        return (
          <Button
            key={item.key}
            type="button"
            size="xs"
            variant={active ? 'secondary' : 'ghost'}
            onClick={() => onFilter(item.key)}
            className="tabular-nums"
          >
            {item.label}
            {typeof item.value === 'number' ? (
              <span className="text-muted-foreground">{item.value}</span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
