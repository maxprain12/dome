import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SocialFilter } from '@/lib/social/socialQueues';

export function SocialStats({
  drafts,
  scheduled,
  attention,
  campaigns,
  activeFilter,
  onFilter,
}: {
  drafts: number;
  scheduled: number;
  attention: number;
  campaigns: number;
  activeFilter: SocialFilter;
  onFilter: (f: SocialFilter) => void;
}) {
  const { t } = useTranslation();
  const items: Array<{ key: SocialFilter; label: string; value: number }> = [
    { key: 'drafts', label: t('social.agent_stat_drafts'), value: drafts },
    { key: 'scheduled', label: t('social.agent_stat_scheduled'), value: scheduled },
    { key: 'attention', label: t('social.agent_stat_attention'), value: attention },
    { key: 'campaigns', label: t('social.agent_stat_campaigns'), value: campaigns },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => {
        const active = activeFilter === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onFilter(active ? 'all' : item.key)}
            className="text-left"
          >
            <Card
              className={cn(
                'gap-0 py-0 shadow-none transition-colors',
                active && 'ring-2 ring-primary/40',
              )}
            >
              <CardContent className="flex flex-col gap-0.5 px-3 py-3">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {item.value}
                </span>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
