import type { SocialGrowthAccount, SocialPost } from '@/components/social/socialTypes';

export type InsightsPeriodDays = 7 | 30 | 90;

export function periodCutoffMs(periodDays: number, now = Date.now()): number {
  const days = Math.max(1, Math.min(365, Math.floor(periodDays) || 30));
  return now - days * 24 * 60 * 60 * 1000;
}

/** Prefer publish time; fall back to createdAt for drafts/scheduled with metrics. */
export function postTimestampMs(post: Pick<SocialPost, 'publishedAt' | 'createdAt'>): number {
  if (typeof post.publishedAt === 'number' && Number.isFinite(post.publishedAt) && post.publishedAt > 0) {
    return post.publishedAt;
  }
  return typeof post.createdAt === 'number' && Number.isFinite(post.createdAt) ? post.createdAt : 0;
}

export function postsInPeriod(
  posts: SocialPost[],
  periodDays: number,
  now = Date.now(),
): SocialPost[] {
  const cutoff = periodCutoffMs(periodDays, now);
  return posts.filter((post) => postTimestampMs(post) >= cutoff);
}

export function sumPostMetricsInPeriod(
  posts: SocialPost[],
  periodDays: number,
  now = Date.now(),
): { impressions: number; likes: number; comments: number; postsInPeriod: number } {
  const inPeriod = postsInPeriod(posts, periodDays, now);
  return inPeriod.reduce(
    (acc, post) => {
      const metrics = post.metrics;
      return {
        impressions: acc.impressions + (metrics?.impressions ?? 0),
        likes: acc.likes + (metrics?.likes ?? 0),
        comments: acc.comments + (metrics?.comments ?? 0),
        postsInPeriod: acc.postsInPeriod + 1,
      };
    },
    { impressions: 0, likes: 0, comments: 0, postsInPeriod: 0 },
  );
}

export function sumFollowersSnapshot(growth: SocialGrowthAccount[]): number {
  return growth.reduce((sum, account) => sum + (account.latest?.followers ?? 0), 0);
}

export function sumFollowersDelta(growth: SocialGrowthAccount[]): number | null {
  let total = 0;
  let any = false;
  for (const account of growth) {
    if (typeof account.delta === 'number' && Number.isFinite(account.delta)) {
      total += account.delta;
      any = true;
    }
  }
  return any ? total : null;
}
