/** Pure heuristics for the agentic social dashboard (plan 024). */

import type { SocialGrowthAccount, SocialPost } from '@/components/social/socialTypes';

export type SocialQueueId =
  | 'needs_attention'
  | 'scheduled_soon'
  | 'drafts'
  | 'campaigns'
  | 'recent_published';

export type SocialFilter =
  | 'all'
  | 'drafts'
  | 'scheduled'
  | 'attention'
  | 'campaigns'
  | 'recent'
  | 'analytics';

export interface SocialReplyDraft {
  id: string;
  status: string;
  hashtag: string | null;
  commentText: string | null;
  commentAuthor: string | null;
  replyBody: string;
  createdAt: number;
}

export interface SocialCampaignGroup {
  name: string;
  posts: SocialPost[];
  draft: number;
  scheduled: number;
  published: number;
  failed: number;
}

export interface SocialQueues {
  needsAttention: SocialPost[];
  scheduledSoon: SocialPost[];
  drafts: SocialPost[];
  recentPublished: SocialPost[];
  campaigns: SocialCampaignGroup[];
  pendingReplyDrafts: SocialReplyDraft[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_PUB_MS = 14 * 24 * 60 * 60 * 1000;

export function postSnippet(post: SocialPost, max = 80): string {
  const text = (post.body || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function filterPostsByQuery(posts: SocialPost[], query: string): SocialPost[] {
  const q = query.trim().toLowerCase();
  if (!q) return posts;
  return posts.filter((p) => {
    const hay = [
      p.body,
      p.campaign,
      p.provider,
      p.status,
      ...(p.topics || []),
      p.linkUrl,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Global presence = null; otherwise posts for one connected account. */
export function filterPostsByAccount(
  posts: SocialPost[],
  accountId: string | null | undefined,
): SocialPost[] {
  if (!accountId) return posts;
  return posts.filter((p) => p.accountId === accountId);
}

export function buildCampaignGroups(posts: SocialPost[]): SocialCampaignGroup[] {
  const map = new Map<string, SocialPost[]>();
  for (const p of posts) {
    const name = (p.campaign || '').trim();
    if (!name) continue;
    const list = map.get(name) ?? [];
    list.push(p);
    map.set(name, list);
  }
  return [...map.entries()]
    .map(([name, groupPosts]) => ({
      name,
      posts: groupPosts,
      draft: groupPosts.filter((p) => p.status === 'draft').length,
      scheduled: groupPosts.filter((p) => p.status === 'scheduled' || p.status === 'publishing').length,
      published: groupPosts.filter((p) => p.status === 'published').length,
      failed: groupPosts.filter((p) => p.status === 'failed').length,
    }))
    .sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));
}

export function buildSocialQueues(
  posts: SocialPost[],
  replyDrafts: SocialReplyDraft[] = [],
  nowMs = Date.now(),
): SocialQueues {
  const needsAttention = posts
    .filter((p) => p.status === 'failed')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const scheduledSoon = posts
    .filter(
      (p) =>
        p.status === 'scheduled' &&
        p.scheduledAt != null &&
        p.scheduledAt >= nowMs &&
        p.scheduledAt <= nowMs + WEEK_MS,
    )
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));

  const drafts = posts
    .filter((p) => p.status === 'draft')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const recentPublished = posts
    .filter(
      (p) =>
        p.status === 'published' &&
        p.publishedAt != null &&
        nowMs - p.publishedAt <= RECENT_PUB_MS,
    )
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

  const pendingReplyDrafts = replyDrafts
    .filter((d) => {
      const s = String(d.status || '');
      return s === 'pending' || s === 'draft' || s === 'draft_only' || s === '';
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return {
    needsAttention,
    scheduledSoon,
    drafts,
    recentPublished,
    campaigns: buildCampaignGroups(posts),
    pendingReplyDrafts,
  };
}

export interface SocialAgentStats {
  drafts: number;
  scheduled: number;
  attention: number;
  campaigns: number;
  activeAccounts: number;
  followersDelta: number | null;
}

export function computeSocialStats(
  posts: SocialPost[],
  replyDrafts: SocialReplyDraft[],
  accountsActive: number,
  growth: SocialGrowthAccount[] = [],
  nowMs = Date.now(),
): SocialAgentStats {
  const q = buildSocialQueues(posts, replyDrafts, nowMs);
  let followersDelta: number | null = null;
  for (const g of growth) {
    if (typeof g.delta === 'number') {
      followersDelta = (followersDelta ?? 0) + g.delta;
    }
  }
  return {
    drafts: q.drafts.length,
    scheduled: posts.filter((p) => p.status === 'scheduled' || p.status === 'publishing').length,
    attention: q.needsAttention.length + q.pendingReplyDrafts.length,
    campaigns: q.campaigns.length,
    activeAccounts: accountsActive,
    followersDelta,
  };
}

export function formatSocialWhen(ts: number | null | undefined, locale = 'es'): string {
  if (ts == null || !Number.isFinite(ts)) return '';
  const date = new Date(ts);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
