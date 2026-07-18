import { useTranslation } from 'react-i18next';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { cn } from '@/lib/utils';
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
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label={t('social.agent_filter_all')}>
      {items.map((item) => {
        const active = activeFilter === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onFilter(item.key)}
            aria-pressed={active}
            data-active={active ? 'true' : undefined}
            className={cn(
              selectionSurfaceClass(active, 'inline-flex items-center gap-1 px-2.5 py-1 text-xs tabular-nums', {
                shape: 'chip',
              }),
            )}
          >
            {item.label}
            {typeof item.value === 'number' ? (
              <span className={active ? 'text-foreground/70' : 'text-muted-foreground'}>{item.value}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
