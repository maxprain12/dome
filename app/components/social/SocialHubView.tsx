import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon, RefreshIcon, Settings01Icon } from '@hugeicons/core-free-icons';
import { useTabStore } from '@/lib/store/useTabStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { HubHeader } from '@/components/hub/HubHeader';
import { HubSearch } from '@/components/hub/HubSearch';
import type {
  SocialAccount,
  SocialCampaign,
  SocialGrowthAccount,
  SocialPost,
} from '@/components/social/socialTypes';
import { SocialDashboard } from '@/components/social/SocialDashboard';
import SocialComposePanel from '@/components/social/SocialComposePanel';
import { SocialDetailPanel } from '@/components/social/SocialDetailPanel';
import { SocialCampaignDetail } from '@/components/social/SocialCampaignDetail';
import type { SocialFilter, SocialReplyDraft } from '@/lib/social/socialQueues';

type DetailMode =
  | { kind: 'none' }
  | { kind: 'compose'; editingPost: SocialPost | null; campaignId?: string | null; campaignName?: string | null }
  | { kind: 'post'; post: SocialPost }
  | { kind: 'campaign'; campaign: SocialCampaign };

export default function SocialHubView() {
  const { t } = useTranslation();
  const { openSettingsTab } = useTabStore();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [campaigns, setCampaigns] = useState<SocialCampaign[]>([]);
  const [growth, setGrowth] = useState<SocialGrowthAccount[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<SocialReplyDraft[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SocialFilter>('all');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailMode>({ kind: 'none' });
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await window.electron.invoke('social:workspace');
    if (res?.success && res.data) {
      const data = res.data as {
        posts?: SocialPost[];
        accounts?: SocialAccount[];
        campaigns?: SocialCampaign[];
        growth?: SocialGrowthAccount[];
        replyDrafts?: SocialReplyDraft[];
        lastSyncAt?: number | null;
        metricsStale?: boolean;
      };
      setPosts(data.posts ?? []);
      setAccounts(data.accounts ?? []);
      setCampaigns(data.campaigns ?? []);
      setGrowth(data.growth ?? []);
      setReplyDrafts(data.replyDrafts ?? []);
      setLastSyncAt(data.lastSyncAt ?? null);
      return data;
    }
    // Fallback if workspace channel missing (older main).
    const [postsRes, accountsRes, growthRes, draftsRes, campsRes] = await Promise.all([
      window.electron.invoke('social:posts:list', { limit: 200 }),
      window.electron.invoke('social:accounts:list'),
      window.electron.invoke('social:growth', { days: 90 }),
      window.electron.invoke('social:drafts:list'),
      window.electron.invoke('social:campaigns:list'),
    ]);
    if (postsRes?.success) setPosts(postsRes.data);
    if (accountsRes?.success) setAccounts(accountsRes.data);
    if (growthRes?.success) setGrowth(growthRes.data.accounts);
    if (draftsRes?.success) setReplyDrafts(draftsRes.data?.drafts ?? []);
    if (campsRes?.success) setCampaigns(campsRes.data ?? []);
    return null;
  }, []);

  useEffect(() => {
    void (async () => {
      const data = await load();
      if (data?.metricsStale) {
        setRefreshing(true);
        await window.electron.invoke('social:metrics:refresh').catch(() => null);
        setRefreshing(false);
        await load();
      }
    })();
    const unsubs = [
      window.electron?.on?.('social:post-updated', () => void load()),
      window.electron?.on?.('social:posts-refresh', () => void load()),
      window.electron?.on?.('social:account-updated', () => void load()),
      window.electron?.on?.('social:metrics-updated', () => void load()),
      window.electron?.on?.('social:drafts-updated', () => void load()),
    ];
    return () => unsubs.forEach((u) => u?.());
  }, [load]);

  const refreshMetrics = async () => {
    setRefreshing(true);
    setError(null);
    const res = await window.electron.invoke('social:metrics:refresh');
    setRefreshing(false);
    if (!res?.success) setError(res?.error || 'Error');
    await load();
  };

  const publishNow = async (postId: string) => {
    setBusyPostId(postId);
    setError(null);
    const res = await window.electron.invoke('social:posts:publish', { postId });
    setBusyPostId(null);
    if (!res?.success) setError(res?.error || 'Error');
    await load();
  };

  const goToSettings = () => {
    openSettingsTab();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'social' }));
    }, 100);
  };

  const syncDescription = error
    ? t('social.hub.sync_error', { error })
    : refreshing
      ? t('social.hub.syncing')
      : lastSyncAt
        ? t('social.hub.last_sync', {
            time: new Date(lastSyncAt).toLocaleString([], {
              hour: '2-digit',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            }),
          })
        : t('social.agent_subtitle');

  const detailOpen = detail.kind !== 'none';
  const selectedPostId =
    detail.kind === 'post'
      ? detail.post.id
      : detail.kind === 'compose'
        ? detail.editingPost?.id
        : null;

  const askMany = useCallback(
    (post: SocialPost | null, prompt: string, campaign?: SocialCampaign | null) => {
      const many = useManyStore.getState();
      if (post) {
        many.addPinnedResource({
          id: post.id,
          title: post.body?.trim()?.slice(0, 80) || t('social.hub.no_text'),
          type: 'social_post',
          kind: 'social_post',
          meta: {
            provider: post.provider,
            campaign: post.campaign,
            campaignId: post.campaignId,
            status: post.status,
          },
        });
      } else if (campaign) {
        many.addPinnedResource({
          id: campaign.id,
          title: campaign.name,
          type: 'social_campaign',
          kind: 'social_post',
          meta: { campaign: campaign.name, campaignId: campaign.id, goal: campaign.goal },
        });
      }
      many.setPendingOneShotSkill('dome-social-growth');
      many.setPendingManyHandoff(prompt);
      many.setOpen(true);
    },
    [t],
  );

  const createCampaignInline = async () => {
    const name = window.prompt(t('social.agent_campaign_prompt_name'));
    if (!name?.trim()) return;
    const goal = window.prompt(t('social.agent_campaign_prompt_goal')) || null;
    const res = await window.electron.invoke('social:campaigns:create', {
      name: name.trim(),
      goal,
    });
    if (res?.success && res.data) {
      await load();
      setSelectedCampaignId(res.data.id);
      setFilter('campaigns');
      setDetail({ kind: 'campaign', campaign: res.data });
    } else if (res?.error) {
      setError(res.error);
    }
  };

  const campaignPosts = useMemo(() => {
    if (detail.kind !== 'campaign') return [];
    return posts.filter((p) => p.campaignId === detail.campaign.id);
  }, [detail, posts]);

  return (
    <div className="@container/social flex h-full min-h-0 flex-col text-foreground">
      <div
        className={
          detailOpen
            ? 'flex shrink-0 flex-col gap-2 border-b bg-card px-3 py-2'
            : 'flex shrink-0 flex-col gap-3 border-b bg-card px-4 py-3'
        }
      >
        <HubHeader
          title={t('social.hub.title')}
          description={detailOpen ? undefined : syncDescription}
          className="w-full"
          actions={
            <>
              {error ? (
                <Badge variant="destructive">{t('social.hub.sync_badge_error')}</Badge>
              ) : refreshing ? (
                <Badge variant="secondary">{t('social.hub.sync_badge_syncing')}</Badge>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void refreshMetrics()}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
                )}
                <span className="@[40rem]/social:inline hidden">{t('social.hub.refresh_metrics')}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={goToSettings}
                title={t('social.hub.manage_accounts')}
              >
                <HugeiconsIcon icon={Settings01Icon} data-icon="inline-start" />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setDetail({ kind: 'compose', editingPost: null })}
              >
                <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
                <span className="@[40rem]/social:inline hidden">{t('social.hub.new_post')}</span>
              </Button>
            </>
          }
        />
        <HubSearch
          className="min-w-0 w-full"
          value={query}
          onChange={setQuery}
          placeholder={t('social.agent_search')}
          aria-label={t('social.agent_search')}
          clearLabel={t('common.cancel')}
        />
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <SocialDashboard
            posts={posts}
            campaigns={campaigns}
            replyDrafts={replyDrafts}
            growth={growth}
            accounts={accounts}
            query={query}
            filter={filter}
            onFilter={(f) => {
              setFilter(f);
              if (f !== 'campaigns') setSelectedCampaignId(null);
            }}
            selectedId={selectedPostId}
            selectedCampaignId={selectedCampaignId}
            onOpenPost={(post) => setDetail({ kind: 'post', post })}
            onOpenCampaign={(campaign) => {
              setSelectedCampaignId(campaign.id);
              setFilter('campaigns');
              setDetail({ kind: 'campaign', campaign });
            }}
            onCompose={() => setDetail({ kind: 'compose', editingPost: null })}
            onComposeCampaign={(campaign) =>
              setDetail({
                kind: 'compose',
                editingPost: null,
                campaignId: campaign.id,
                campaignName: campaign.name,
              })
            }
            onCreateCampaign={() => void createCampaignInline()}
            onAskManyGrowth={() => askMany(null, t('social.agent_prompt_growth'))}
            onAskManyCampaign={() => askMany(null, t('social.agent_prompt_campaign'))}
            onAskManyDraft={() => askMany(null, t('social.agent_prompt_draft'))}
            onPollComments={() => {
              void window.electron.invoke('social:drafts:poll-now').then(() => load());
            }}
            onConnectAccounts={goToSettings}
            compact={detailOpen}
          />
        </div>

        {detailOpen ? (
          <div className="absolute inset-0 z-10 flex h-full min-h-0 w-full flex-col border-l bg-background md:static md:inset-auto md:z-auto md:w-[28rem] md:shrink-0 lg:w-[32rem]">
            {detail.kind === 'compose' ? (
              <SocialComposePanel
                accounts={accounts}
                campaigns={campaigns}
                editingPost={detail.editingPost}
                initialCampaign={detail.campaignName}
                initialCampaignId={detail.campaignId}
                onClose={() => setDetail({ kind: 'none' })}
                onSaved={() => {
                  setDetail({ kind: 'none' });
                  void load();
                }}
              />
            ) : detail.kind === 'post' ? (
              <SocialDetailPanel
                post={detail.post}
                busy={busyPostId === detail.post.id}
                onClose={() => setDetail({ kind: 'none' })}
                onEdit={() =>
                  setDetail({
                    kind: 'compose',
                    editingPost: detail.post,
                    campaignId: detail.post.campaignId,
                    campaignName: detail.post.campaign,
                  })
                }
                onPublish={() => void publishNow(detail.post.id)}
                onAskMany={() =>
                  askMany(
                    detail.post,
                    t('social.agent_prompt_about', {
                      snippet: detail.post.body?.trim()?.slice(0, 120) || t('social.hub.no_text'),
                    }),
                  )
                }
              />
            ) : detail.kind === 'campaign' ? (
              <SocialCampaignDetail
                campaign={detail.campaign}
                posts={campaignPosts}
                onClose={() => setDetail({ kind: 'none' })}
                onCompose={() =>
                  setDetail({
                    kind: 'compose',
                    editingPost: null,
                    campaignId: detail.campaign.id,
                    campaignName: detail.campaign.name,
                  })
                }
                onOpenPost={(post) => setDetail({ kind: 'post', post })}
                onAskMany={() =>
                  askMany(null, t('social.agent_prompt_campaign_about', { name: detail.campaign.name }), detail.campaign)
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
