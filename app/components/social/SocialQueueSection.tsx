import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import type { SocialPost } from '@/components/social/socialTypes';
import type { SocialCampaignGroup, SocialQueueId } from '@/lib/social/socialQueues';
import { SocialPostRow } from './SocialPostRow';

const INITIAL_VISIBLE = 30;
const LOAD_MORE = 30;

export function SocialQueueSection({
  queueId,
  title,
  posts,
  selectedId,
  onOpen,
  compact,
}: {
  queueId: SocialQueueId;
  title: string;
  posts: SocialPost[];
  selectedId?: string | null;
  onOpen: (post: SocialPost) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisible(INITIAL_VISIBLE);
  }, [posts.length, queueId, title]);

  if (posts.length === 0) return null;

  const slice = posts.slice(0, visible);
  const remaining = posts.length - slice.length;

  return (
    <Card className="shrink-0 gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader
        className={
          compact
            ? 'flex-row items-center gap-2 space-y-0 px-3 py-2'
            : 'flex-row items-start gap-3 space-y-0 px-4 py-3'
        }
      >
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm">{title}</CardTitle>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t('social.agent_queue_count', { count: posts.length })}
          </p>
        </div>
      </CardHeader>
      <CardContent className={compact ? 'flex flex-col gap-0.5 px-1 pb-2' : 'flex flex-col gap-0.5 px-2 pb-2'}>
        {slice.map((post) => (
          <SocialPostRow
            key={post.id}
            post={post}
            active={selectedId === post.id}
            onOpen={() => onOpen(post)}
            compact={compact}
          />
        ))}
        {remaining > 0 ? (
          <div className="px-2 py-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="w-full"
              onClick={() => setVisible((v) => v + LOAD_MORE)}
            >
              {t('social.agent_show_more', {
                count: Math.min(remaining, LOAD_MORE),
                total: remaining,
              })}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SocialCampaignSection({
  campaigns,
  selectedCampaign,
  onOpenCampaign,
  onComposeCampaign,
  compact,
}: {
  campaigns: SocialCampaignGroup[];
  selectedCampaign?: string | null;
  onOpenCampaign: (name: string) => void;
  onComposeCampaign: (name: string) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (campaigns.length === 0) return null;

  return (
    <Card className="shrink-0 gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className={compact ? 'px-3 py-2' : 'px-4 py-3'}>
        <CardTitle className="text-sm">{t('social.agent_queue_campaigns')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t('social.agent_queue_count', { count: campaigns.length })}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-2 pb-3">
        {campaigns.map((c) => {
          const active = selectedCampaign === c.name;
          return (
            <div
              key={c.name}
              className={
                active
                  ? 'flex items-center gap-2 rounded-md bg-accent px-2 py-1.5'
                  : 'flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent'
              }
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpenCampaign(c.name)}
              >
                <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {t('social.agent_campaign_counts', {
                    draft: c.draft,
                    scheduled: c.scheduled,
                    published: c.published,
                  })}
                </span>
              </button>
              <Button type="button" size="xs" variant="outline" onClick={() => onComposeCampaign(c.name)}>
                {t('social.agent_campaign_add_post')}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
