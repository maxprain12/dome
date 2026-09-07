import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SocialAccount, SocialCampaign, SocialGrowthAccount, SocialPost } from '@/components/social/socialTypes';
import type { SocialReplyDraft } from '@/lib/social/socialQueues';
import { socialAccountLabel } from '@/lib/social/socialQueues';

interface WorkspacePayload {
  posts?: SocialPost[];
  accounts?: SocialAccount[];
  campaigns?: SocialCampaign[];
  growth?: SocialGrowthAccount[];
  replyDrafts?: SocialReplyDraft[];
  lastSyncAt?: number | null;
}

export function useSocialWorkspace() {
  const { t } = useTranslation();
  const [data, setData] = useState<WorkspacePayload>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const running = useRef(false);

  // One authoritative payload keeps posts, metrics and account state consistent.
  const load = useCallback(async () => {
    const version = ++request.current;
    try {
      const response = await window.electron.invoke('social:workspace');
      if (!response?.success || !response.data) throw new Error(response?.error || 'Error');
      if (version === request.current) setData(response.data as WorkspacePayload);
      return response.data as WorkspacePayload;
    } catch (reason) {
      if (version === request.current) setError(reason instanceof Error ? reason.message : 'Error');
      throw reason;
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { load().catch(() => {}); }, 100);
    };
    const events = ['social:post-updated', 'social:posts-refresh', 'social:account-updated', 'social:metrics-updated', 'social:drafts-updated'];
    const unsubscribers = events.map((event) => window.electron?.on?.(event, refresh));
    return () => {
      request.current += 1;
      clearTimeout(timer);
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [load]);

  const run = useCallback(async (channel: string, payload?: unknown) => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    setError(null);
    try {
      const response = await window.electron.invoke(channel, payload);
      if (!response?.success) throw new Error(response?.error || 'Error');
      if (channel === 'social:posts:sync') {
        const results = response.data?.accounts as Array<{ accountId: string; error?: string; skipped?: string }> | undefined;
        const failures = results?.filter((result) => result.error || result.skipped) ?? [];
        if (failures.length) {
          setError(failures.map((result) => {
            const account = data.accounts?.find((item) => item.id === result.accountId);
            return t('social.hub.sync_account_error', {
              account: account ? socialAccountLabel(account) : result.accountId,
              error: result.error || t('social.hub.sync_unsupported'),
            });
          }).join('\n'));
        }
      }
      await load();
      return response;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error');
      return undefined;
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, [data.accounts, load, t]);

  return {
    posts: data.posts ?? [],
    accounts: data.accounts ?? [],
    campaigns: data.campaigns ?? [],
    growth: data.growth ?? [],
    replyDrafts: data.replyDrafts ?? [],
    lastSyncAt: data.lastSyncAt ?? null,
    loading, refreshing, error, setError, load,
    refreshMetrics: () => run('social:metrics:refresh'),
    syncFeed: (accountId: string | null) => run('social:posts:sync', { accountId, limit: 25 }),
    publishPost: (postId: string) => run('social:posts:publish', { postId }),
    pollComments: () => run('social:drafts:poll-now'),
  };
}
