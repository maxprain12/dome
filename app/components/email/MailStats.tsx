import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
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
  const items: Array<{ key: MailFilter; label: string; value: number }> = [
    { key: 'attend', label: t('email.agent_stat_attend'), value: attend },
    { key: 'network', label: t('email.agent_stat_network'), value: network },
    { key: 'needs_reply', label: t('email.agent_stat_needs_reply'), value: needsReply },
    { key: 'recent_sent', label: t('email.agent_stat_recent_sent'), value: recentSent },
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
