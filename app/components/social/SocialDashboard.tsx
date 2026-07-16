import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { SocialGrowthAccount, SocialPost } from '@/components/social/socialTypes';
import SocialGrowthCards from '@/components/social/SocialGrowthCards';
import SocialReportsSection from '@/components/social/SocialReportsSection';
import {
  buildSocialQueues,
  computeSocialStats,
  filterPostsByQuery,
  type SocialFilter,
  type SocialReplyDraft,
} from '@/lib/social/socialQueues';
import { SocialStats } from './SocialStats';
import { SocialCampaignSection, SocialQueueSection } from './SocialQueueSection';

export function SocialDashboard({
  posts,
  replyDrafts,
  growth,
  activeAccounts,
  query,
  filter,
  onFilter,
  selectedId,
  selectedCampaign,
  onOpenPost,
  onOpenCampaign,
  onCompose,
  onComposeCampaign,
  onAskManyGrowth,
  onAskManyCampaign,
  onAskManyDraft,
  compact,
}: {
  posts: SocialPost[];
  replyDrafts: SocialReplyDraft[];
  growth: SocialGrowthAccount[];
  activeAccounts: number;
  query: string;
  filter: SocialFilter;
  onFilter: (f: SocialFilter) => void;
  selectedId?: string | null;
  selectedCampaign?: string | null;
  onOpenPost: (post: SocialPost) => void;
  onOpenCampaign: (name: string) => void;
  onCompose: () => void;
  onComposeCampaign: (name: string) => void;
  onAskManyGrowth: () => void;
  onAskManyCampaign: () => void;
  onAskManyDraft: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const filtered = filterPostsByQuery(posts, query);
  const queues = buildSocialQueues(filtered, replyDrafts);
  const stats = computeSocialStats(posts, replyDrafts, activeAccounts, growth);

  if (filter === 'analytics') {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 space-y-2 p-4 pb-0">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onFilter('all')}>
              {t('social.agent_filter_all')}
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <SocialGrowthCards accounts={growth} />
          <SocialReportsSection />
        </div>
      </div>
    );
  }

  const showAttention = filter === 'all' || filter === 'attention';
  const showScheduled = filter === 'all' || filter === 'scheduled';
  const showDrafts = filter === 'all' || filter === 'drafts';
  const showCampaigns = filter === 'all' || filter === 'campaigns';
  const showRecent = filter === 'all';

  const campaignPosts =
    selectedCampaign != null
      ? filtered.filter((p) => (p.campaign || '').trim() === selectedCampaign)
      : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={compact ? 'shrink-0 space-y-2 p-2 pb-0' : 'shrink-0 space-y-4 p-4 pb-0'}>
        {!compact ? (
          <>
            <SocialStats
              drafts={stats.drafts}
              scheduled={stats.scheduled}
              attention={stats.attention}
              campaigns={stats.campaigns}
              activeFilter={filter}
              onFilter={onFilter}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={onAskManyGrowth}>
                {t('social.agent_action_growth')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onAskManyCampaign}>
                {t('social.agent_action_campaign')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onAskManyDraft}>
                {t('social.agent_action_draft')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onCompose}>
                {t('social.hub.new_post')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onFilter('analytics')}>
                {t('social.agent_action_analytics')}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            {(
              [
                ['all', t('social.agent_filter_all')],
                ['drafts', t('social.agent_stat_drafts')],
                ['scheduled', t('social.agent_stat_scheduled')],
                ['attention', t('social.agent_stat_attention')],
                ['campaigns', t('social.agent_stat_campaigns')],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="xs"
                variant={filter === key ? 'secondary' : 'ghost'}
                onClick={() => onFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        {query.trim() ? (
          <p className="px-1 text-xs text-muted-foreground">
            {t('social.agent_search_results', { count: filtered.length })}
          </p>
        ) : null}
      </div>

      <div
        className={
          compact
            ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2'
            : 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4'
        }
      >
        {showAttention && queues.pendingReplyDrafts.length > 0 ? (
          <CardLikeHint
            title={t('social.agent_queue_monitor')}
            text={t('social.agent_monitor_pending', { count: queues.pendingReplyDrafts.length })}
          />
        ) : null}

        {showAttention ? (
          <SocialQueueSection
            queueId="needs_attention"
            title={t('social.agent_queue_attention')}
            posts={queues.needsAttention}
            selectedId={selectedId}
            onOpen={onOpenPost}
            compact={compact}
          />
        ) : null}

        {showScheduled ? (
          <SocialQueueSection
            queueId="scheduled_soon"
            title={t('social.agent_queue_scheduled')}
            posts={queues.scheduledSoon}
            selectedId={selectedId}
            onOpen={onOpenPost}
            compact={compact}
          />
        ) : null}

        {showDrafts ? (
          <SocialQueueSection
            queueId="drafts"
            title={t('social.agent_queue_drafts')}
            posts={queues.drafts}
            selectedId={selectedId}
            onOpen={onOpenPost}
            compact={compact}
          />
        ) : null}

        {showCampaigns ? (
          <SocialCampaignSection
            campaigns={queues.campaigns}
            selectedCampaign={selectedCampaign}
            onOpenCampaign={onOpenCampaign}
            onComposeCampaign={onComposeCampaign}
            compact={compact}
          />
        ) : null}

        {selectedCampaign && campaignPosts.length > 0 ? (
          <SocialQueueSection
            queueId="campaigns"
            title={t('social.agent_queue_campaign_posts', { name: selectedCampaign })}
            posts={campaignPosts}
            selectedId={selectedId}
            onOpen={onOpenPost}
            compact={compact}
          />
        ) : null}

        {showRecent ? (
          <SocialQueueSection
            queueId="recent_published"
            title={t('social.agent_queue_recent')}
            posts={queues.recentPublished}
            selectedId={selectedId}
            onOpen={onOpenPost}
            compact={compact}
          />
        ) : null}

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('social.hub.posts_empty')}</p>
        ) : null}
      </div>
    </div>
  );
}

function CardLikeHint({ title, text }: { title: string; text: string }) {
  return (
    <div className="shrink-0 rounded-lg border bg-card px-3 py-2 shadow-none">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
