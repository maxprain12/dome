import { describe, expect, it } from 'vitest';
import type { SocialPost } from '@/components/social/socialTypes';
import {
  buildCampaignGroups,
  buildSocialQueues,
  computeSocialStats,
  filterPostsByAccount,
  filterPostsByQuery,
  postSnippet,
  socialAccountLabel,
  looksLikeOpaqueId,
  socialEventCardLabel,
  socialPostLabel,
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

  it('filters by account for presence focus', () => {
    const posts = [
      post({ id: '1', accountId: 'a' }),
      post({ id: '2', accountId: 'b' }),
      post({ id: '3', accountId: 'a' }),
    ];
    expect(filterPostsByAccount(posts, null).map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(filterPostsByAccount(posts, 'a').map((p) => p.id)).toEqual(['1', '3']);
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

  it('formats account and event card labels without raw ids', () => {
    expect(
      socialAccountLabel({ displayName: 'Dome', handle: '@dome', provider: 'instagram' }),
    ).toBe('Dome (@dome)');
    expect(
      socialAccountLabel({ displayName: null, handle: null, provider: 'instagram' }),
    ).toBe('instagram');
    expect(
      socialEventCardLabel({
        internalName: 'Launch',
        title: 'Pase',
        slug: 'pase',
      }),
    ).toBe('Launch');
    expect(
      socialEventCardLabel({
        internalName: '',
        title: 'Pase de Lanzamiento',
        slug: 'pase',
      }),
    ).toBe('Pase de Lanzamiento');
    expect(looksLikeOpaqueId('dfa9d9ab-533e-49f7-84da-226ff712717c')).toBe(true);
    expect(looksLikeOpaqueId('sp-ab12cd34ef')).toBe(true);
    expect(looksLikeOpaqueId('soc-instagram-03b04c26ef42')).toBe(true);
    expect(looksLikeOpaqueId('Launch Night')).toBe(false);
    expect(
      socialEventCardLabel({
        internalName: 'dfa9d9ab-533e-49f7-84da-226ff712717c',
        title: '',
        slug: null,
      }),
    ).toBe('…');
    expect(
      socialPostLabel({
        body: 'This AI reads my PDFs so I do not have to. Ask Many about summaries.',
        campaign: null,
        publishedAt: null,
      }),
    ).toMatch(/^This AI reads my PDFs/);
    expect(
      socialPostLabel({
        body: '',
        campaign: 'Launch',
        publishedAt: null,
      }),
    ).toBe('Launch');
  });
});
