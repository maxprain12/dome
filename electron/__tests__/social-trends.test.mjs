import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTrendSignals, buildCompetitiveReport } = require('../social/social-trends.cjs');

describe('social trends and competitive reports', () => {
  it('derives provenance from own posts and references', () => {
    const now = Date.now();
    const snapshot = buildTrendSignals({
      windowDays: 30,
      ownPosts: [
        { status: 'published', publishedAt: now, themes: ['ai'], caption: '#ai launch', format: 'reel', provider: 'instagram' },
      ],
      references: [
        { capturedAt: now, themes: ['ai'], text: 'hook #ai', format: 'reel', provider: 'instagram' },
        { capturedAt: now, themes: ['design'], text: 'layout', format: 'carousel', provider: 'linkedin' },
      ],
    });
    const ai = snapshot.signals.find((signal) => signal.theme === 'ai' || signal.theme === '#ai');
    assert.ok(ai);
    assert.ok(ai.sources.includes('oauth_own'));
    assert.ok(ai.providers.includes('instagram'));
    assert.equal(snapshot.limitations.includes('own_and_references_only'), true);
    assert.equal(snapshot.limitations.includes('no_platform_explore'), true);
    assert.equal(snapshot.limitations.includes('no_invented_metrics'), true);
    assert.equal(snapshot.signals.every((signal) => signal.provenance), true);
    assert.ok(snapshot.creatives.length >= 2);
    assert.equal(snapshot.creatives[0].isVideo, true);
    assert.equal(snapshot.recommendedFormat, 'reel');
  });

  it('ranks visual creatives by real engagement and never fills missing views', () => {
    const now = Date.now();
    const snapshot = buildTrendSignals({
      windowDays: 30,
      ownPosts: [],
      references: [
        {
          capturedAt: now,
          format: 'reel',
          provider: 'instagram',
          url: 'https://www.instagram.com/reel/low/',
          body: 'quiet reel',
          media: [{ type: 'video', url: 'https://img.test/low.jpg' }],
          metrics: { likes: 10, impressions: 100 },
        },
        {
          capturedAt: now,
          format: 'reel',
          provider: 'instagram',
          url: 'https://www.instagram.com/reel/hot/',
          body: 'hot reel',
          media: [{ type: 'video', url: 'https://img.test/hot.jpg' }],
          metrics: { likes: 200 },
        },
        {
          capturedAt: now,
          format: 'profile',
          provider: 'instagram',
          url: 'https://www.instagram.com/ada/',
          body: 'bio',
        },
      ],
    });
    assert.equal(snapshot.creatives[0].url, 'https://www.instagram.com/reel/hot/');
    assert.equal(snapshot.creatives[0].metrics.impressions, undefined);
    assert.equal(snapshot.formats.some((item) => item.format === 'profile'), false);
    assert.equal(snapshot.mix.video, 2);
  });

  it('omits missing metrics instead of filling zeros', () => {
    const report = buildCompetitiveReport({
      ownPosts: [{ status: 'published', format: 'reel', topics: ['ai'] }],
      watchlist: { id: 'w1', name: 'Competitors', kind: 'competitor', members: [{ displayName: 'Ada', handle: 'ada' }] },
      references: [{ id: 'sr-1', title: 'Ada post', provider: 'instagram', format: 'reel', url: 'https://instagram.com/p/1', topics: ['ai'] }],
    });
    assert.equal(report.reportType, 'competitive');
    assert.equal(report.references.citations[0].title, 'Ada post');
    assert.equal(report.own.publishedCount, 1);
    assert.ok(report.limitations.some((line) => /zeros/i.test(line)));
  });

  it('matches a public reference to an own post when format and topics overlap', () => {
    const { buildFitSuggestions } = require('../social/social-trends.cjs');
    const fits = buildFitSuggestions({
      ownPosts: [{ id: 'sp-1', status: 'draft', body: 'Our #ai reel', format: 'reel', topics: ['ai'] }],
      references: [{
        id: 'sr-2',
        title: 'Competitor reel',
        author: { name: 'Ada', handle: 'ada' },
        provider: 'instagram',
        format: 'reel',
        body: 'Shipping #ai',
        topics: ['ai'],
        url: 'https://instagram.com/reel/1',
      }],
    });
    assert.equal(fits.length, 1);
    assert.equal(fits[0].formatMatch, true);
    assert.ok(fits[0].topics.includes('ai') || fits[0].topics.includes('#ai'));
  });
});
