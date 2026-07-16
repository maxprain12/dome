import { describe, expect, it } from 'vitest';
import type { SocialPost } from '@/components/social/socialTypes';
import {
  buildCampaignGroups,
  buildSocialQueues,
  computeSocialStats,
  filterPostsByQuery,
  postSnippet,
} from './socialQueues';

function post(partial: Partial<SocialPost> & { id: string }): SocialPost {
  return {
    accountId: 'acc-1',
    provider: 'linkedin',
    status: 'draft',
    body: 'Hello world',
    media: [],
    linkUrl: null,
    topics: [],
    campaign: null,
    scheduledAt: null,
    publishedAt: null,
    externalPostId: null,
    externalUrl: null,
    error: null,
    createdBy: 'user',
    groupId: null,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe('socialQueues', () => {
  const now = Date.parse('2026-07-16T12:00:00Z');

  it('partitions failed, scheduled soon, drafts, recent published', () => {
    const posts = [
      post({ id: 'f1', status: 'failed', updatedAt: 3 }),
      post({
        id: 's1',
        status: 'scheduled',
        scheduledAt: now + 2 * 24 * 60 * 60 * 1000,
      }),
      post({
        id: 's2',
        status: 'scheduled',
        scheduledAt: now + 20 * 24 * 60 * 60 * 1000,
      }),
      post({ id: 'd1', status: 'draft', updatedAt: 5 }),
      post({
        id: 'p1',
        status: 'published',
        publishedAt: now - 3 * 24 * 60 * 60 * 1000,
      }),
      post({
        id: 'p2',
        status: 'published',
        publishedAt: now - 30 * 24 * 60 * 60 * 1000,
      }),
    ];
    const q = buildSocialQueues(posts, [{ id: 'r1', status: 'pending', hashtag: null, commentText: 'hi', commentAuthor: 'x', replyBody: 'ok', createdAt: 9 }], now);
    expect(q.needsAttention.map((p) => p.id)).toEqual(['f1']);
    expect(q.scheduledSoon.map((p) => p.id)).toEqual(['s1']);
    expect(q.drafts.map((p) => p.id)).toEqual(['d1']);
    expect(q.recentPublished.map((p) => p.id)).toEqual(['p1']);
    expect(q.pendingReplyDrafts).toHaveLength(1);
  });

  it('groups soft campaigns and filters by query', () => {
    const posts = [
      post({ id: '1', campaign: 'Launch', status: 'draft' }),
      post({ id: '2', campaign: 'Launch', status: 'published', publishedAt: now }),
      post({ id: '3', campaign: 'Hiring', body: 'We are hiring' }),
      post({ id: '4', campaign: null }),
    ];
    const groups = buildCampaignGroups(posts);
    expect(groups.map((g) => g.name)).toEqual(['Launch', 'Hiring']);
    expect(groups[0]?.draft).toBe(1);
    expect(groups[0]?.published).toBe(1);
    expect(filterPostsByQuery(posts, 'hiring').map((p) => p.id)).toEqual(['3']);
    expect(postSnippet(post({ id: 'x', body: 'a'.repeat(100) })).endsWith('…')).toBe(true);
  });

  it('computes agent stats', () => {
    const posts = [
      post({ id: 'd', status: 'draft' }),
      post({ id: 'f', status: 'failed' }),
      post({ id: 'c', campaign: 'Q3', status: 'draft' }),
    ];
    const stats = computeSocialStats(posts, [], 2, [{ delta: 5 } as never], now);
    expect(stats.drafts).toBe(2);
    expect(stats.attention).toBe(1);
    expect(stats.campaigns).toBe(1);
    expect(stats.activeAccounts).toBe(2);
    expect(stats.followersDelta).toBe(5);
  });
});
