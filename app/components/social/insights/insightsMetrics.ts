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

export const DAY_MS = 24 * 60 * 60 * 1000;

export type TrendDirection = 'up' | 'down' | 'flat';

export interface PeriodMetrics {
  impressions: number | null;
  likes: number;
  comments: number;
  shares: number;
  engagements: number;
  postsInPeriod: number;
}

export interface AudiencePoint {
  t: number;
  followers: number | null;
}

export type EngagementMixId = 'likes' | 'comments' | 'shares';

export interface EngagementMixSlice {
  id: EngagementMixId;
  value: number;
  pct: number;
}

function metricValue(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function engagementTotal(metrics: {
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
} | null | undefined): number {
  if (!metrics) return 0;
  return metricValue(metrics.likes) + metricValue(metrics.comments) + metricValue(metrics.shares);
}

export function emptyPeriodMetrics(): PeriodMetrics {
  return { impressions: null, likes: 0, comments: 0, shares: 0, engagements: 0, postsInPeriod: 0 };
}

export function sumPostMetricsInRange(
  posts: SocialPost[],
  startMs: number,
  endMs: number,
): PeriodMetrics {
  return posts.reduce((acc, post) => {
    const at = postTimestampMs(post);
    if (post.status !== 'published' || at < startMs || at >= endMs) return acc;
    const metrics = post.metrics;
    const likes = metricValue(metrics?.likes);
    const comments = metricValue(metrics?.comments);
    const shares = metricValue(metrics?.shares);
    return {
      impressions: metrics?.impressions == null ? acc.impressions : (acc.impressions ?? 0) + metricValue(metrics.impressions),
      likes: acc.likes + likes,
      comments: acc.comments + comments,
      shares: acc.shares + shares,
      engagements: acc.engagements + likes + comments + shares,
      postsInPeriod: acc.postsInPeriod + 1,
    };
  }, emptyPeriodMetrics());
}

export function sumPostMetricsInPeriod(
  posts: SocialPost[],
  periodDays: number,
  now = Date.now(),
): PeriodMetrics {
  return sumPostMetricsInRange(posts, periodCutoffMs(periodDays, now), now + 1);
}

export function previousPeriodMetrics(
  posts: SocialPost[],
  periodDays: number,
  now = Date.now(),
): PeriodMetrics {
  const currentStart = periodCutoffMs(periodDays, now);
  return sumPostMetricsInRange(posts, periodCutoffMs(periodDays, currentStart), currentStart);
}

export function averagePerPost(total: number, postsInPeriod: number): number {
  if (postsInPeriod <= 0) return 0;
  return total / postsInPeriod;
}

export function trendPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export function trendDirection(pct: number | null): TrendDirection {
  if (pct == null || Math.abs(pct) < 0.0005) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

export function compactSocialNumber(value: number | null, locale = 'es'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: safe >= 1000 ? 2 : 0,
  }).format(safe);
}

export function formatTrendPct(pct: number | null, locale = 'es'): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: Math.abs(pct) >= 0.1 ? 0 : 1,
    signDisplay: 'exceptZero',
  }).format(pct);
}

export function startOfUtcDay(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function followersAt(account: SocialGrowthAccount, at: number): number | null {
  const snapshots = [
    ...account.points.map((point) => ({ t: point.t, followers: point.followers })),
    account.latest
      ? { t: account.latest.capturedAt, followers: account.latest.followers }
      : null,
  ].filter((snapshot): snapshot is { t: number; followers: number | null } => snapshot != null);
  snapshots.sort((a, b) => a.t - b.t);
  let value: number | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.t > at) break;
    if (snapshot.followers != null && Number.isFinite(snapshot.followers)) value = snapshot.followers;
  }
  return value;
}

export function mergeFollowerSeries(
  growth: SocialGrowthAccount[],
  startMs: number,
  endMs: number,
): Array<{ t: number; followers: number | null }> {
  const start = startOfUtcDay(startMs);
  const end = startOfUtcDay(endMs);
  const series: Array<{ t: number; followers: number | null }> = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const at = t + DAY_MS - 1;
    series.push({
      t,
      followers: sumKnown(growth.map((account) => followersAt(account, at))),
    });
  }
  return series;
}

export function buildAudienceSeries(
  growth: SocialGrowthAccount[],
  periodDays: number,
  now = Date.now(),
): AudiencePoint[] {
  return mergeFollowerSeries(growth, periodCutoffMs(periodDays, now), now);
}

export function engagementMix(metrics: PeriodMetrics): EngagementMixSlice[] {
  const slices: Array<{ id: EngagementMixId; value: number }> = [
    { id: 'likes', value: metrics.likes },
    { id: 'comments', value: metrics.comments },
    { id: 'shares', value: metrics.shares },
  ];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return slices.map((slice) => ({
    ...slice,
    pct: total > 0 ? slice.value / total : 0,
  }));
}

export function filterGrowthByAccount(
  growth: SocialGrowthAccount[],
  accountId: string | null,
): SocialGrowthAccount[] {
  if (!accountId) return growth;
  return growth.filter((account) => account.accountId === accountId);
}

export function recentPublishedPosts(posts: SocialPost[], limit = 6): SocialPost[] {
  const published = posts.filter((post) => post.status === 'published');
  published.sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt));
  return published.slice(0, Math.max(0, limit));
}

function sumKnown(values: Array<number | null | undefined>): number | null {
  if (!values.length || values.some((value) => value == null || !Number.isFinite(value))) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function sumFollowersSnapshot(growth: SocialGrowthAccount[]): number | null {
  return sumKnown(growth.map((account) => account.latest?.followers));
}

export function sumFollowersDelta(growth: SocialGrowthAccount[]): number | null {
  return sumKnown(growth.map((account) => account.delta));
}
