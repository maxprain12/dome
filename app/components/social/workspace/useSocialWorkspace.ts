import { useCallback, useEffect, useState } from 'react';
import type {
  SocialAccount,
  SocialCampaign,
  SocialGrowthAccount,
  SocialPost,
} from '@/components/social/socialTypes';
import type { SocialReplyDraft } from '@/lib/social/socialQueues';

interface WorkspacePayload {
  posts?: SocialPost[];
  accounts?: SocialAccount[];
  campaigns?: SocialCampaign[];
  growth?: SocialGrowthAccount[];
  replyDrafts?: SocialReplyDraft[];
  lastSyncAt?: number | null;
  metricsStale?: boolean;
}

type WorkspaceSlice = 'posts' | 'accounts' | 'campaigns' | 'growth' | 'drafts';

export function useSocialWorkspace() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [campaigns, setCampaigns] = useState<SocialCampaign[]>([]);
  const [growth, setGrowth] = useState<SocialGrowthAccount[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<SocialReplyDraft[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyWorkspace = useCallback((data: WorkspacePayload) => {
    setPosts(data.posts ?? []);
    setAccounts(data.accounts ?? []);
    setCampaigns(data.campaigns ?? []);
    setGrowth(data.growth ?? []);
    setReplyDrafts(data.replyDrafts ?? []);
    setLastSyncAt(data.lastSyncAt ?? null);
  }, []);

  const load = useCallback(async (): Promise<WorkspacePayload | null> => {
    const response = await window.electron.invoke('social:workspace');
    if (response?.success && response.data) {
      const data = response.data as WorkspacePayload;
      applyWorkspace(data);
      setLoading(false);
      return data;
    }

    const [postsResult, accountsResult, growthResult, draftsResult, campaignsResult] =
      await Promise.all([
        window.electron.invoke('social:posts:list', { limit: 200 }),
        window.electron.invoke('social:accounts:list'),
        window.electron.invoke('social:growth', { days: 90 }),
        window.electron.invoke('social:drafts:list'),
        window.electron.invoke('social:campaigns:list'),
      ]);
    if (postsResult?.success) setPosts(postsResult.data ?? []);
    if (accountsResult?.success) setAccounts(accountsResult.data ?? []);
    if (growthResult?.success) setGrowth(growthResult.data?.accounts ?? []);
    if (draftsResult?.success) setReplyDrafts(draftsResult.data?.drafts ?? []);
    if (campaignsResult?.success) setCampaigns(campaignsResult.data ?? []);
    setLoading(false);
    return null;
  }, [applyWorkspace]);

  const loadSlice = useCallback(async (slice: WorkspaceSlice) => {
    if (slice === 'posts') {
      const response = await window.electron.invoke('social:posts:list', { limit: 200 });
      if (response?.success) setPosts(response.data ?? []);
      return;
    }
    if (slice === 'accounts') {
      const response = await window.electron.invoke('social:accounts:list');
      if (response?.success) setAccounts(response.data ?? []);
      return;
    }
    if (slice === 'campaigns') {
      const response = await window.electron.invoke('social:campaigns:list');
      if (response?.success) setCampaigns(response.data ?? []);
      return;
    }
    if (slice === 'growth') {
      const response = await window.electron.invoke('social:growth', { days: 90 });
      if (response?.success) setGrowth(response.data?.accounts ?? []);
      return;
    }
    const response = await window.electron.invoke('social:drafts:list');
    if (response?.success) setReplyDrafts(response.data?.drafts ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await load();
        if (!active || !data?.metricsStale) return;
        setRefreshing(true);
        await window.electron.invoke('social:metrics:refresh').catch(() => null);
        if (active) await loadSlice('growth');
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Error');
      } finally {
        if (active) setRefreshing(false);
      }
    })();

    const unsubscribers = [
      window.electron?.on?.('social:post-updated', (payload?: { post?: SocialPost }) => {
        if (payload?.post) {
          setPosts((prev) => {
            const next = prev.filter((post) => post.id !== payload.post?.id);
            return [payload.post as SocialPost, ...next];
          });
          return;
        }
        void loadSlice('posts').catch(() => undefined);
      }),
      window.electron?.on?.('social:posts-refresh', () => {
        void loadSlice('posts').catch(() => undefined);
      }),
      window.electron?.on?.('social:account-updated', () => {
        void loadSlice('accounts').catch(() => undefined);
      }),
      window.electron?.on?.('social:metrics-updated', () => {
        void Promise.all([loadSlice('posts'), loadSlice('growth')]).catch(() => undefined);
      }),
      window.electron?.on?.('social:drafts-updated', () => {
        void loadSlice('drafts').catch(() => undefined);
      }),
    ];
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [load, loadSlice]);

  const run = useCallback(
    async (channel: string, payload?: unknown, slices: WorkspaceSlice[] = []) => {
      setRefreshing(true);
      setError(null);
      try {
        const response = await window.electron.invoke(channel, payload);
        if (!response?.success) setError(response?.error || 'Error');
        if (slices.length === 0) {
          await load();
        } else {
          await Promise.all(slices.map((slice) => loadSlice(slice)));
        }
        return response;
      } finally {
        setRefreshing(false);
      }
    },
    [load, loadSlice],
  );

  return {
    posts,
    accounts,
    campaigns,
    growth,
    replyDrafts,
    lastSyncAt,
    loading,
    refreshing,
    error,
    setError,
    load,
    refreshMetrics: () => run('social:metrics:refresh', undefined, ['posts', 'growth']),
    syncFeed: (accountId: string | null) =>
      run('social:posts:sync', { accountId, limit: 25 }, ['posts', 'accounts']),
    publishPost: (postId: string) => run('social:posts:publish', { postId }, ['posts']),
    pollComments: () => run('social:drafts:poll-now', undefined, ['drafts']),
  };
}
