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

  const load = useCallback(async (): Promise<WorkspacePayload | null> => {
    const response = await window.electron.invoke('social:workspace');
    if (response?.success && response.data) {
      const data = response.data as WorkspacePayload;
      setPosts(data.posts ?? []);
      setAccounts(data.accounts ?? []);
      setCampaigns(data.campaigns ?? []);
      setGrowth(data.growth ?? []);
      setReplyDrafts(data.replyDrafts ?? []);
      setLastSyncAt(data.lastSyncAt ?? null);
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
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await load();
        if (!active || !data?.metricsStale) return;
        setRefreshing(true);
        await window.electron.invoke('social:metrics:refresh').catch(() => null);
        if (active) await load();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Error');
      } finally {
        if (active) setRefreshing(false);
      }
    })();

    const reload = () => {
      void load().catch(() => undefined);
    };
    const unsubscribers = [
      window.electron?.on?.('social:post-updated', reload),
      window.electron?.on?.('social:posts-refresh', reload),
      window.electron?.on?.('social:account-updated', reload),
      window.electron?.on?.('social:metrics-updated', reload),
      window.electron?.on?.('social:drafts-updated', reload),
    ];
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [load]);

  const run = useCallback(
    async (channel: string, payload?: unknown) => {
      setRefreshing(true);
      setError(null);
      try {
        const response = await window.electron.invoke(channel, payload);
        if (!response?.success) setError(response?.error || 'Error');
        await load();
        return response;
      } finally {
        setRefreshing(false);
      }
    },
    [load],
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
    refreshMetrics: () => run('social:metrics:refresh'),
    syncFeed: (accountId: string | null) =>
      run('social:posts:sync', { accountId, limit: 25 }),
    publishPost: (postId: string) => run('social:posts:publish', { postId }),
    pollComments: () => run('social:drafts:poll-now'),
  };
}
