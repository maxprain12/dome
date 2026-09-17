import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const score = require('../social/radar/radar-score.cjs');
const { mmrRerank } = require('../social/radar/radar-mmr.cjs');
const { clusterItems, dedupeItems, asEvidence } = require('../social/radar/radar-cluster.cjs');

describe('radar score', () => {
  it('treats missing metrics as zero relative performance', () => {
    assert.equal(score.relativePerformance(null, [10, 20, 30]), 0);
    assert.equal(score.engagementValue({}), null);
    assert.equal(score.engagementValue(null), null);
  });

  it('dampens outliers with MAD instead of mean', () => {
    const baseline = [10, 11, 9, 10, 12, 1000];
    const typical = score.relativePerformance(11, baseline);
    const outlier = score.relativePerformance(1000, baseline);
    assert.ok(typical > 0.4 && typical < 0.7);
    assert.ok(outlier > typical);
    assert.ok(outlier <= 1);
  });

  it('computes velocity from recent vs previous windows', () => {
    const now = 1_700_000_000_000;
    const day = score.DAY_MS;
    const rising = score.velocityFromSeries([
      { t: now - 6 * day, v: 10 },
      { t: now - 5 * day, v: 12 },
      { t: now - 12 * 60 * 60 * 1000, v: 40 },
      { t: now - 1 * 60 * 60 * 1000, v: 80 },
    ], now);
    const falling = score.velocityFromSeries([
      { t: now - 6 * day, v: 10 },
      { t: now - 5 * day, v: 80 },
      { t: now - 12 * 60 * 60 * 1000, v: 8 },
      { t: now - 1 * 60 * 60 * 1000, v: 2 },
    ], now);
    assert.ok(rising > 0);
    assert.ok(falling < 0);
    assert.equal(score.velocityFromSeries([{ t: now, v: 10 }], now), 0);
  });

  it('assigns emerging / peak / cooling phases', () => {
    assert.equal(score.phase({ burst: 0.8, velocity: 0.5, saturation: 0.2, freshness: 0.8 }), 'emerging');
    assert.equal(score.phase({ burst: 0.5, velocity: 0.4, saturation: 0.3, freshness: 0.6 }), 'accelerating');
    assert.equal(score.phase({ burst: 0.2, velocity: 0, saturation: 0.8, freshness: 0.4 }), 'peak');
    assert.equal(score.phase({ burst: 0.1, velocity: -0.4, saturation: 0.3, freshness: 0.2 }), 'cooling');
  });

  it('keeps ForYouScore in 0-1 and applies affinity formula', () => {
    const high = score.forYouScore({ trendScore: 1, affinity: 1, novelty: 1, feasibility: 1 });
    const mid = score.forYouScore({ trendScore: 1, affinity: 0, novelty: 1, feasibility: 1 });
    const low = score.forYouScore({ trendScore: 1, affinity: 0, novelty: 0.5, feasibility: 0.7 });
    assert.equal(high, 1);
    assert.ok(Math.abs(mid - 0.6) < 1e-9);
    assert.ok(low < mid);
  });

  it('sorts clusters stably by score then title', () => {
    const items = [
      { id: 'b', title: 'Beta', trendScore: 0.5 },
      { id: 'a', title: 'Alpha', trendScore: 0.5 },
      { id: 'c', title: 'Gamma', trendScore: 0.9 },
    ];
    const sorted = items.slice().sort((a, b) => score.stableClusterSort(a, b, 'trendScore'));
    assert.deepEqual(sorted.map((item) => item.id), ['c', 'a', 'b']);
  });
});

describe('radar clustering and MMR', () => {
  it('dedupes reposts by URL and similar text', () => {
    const items = [
      { url: 'https://x.com/a/1', body: 'hello world' },
      { url: 'https://x.com/a/1?s=20', body: 'other' },
      { body: 'hello world' },
      { body: 'hello world' },
    ];
    assert.equal(dedupeItems(items).length, 2);
  });

  it('keeps evidence media for visual tiles', () => {
    const ev = asEvidence({
      id: 'p1',
      title: 'Reel',
      provider: 'instagram',
      format: 'reel',
      media: [{ type: 'reel', thumbnailUrl: 'https://cdn.example/a.jpg' }],
    });
    assert.equal(ev.media[0].thumbnailUrl, 'https://cdn.example/a.jpg');
  });

  it('does not treat single-author local clusters as native trends', () => {
    const now = Date.now();
    const clusters = clusterItems([
      { id: '1', origin: 'own', provider: 'x', topics: ['ai'], body: '#ai', author: { handle: 'me' }, publishedAt: now, metrics: { likes: 10 } },
      { id: '2', origin: 'reference', provider: 'x', topics: ['ai'], body: '#ai again', author: { handle: 'me' }, publishedAt: now, metrics: { likes: 4 } },
    ], { now, source: 'local' });
    const ai = clusters.find((cluster) => cluster.topicKey === 'ai');
    assert.ok(ai);
    assert.equal(ai.nativeTrend, false);
    assert.ok(ai.limitations.includes('insufficient_breadth'));
    assert.ok(ai.authorCount < 3);
  });

  it('MMR prefers a diverse second item over a near-duplicate', () => {
    const ranked = mmrRerank([
      { id: '1', title: 'ai tools', topicKey: 'ai', forYouScore: 0.9 },
      { id: '2', title: 'ai tooling', topicKey: 'ai', forYouScore: 0.88 },
      { id: '3', title: 'design systems', topicKey: 'design', forYouScore: 0.7 },
    ], { lambda: 0.5, limit: 2 });
    assert.equal(ranked[0].id, '1');
    assert.equal(ranked[1].id, '3');
  });
});
