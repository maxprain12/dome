import { describe, expect, it } from 'vitest';
import type { SocialPost } from '@/components/social/socialTypes';
import {
  periodCutoffMs,
  postsInPeriod,
  postTimestampMs,
  sumFollowersDelta,
  sumFollowersSnapshot,
  sumPostMetricsInPeriod,
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
      postsInPeriod: 1,
    });
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
