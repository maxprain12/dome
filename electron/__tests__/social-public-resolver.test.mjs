import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolvePublicSocial, limitationsForPublicCard, isHollowPublicCard, isStaleMetricsCard, applyPublicPostEnrichment } = require('../social/social-public-resolver.cjs');

describe('resolvePublicSocial local match', () => {
  it('returns a connected post card without inventing metrics', async () => {
    const post = {
      id: 'sp-1',
      provider: 'x',
      accountId: 'sa-1',
      body: 'Hello world',
      externalUrl: 'https://x.com/ada/status/123',
      externalPostId: '123',
      source: { authorName: 'Ada', authorHandle: 'ada', avatarUrl: 'https://img.test/a.jpg' },
      media: [],
      metrics: { likes: 4 },
      publishedAt: 1,
    };
    const store = {
      listPosts: () => [post],
      listAccounts: () => [{ id: 'sa-1', provider: 'x', handle: 'ada', displayName: 'Ada', avatarUrl: 'https://img.test/a.jpg' }],
      getAccount: () => ({ id: 'sa-1', displayName: 'Ada', handle: 'ada', avatarUrl: 'https://img.test/a.jpg' }),
      serializeAccount: (account) => account,
      getLatestAccountMetric: () => null,
    };
    const result = await resolvePublicSocial({ store }, { url: 'https://x.com/ada/status/123' });
    assert.equal(result.success, true);
    assert.equal(result.card.fetchMethod, 'connected_account');
    assert.equal(result.card.author.name, 'Ada');
    assert.equal(result.card.author.avatarUrl, 'https://img.test/a.jpg');
    assert.equal(result.card.metrics.likes, 4);
  });

  it('rejects unsupported URLs', async () => {
    const result = await resolvePublicSocial({ store: { listPosts: () => [], listAccounts: () => [] } }, { url: 'https://example.com' });
    assert.equal(result.success, false);
  });

  it('does not flag requires_browser when followers or posts were captured', () => {
    const withPosts = limitationsForPublicCard({
      counts: { followers: 655662, following: 651, postsCount: 1328 },
      recentPosts: [{ metrics: null }],
      loginWall: false,
      needsBrowser: false,
      hasOg: true,
    });
    assert.equal(withPosts.includes('requires_browser'), false);
    assert.equal(withPosts.includes('og_only'), false);
    assert.equal(withPosts.includes('metrics_unavailable'), false);

    const ogOnly = limitationsForPublicCard({
      counts: { followers: 100, following: null, postsCount: null },
      recentPosts: [],
      loginWall: false,
      needsBrowser: false,
      hasOg: true,
    });
    assert.ok(ogOnly.includes('og_only'));
    assert.equal(ogOnly.includes('requires_browser'), false);
    assert.equal(ogOnly.includes('metrics_unavailable'), false);

    assert.equal(isHollowPublicCard({
      limitations: ['requires_browser', 'metrics_unavailable'],
      followers: null,
      postsCount: null,
      recentPosts: [],
    }), true);
    assert.equal(isHollowPublicCard({
      limitations: ['requires_browser'],
      followers: 10,
      postsCount: null,
      recentPosts: [],
    }), false);
  });

  it('treats Instagram grids without likes/views as stale cache', () => {
    assert.equal(isStaleMetricsCard({
      provider: 'instagram',
      kind: 'profile',
      recentPosts: [{ url: 'https://www.instagram.com/p/DdRmHrLDjIS/', metrics: null }],
    }), true);
    assert.equal(isStaleMetricsCard({
      provider: 'instagram',
      kind: 'profile',
      recentPosts: [{ url: 'https://www.instagram.com/p/DdRmHrLDjIS/', metrics: { likes: 105 } }],
    }), false);
    assert.equal(isStaleMetricsCard({
      provider: 'instagram',
      kind: 'profile',
      metricsEnriched: true,
      recentPosts: [{ url: 'https://www.instagram.com/p/DdRmHrLDjIS/', metrics: null }],
    }), false);
  });

  it('merges post OG likes onto a Polar grid item without inventing views', () => {
    const post = {
      provider: 'instagram',
      url: 'https://www.instagram.com/p/DdRmHrLDjIS/',
      externalId: 'DdRmHrLDjIS',
      format: 'carousel',
      body: 'Dream job carousel',
      metrics: null,
      limitations: ['metrics_unavailable'],
      media: [{ type: 'image', url: 'https://scontent.cdninstagram.com/v/carousel.jpg' }],
    };
    const next = applyPublicPostEnrichment(post, {
      description: '105 likes, 8 comments - manychat on September 16, 2025: "Dream job carousel"',
      html: '',
    });
    assert.equal(next.metrics.likes, 105);
    assert.equal(next.metrics.comments, 8);
    assert.equal(next.metrics.impressions, undefined);
    assert.equal(next.limitations.includes('metrics_unavailable'), false);
  });
});
