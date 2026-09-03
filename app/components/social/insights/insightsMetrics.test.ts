import { describe, expect, it } from 'vitest';
import type { SocialPost } from '@/components/social/socialTypes';
import {
  averagePerPost,
  buildAudienceSeries,
  compactSocialNumber,
  engagementMix,
  filterGrowthByAccount,
  formatTrendPct,
  periodCutoffMs,
  postsInPeriod,
  postTimestampMs,
  previousPeriodMetrics,
  recentPublishedPosts,
  sumFollowersDelta,
  sumFollowersSnapshot,
  sumPostMetricsInPeriod,
  trendDirection,
  trendPct,
} from './insightsMetrics';

function post(partial: Partial<SocialPost> & { id: string }): SocialPost {
  return {
    accountId: 'acc',
    provider: 'instagram',
    status: 'published',
    body: 'hello',
    mediaUrls: [],
    publishedAt: null,
    scheduledAt: null,
    createdAt: 0,
    updatedAt: 0,
    campaignId: null,
    externalPostId: null,
    error: null,
    metrics: null,
    ...partial,
  } as SocialPost;
}

describe('insightsMetrics', () => {
  const now = Date.parse('2026-07-24T12:00:00.000Z');

  it('periodCutoffMs subtracts whole days', () => {
    expect(periodCutoffMs(30, now)).toBe(now - 30 * 24 * 60 * 60 * 1000);
  });

  it('postTimestampMs prefers publishedAt', () => {
    expect(postTimestampMs({ publishedAt: 100, createdAt: 50 })).toBe(100);
    expect(postTimestampMs({ publishedAt: null, createdAt: 50 })).toBe(50);
  });

  it('sumPostMetricsInPeriod only counts posts inside the window', () => {
    const posts = [
      post({
        id: 'old',
        publishedAt: now - 40 * 24 * 60 * 60 * 1000,
        metrics: { impressions: 100, likes: 10, comments: 5 } as SocialPost['metrics'],
      }),
      post({
        id: 'recent',
        publishedAt: now - 2 * 24 * 60 * 60 * 1000,
        metrics: { impressions: 37, likes: 9, comments: 12 } as SocialPost['metrics'],
      }),
    ];
    expect(postsInPeriod(posts, 30, now)).toHaveLength(1);
    expect(sumPostMetricsInPeriod(posts, 30, now)).toEqual({
      impressions: 37,
      likes: 9,
      comments: 12,
      shares: 0,
      engagements: 21,
      postsInPeriod: 1,
    });
  });

  it('compares the previous window and formats compact trends', () => {
    const posts = [
      post({
        id: 'prev',
        publishedAt: now - 40 * 24 * 60 * 60 * 1000,
        metrics: { impressions: 100, likes: 10, comments: 0, shares: 0 } as SocialPost['metrics'],
      }),
      post({
        id: 'curr',
        publishedAt: now - 2 * 24 * 60 * 60 * 1000,
        metrics: { impressions: 150, likes: 20, comments: 5, shares: 5 } as SocialPost['metrics'],
      }),
    ];
    expect(previousPeriodMetrics(posts, 30, now)).toEqual({
      impressions: 100,
      likes: 10,
      comments: 0,
      shares: 0,
      engagements: 10,
      postsInPeriod: 1,
    });
    expect(trendPct(150, 100)).toBeCloseTo(0.5);
    expect(trendDirection(0.5)).toBe('up');
    expect(trendDirection(-0.04)).toBe('down');
    expect(formatTrendPct(0.012, 'en')).toBe('+1.2%');
    expect(compactSocialNumber(1240, 'en')).toBe('1.24K');
    expect(averagePerPost(30, 3)).toBe(10);
  });

  it('builds audience series, mix slices and recent published posts', () => {
    const start = now - 2 * 24 * 60 * 60 * 1000;
    const growth = [
      {
        accountId: 'ig',
        provider: 'instagram' as const,
        displayName: 'Dome',
        handle: '@dome',
        status: 'active' as const,
        latest: {
          id: 'm1',
          accountId: 'ig',
          capturedAt: now,
          followers: 120,
          following: 1,
          postsCount: 2,
        },
        points: [
          { t: start, followers: 100 },
          { t: now, followers: 120 },
        ],
        delta: 20,
      },
    ];
    const posts = [
      post({
        id: 'p1',
        status: 'published',
        publishedAt: now - 24 * 60 * 60 * 1000,
        metrics: { impressions: 40, likes: 8, comments: 2, shares: 0 } as SocialPost['metrics'],
      }),
      post({
        id: 'draft',
        status: 'draft',
        publishedAt: null,
        createdAt: now,
      }),
    ];
    const series = buildAudienceSeries(posts, growth, 7, now);
    expect(series.length).toBeGreaterThan(2);
    expect(series.at(-1)?.followers).toBe(120);
    expect(engagementMix(sumPostMetricsInPeriod(posts, 7, now)).map((slice) => slice.id)).toEqual([
      'likes',
      'comments',
      'shares',
    ]);
    expect(filterGrowthByAccount(growth, 'ig')).toHaveLength(1);
    expect(filterGrowthByAccount(growth, 'other')).toHaveLength(0);
    expect(recentPublishedPosts(posts, 4).map((item) => item.id)).toEqual(['p1']);
  });

  it('sums followers snapshot and delta', () => {
    const growth = [
      {
        accountId: 'a',
        provider: 'instagram' as const,
        displayName: 'A',
        handle: '@a',
        status: 'active' as const,
        latest: {
          id: 'm1',
          accountId: 'a',
          capturedAt: now,
          followers: 2,
          following: 1,
          postsCount: 1,
        },
        points: [],
        delta: 0,
      },
      {
        accountId: 'b',
        provider: 'linkedin' as const,
        displayName: 'B',
        handle: null,
        status: 'active' as const,
        latest: {
          id: 'm2',
          accountId: 'b',
          capturedAt: now,
          followers: 10,
          following: null,
          postsCount: null,
        },
        points: [],
        delta: 3,
      },
    ];
    expect(sumFollowersSnapshot(growth)).toBe(12);
    expect(sumFollowersDelta(growth)).toBe(3);
  });
});
