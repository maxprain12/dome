import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type {
  SocialAccount,
  SocialCampaign,
  SocialGrowthAccount,
  SocialPost,
} from '@/components/social/socialTypes';
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
import { cn } from '@/lib/utils';

export function SocialDashboard({
  posts,
  campaigns,
  replyDrafts,
  growth,
  accounts,
  query,
  filter,
  onFilter,
  selectedId,
  selectedCampaignId,
  onOpenPost,
  onOpenCampaign,
  onCompose,
  onComposeCampaign,
  onCreateCampaign,
  onAskManyGrowth,
  onAskManyCampaign,
  onAskManyDraft,
  onPollComments,
  onConnectAccounts,
  compact,
}: {
  posts: SocialPost[];
  campaigns: SocialCampaign[];
  replyDrafts: SocialReplyDraft[];
  growth: SocialGrowthAccount[];
  accounts: SocialAccount[];
  query: string;
  filter: SocialFilter;
  onFilter: (f: SocialFilter) => void;
  selectedId?: string | null;
  selectedCampaignId?: string | null;
  onOpenPost: (post: SocialPost) => void;
  onOpenCampaign: (campaign: SocialCampaign) => void;
  onCompose: () => void;
  onComposeCampaign: (campaign: SocialCampaign) => void;
  onCreateCampaign: () => void;
  onAskManyGrowth: () => void;
  onAskManyCampaign: () => void;
  onAskManyDraft: () => void;
  onPollComments: () => void;
  onConnectAccounts: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const filtered = filterPostsByQuery(posts, query);
  const queues = buildSocialQueues(filtered, replyDrafts);
  const activeAccounts = accounts.filter((a) => a.status === 'active').length;
  const stats = computeSocialStats(posts, replyDrafts, activeAccounts, growth);

  const showAttention = filter === 'all' || filter === 'attention';
  const showScheduled = filter === 'all' || filter === 'scheduled';
  const showDrafts = filter === 'all' || filter === 'drafts';
  const showCampaigns = filter === 'all' || filter === 'campaigns';
  const showRecent = filter === 'all';

  const campaignPosts =
    selectedCampaignId != null
      ? filtered.filter((p) => p.campaignId === selectedCampaignId)
      : [];

  const briefingHint =
    activeAccounts === 0
      ? t('social.agent_brief_no_accounts')
      : posts.length === 0
        ? t('social.agent_brief_no_posts')
        : stats.attention > 0
          ? t('social.agent_brief_attention', { count: stats.attention })
          : t('social.agent_brief_ok');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={compact ? 'shrink-0 space-y-2 p-2 pb-0' : 'shrink-0 space-y-4 p-4 pb-0'}>
        {!compact ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {accounts.length === 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={onConnectAccounts}>
                  {t('social.hub.manage_accounts')}
                </Button>
              ) : (
                accounts.map((acc) => (
                  <span
                    key={acc.id}
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs',
                      acc.status === 'active'
                        ? 'border-border bg-card text-foreground'
                        : 'border-destructive/40 text-destructive',
                    )}
                  >
                    {acc.displayName || acc.handle || acc.provider}
                    {acc.status !== 'active' ? ` · ${acc.status}` : ''}
                  </span>
                ))
              )}
            </div>

            <SocialStats
              drafts={stats.drafts}
              scheduled={stats.scheduled}
              attention={stats.attention}
              campaigns={campaigns.filter((c) => c.status === 'active').length}
              activeFilter={filter}
              onFilter={onFilter}
            />

            <p className="text-sm text-muted-foreground">{briefingHint}</p>

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
              <Button type="button" size="sm" variant="ghost" onClick={onPollComments}>
                {t('social.hub.poll_comments')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAnalyticsOpen((v) => !v)}
              >
                {analyticsOpen
                  ? t('social.agent_analytics_hide')
                  : t('social.agent_action_analytics')}
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
        {showAttention ? (
          <>
            <div className="shrink-0 rounded-lg border bg-card px-3 py-2 shadow-none">
              <p className="text-sm font-medium text-foreground">
                {t('social.agent_queue_monitor')}
              </p>
              <p className="text-xs text-muted-foreground">
                {queues.pendingReplyDrafts.length > 0
                  ? t('social.agent_monitor_pending', { count: queues.pendingReplyDrafts.length })
                  : t('social.agent_queue_attention_empty')}
              </p>
              <Button type="button" size="xs" variant="outline" className="mt-2" onClick={onPollComments}>
                {t('social.hub.poll_comments')}
              </Button>
            </div>
            <SocialQueueSection
              queueId="needs_attention"
              title={t('social.agent_queue_attention')}
              posts={queues.needsAttention}
              selectedId={selectedId}
              onOpen={onOpenPost}
              emptyText={t('social.agent_queue_attention_empty')}
              compact={compact}
            />
          </>
        ) : null}

        {showScheduled ? (
          <SocialQueueSection
            queueId="scheduled_soon"
            title={t('social.agent_queue_scheduled')}
            posts={queues.scheduledSoon}
            selectedId={selectedId}
            onOpen={onOpenPost}
            emptyText={t('social.hub.upcoming_empty')}
            emptyActionLabel={t('social.hub.new_post')}
            onEmptyAction={onCompose}
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
            emptyText={t('social.agent_queue_drafts_empty')}
            emptyActionLabel={t('social.hub.new_post')}
            onEmptyAction={onCompose}
            compact={compact}
          />
        ) : null}

        {showCampaigns ? (
          <SocialCampaignSection
            campaigns={campaigns.filter((c) => c.status === 'active')}
            selectedCampaignId={selectedCampaignId}
            onOpenCampaign={onOpenCampaign}
            onComposeCampaign={onComposeCampaign}
            onCreateCampaign={onCreateCampaign}
            compact={compact}
          />
        ) : null}

        {selectedCampaignId && campaignPosts.length > 0 ? (
          <SocialQueueSection
            queueId="campaigns"
            title={t('social.agent_queue_campaign_posts', {
              name: campaigns.find((c) => c.id === selectedCampaignId)?.name || '',
            })}
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
            emptyText={t('social.agent_queue_recent_empty')}
            compact={compact}
          />
        ) : null}

        {(analyticsOpen || filter === 'analytics') && !compact ? (
          <div className="flex flex-col gap-4 border-t pt-4">
            <h3 className="text-sm font-medium text-foreground">
              {t('social.agent_action_analytics')}
            </h3>
            <SocialGrowthCards accounts={growth} />
            <SocialReportsSection />
          </div>
        ) : null}
      </div>
    </div>
  );
}
