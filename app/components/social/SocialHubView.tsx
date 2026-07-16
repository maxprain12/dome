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
import type { SocialAccount, SocialGrowthAccount, SocialPost } from '@/components/social/socialTypes';
import { SocialDashboard } from '@/components/social/SocialDashboard';
import SocialComposePanel from '@/components/social/SocialComposePanel';
import { SocialDetailPanel } from '@/components/social/SocialDetailPanel';
import type { SocialFilter, SocialReplyDraft } from '@/lib/social/socialQueues';

type DetailMode =
  | { kind: 'none' }
  | { kind: 'compose'; editingPost: SocialPost | null; campaign?: string | null }
  | { kind: 'post'; post: SocialPost };

export default function SocialHubView() {
  const { t } = useTranslation();
  const { openSettingsTab } = useTabStore();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [growth, setGrowth] = useState<SocialGrowthAccount[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<SocialReplyDraft[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SocialFilter>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailMode>({ kind: 'none' });

  const load = useCallback(async () => {
    const [postsRes, accountsRes, growthRes, draftsRes] = await Promise.all([
      window.electron.invoke('social:posts:list', { limit: 200 }),
      window.electron.invoke('social:accounts:list'),
      window.electron.invoke('social:growth', { days: 90 }),
      window.electron.invoke('social:drafts:list'),
    ]);
    if (postsRes?.success) setPosts(postsRes.data);
    if (accountsRes?.success) setAccounts(accountsRes.data);
    if (growthRes?.success) setGrowth(growthRes.data.accounts);
    if (draftsRes?.success) setReplyDrafts(draftsRes.data?.drafts ?? []);
  }, []);

  useEffect(() => {
    void load();
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

  const lastSyncAt = useMemo(() => {
    let max: number | null = null;
    for (const a of accounts) {
      if (a.lastSyncAt != null && (max == null || a.lastSyncAt > max)) max = a.lastSyncAt;
    }
    return max;
  }, [accounts]);

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

  const activeAccounts = accounts.filter((a) => a.status === 'active').length;
  const detailOpen = detail.kind !== 'none';
  const selectedPostId = detail.kind === 'post' ? detail.post.id : detail.kind === 'compose' ? detail.editingPost?.id : null;

  const askMany = useCallback(
    (post: SocialPost | null, prompt: string, campaign?: string | null) => {
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
            status: post.status,
          },
        });
      } else if (campaign) {
        many.addPinnedResource({
          id: `campaign:${campaign}`,
          title: campaign,
          type: 'social_campaign',
          kind: 'social_post',
          meta: { campaign },
        });
      }
      many.setPendingOneShotSkill('dome-social-growth');
      many.setPendingManyHandoff(prompt);
      many.setOpen(true);
    },
    [t],
  );

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
        <div
          className={
            detailOpen
              ? 'hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden @[56rem]/social:flex'
              : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
          }
        >
          <SocialDashboard
            posts={posts}
            replyDrafts={replyDrafts}
            growth={growth}
            activeAccounts={activeAccounts}
            query={query}
            filter={filter}
            onFilter={(f) => {
              setFilter(f);
              if (f !== 'campaigns') setSelectedCampaign(null);
            }}
            selectedId={selectedPostId}
            selectedCampaign={selectedCampaign}
            onOpenPost={(post) => setDetail({ kind: 'post', post })}
            onOpenCampaign={(name) => {
              setSelectedCampaign(name);
              setFilter('campaigns');
            }}
            onCompose={() => setDetail({ kind: 'compose', editingPost: null })}
            onComposeCampaign={(name) =>
              setDetail({ kind: 'compose', editingPost: null, campaign: name })
            }
            onAskManyGrowth={() => askMany(null, t('social.agent_prompt_growth'))}
            onAskManyCampaign={() => askMany(null, t('social.agent_prompt_campaign'))}
            onAskManyDraft={() => askMany(null, t('social.agent_prompt_draft'))}
            compact={detailOpen}
          />
        </div>

        {detailOpen ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col border-l bg-background @[56rem]/social:w-[28rem] @[56rem]/social:max-w-[36rem] @[56rem]/social:shrink-0 @[56rem]/social:grow-0">
            {detail.kind === 'compose' ? (
              <SocialComposePanel
                accounts={accounts}
                editingPost={detail.editingPost}
                initialCampaign={detail.campaign}
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
                  setDetail({ kind: 'compose', editingPost: detail.post, campaign: detail.post.campaign })
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
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
