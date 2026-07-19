import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HugeiconsIcon } from '@hugeicons/react';
import { SparklesIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import type {
  SocialAccount,
  SocialCampaign,
  SocialGrowthAccount,
  SocialPost,
} from '@/components/social/socialTypes';
import {
  buildSocialQueues,
  computeSocialStats,
  filterPostsByAccount,
  filterPostsByQuery,
  type SocialFilter,
  type SocialReplyDraft,
} from '@/lib/social/socialQueues';
import { SocialStats } from './SocialStats';
import { SocialCampaignSection, SocialQueueSection } from './SocialQueueSection';

function accountLabel(acc: SocialAccount): string {
  const handle = (acc.handle || '').trim();
  const name = (acc.displayName || '').trim();
  if (handle && name && handle.toLowerCase() !== name.toLowerCase()) {
    return `${name} (${handle})`;
  }
  return handle || name || acc.provider;
}

export function SocialDashboard({
  posts,
  campaigns,
  replyDrafts,
  growth,
  accounts,
  query,
  filter,
  onFilter,
  focusAccountId,
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
  focusAccountId: string | null;
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

  const scopedPosts = useMemo(
    () => filterPostsByAccount(posts, focusAccountId),
    [posts, focusAccountId],
  );
  const filtered = filterPostsByQuery(scopedPosts, query);
  const queues = buildSocialQueues(filtered, replyDrafts);
  const activeAccounts = accounts.filter((a) => a.status === 'active').length;
  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const scopedGrowth = focusAccountId
    ? growth.filter((g) => g.accountId === focusAccountId)
    : growth;
  const stats = computeSocialStats(filtered, replyDrafts, activeAccounts, scopedGrowth);

  const campaignPosts =
    selectedCampaignId != null
      ? filtered.filter((p) => p.campaignId === selectedCampaignId)
      : [];

  const focusAccount = focusAccountId
    ? accounts.find((a) => a.id === focusAccountId) ?? null
    : null;

  const briefingHint =
    activeAccounts === 0
      ? t('social.agent_brief_no_accounts')
      : focusAccount
        ? t('social.agent_brief_focus', { name: accountLabel(focusAccount) })
        : posts.length === 0
          ? t('social.agent_brief_no_posts')
          : stats.attention > 0
            ? t('social.agent_brief_attention', { count: stats.attention })
            : t('social.agent_brief_ok');

  const attentionCount = queues.needsAttention.length + queues.pendingReplyDrafts.length;
  const showAttentionBlock =
    filter === 'attention' || (filter === 'all' && attentionCount > 0);
  const showScheduledBlock =
    filter === 'scheduled' || (filter === 'all' && queues.scheduledSoon.length > 0);
  const showDraftsBlock =
    filter === 'drafts' || (filter === 'all' && queues.drafts.length > 0);
  const showCampaignsBlock =
    filter === 'campaigns' || (filter === 'all' && activeCampaigns.length > 0);
  const showRecentBlock =
    filter === 'recent' || (filter === 'all' && queues.recentPublished.length > 0);

  const allEmptyOnAll =
    filter === 'all' &&
    attentionCount === 0 &&
    queues.scheduledSoon.length === 0 &&
    queues.drafts.length === 0 &&
    activeCampaigns.length === 0 &&
    queues.recentPublished.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={compact ? 'shrink-0 flex flex-col gap-y-2 p-2 pb-0' : 'shrink-0 flex flex-col gap-y-3 p-4 pb-0'}>
        {accounts.length === 0 ? (
          <Button type="button" size="xs" variant="outline" className="w-fit" onClick={onConnectAccounts}>
            {t('social.hub.manage_accounts')}
          </Button>
        ) : null}

        {!compact ? <p className="text-sm text-muted-foreground">{briefingHint}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <SocialStats
            drafts={stats.drafts}
            scheduled={stats.scheduled}
            attention={stats.attention}
            campaigns={activeCampaigns.length}
            recent={queues.recentPublished.length}
            activeFilter={filter === 'analytics' ? 'all' : filter}
            onFilter={onFilter}
          />
          {!compact ? (
            <div className="flex flex-wrap items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button type="button" size="xs" variant="secondary" />}
                >
                  <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
                  {t('social.agent_ask_many')}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={onAskManyGrowth}>
                    {t('social.agent_action_growth')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onAskManyCampaign}>
                    {t('social.agent_action_campaign')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onAskManyDraft}>
                    {t('social.agent_action_draft')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" size="xs" variant="ghost" onClick={onPollComments}>
                {t('social.hub.poll_comments')}
              </Button>
            </div>
          ) : null}
        </div>

        {query.trim() ? (
          <p className="px-1 text-xs text-muted-foreground">
            {t('social.agent_search_results', { count: filtered.length })}
          </p>
        ) : null}
      </div>

      <div
        className={
          compact
            ? 'isolate flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2'
            : 'isolate flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain overflow-x-hidden p-4'
        }
      >
        {allEmptyOnAll ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('social.agent_all_clear')}{' '}
            <Button type="button" variant="link" size="xs" className="h-auto px-0" onClick={onCompose}>
              {t('social.hub.new_post')}
            </Button>
          </p>
        ) : null}

        {showAttentionBlock ? (
          <SocialQueueSection
            queueId="needs_attention"
            title={t('social.agent_queue_attention')}
            posts={queues.needsAttention}
            selectedId={selectedId}
            onOpen={onOpenPost}
            emptyText={
              queues.pendingReplyDrafts.length > 0
                ? t('social.agent_monitor_pending', { count: queues.pendingReplyDrafts.length })
                : t('social.agent_queue_attention_empty')
            }
            emptyActionLabel={t('social.hub.poll_comments')}
            onEmptyAction={onPollComments}
            footerHint={
              queues.pendingReplyDrafts.length > 0
                ? t('social.agent_monitor_pending', { count: queues.pendingReplyDrafts.length })
                : undefined
            }
            onFooterAction={onPollComments}
            footerActionLabel={t('social.hub.poll_comments')}
            compact={compact}
            forceShow
          />
        ) : null}

        {showScheduledBlock ? (
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
            forceShow={filter === 'scheduled'}
          />
        ) : null}

        {showDraftsBlock ? (
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
            forceShow={filter === 'drafts'}
          />
        ) : null}

        {showCampaignsBlock ? (
          <SocialCampaignSection
            campaigns={activeCampaigns}
            selectedCampaignId={selectedCampaignId}
            onOpenCampaign={onOpenCampaign}
            onComposeCampaign={onComposeCampaign}
            onCreateCampaign={onCreateCampaign}
            compact={compact}
            forceShow={filter === 'campaigns'}
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
            forceShow
          />
        ) : null}

        {showRecentBlock ? (
          <SocialQueueSection
            queueId="recent_published"
            title={t('social.agent_queue_recent')}
            posts={queues.recentPublished}
            selectedId={selectedId}
            onOpen={onOpenPost}
            emptyText={t('social.agent_queue_recent_empty')}
            compact={compact}
            forceShow={filter === 'recent'}
          />
        ) : null}

      </div>
    </div>
  );
}
