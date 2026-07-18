import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import type { SocialCampaign, SocialPost } from '@/components/social/socialTypes';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import type { SocialQueueId } from '@/lib/social/socialQueues';
import { SocialPostRow } from './SocialPostRow';

const INITIAL_VISIBLE = 30;
const LOAD_MORE = 30;

export function SocialQueueSection({
  queueId,
  title,
  posts,
  selectedId,
  onOpen,
  emptyText,
  emptyActionLabel,
  onEmptyAction,
  footerHint,
  footerActionLabel,
  onFooterAction,
  compact,
  forceShow,
}: {
  queueId: SocialQueueId;
  title: string;
  posts: SocialPost[];
  selectedId?: string | null;
  onOpen: (post: SocialPost) => void;
  emptyText?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  footerHint?: string;
  footerActionLabel?: string;
  onFooterAction?: () => void;
  compact?: boolean;
  /** When false/undefined and empty, hide the section (inbox density). */
  forceShow?: boolean;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisible(INITIAL_VISIBLE);
  }, [posts.length, queueId, title]);

  if (posts.length === 0 && !forceShow) return null;

  const slice = posts.slice(0, visible);
  const remaining = posts.length - slice.length;

  return (
    <Card className="shrink-0 gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader
        className={
          compact
            ? 'flex-row items-center gap-2 gap-y-0 px-3 py-2'
            : 'flex-row items-start gap-3 gap-y-0 px-3 py-2.5'
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
        {posts.length === 0 ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-2">
            <p className="text-xs text-muted-foreground">{emptyText || t('social.agent_queue_empty')}</p>
            {emptyActionLabel && onEmptyAction ? (
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto px-0"
                onClick={onEmptyAction}
              >
                {emptyActionLabel}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {footerHint ? (
              <div className="flex flex-wrap items-center gap-2 px-2 pb-1">
                <p className="text-xs text-muted-foreground">{footerHint}</p>
                {footerActionLabel && onFooterAction ? (
                  <Button type="button" size="xs" variant="ghost" onClick={onFooterAction}>
                    {footerActionLabel}
                  </Button>
                ) : null}
              </div>
            ) : null}
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
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SocialCampaignSection({
  campaigns,
  selectedCampaignId,
  onOpenCampaign,
  onComposeCampaign,
  onCreateCampaign,
  compact,
  forceShow,
}: {
  campaigns: SocialCampaign[];
  selectedCampaignId?: string | null;
  onOpenCampaign: (campaign: SocialCampaign) => void;
  onComposeCampaign: (campaign: SocialCampaign) => void;
  onCreateCampaign: () => void;
  compact?: boolean;
  forceShow?: boolean;
}) {
  const { t } = useTranslation();

  if (campaigns.length === 0 && !forceShow) return null;

  return (
    <Card className="shrink-0 gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className={compact ? 'px-3 py-2' : 'px-3 py-2.5'}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">{t('social.agent_queue_campaigns')}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('social.agent_queue_count', { count: campaigns.length })}
            </p>
          </div>
          <Button type="button" size="xs" variant="ghost" onClick={onCreateCampaign}>
            {t('social.agent_campaign_new')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 px-2 pb-3">
        {campaigns.length === 0 ? (
          <div className="flex flex-wrap items-baseline gap-x-2 px-2 py-2">
            <p className="text-xs text-muted-foreground">{t('social.agent_campaigns_empty')}</p>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto px-0"
              onClick={onCreateCampaign}
            >
              {t('social.agent_campaign_new')}
            </Button>
          </div>
        ) : (
          campaigns.map((c) => {
            const active = selectedCampaignId === c.id;
            return (
              <div
                key={c.id}
                data-active={active ? 'true' : undefined}
                className={selectionSurfaceClass(
                  active,
                  'flex items-center gap-2 px-2 py-1.5',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpenCampaign(c)}
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
                <Button type="button" size="xs" variant="ghost" onClick={() => onComposeCampaign(c)}>
                  {t('social.agent_campaign_add_post')}
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
