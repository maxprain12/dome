import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildRadarFeeds } = require('../social/radar/radar-feed.cjs');

it('does not make an old publication a current trend just because it was captured today', async () => {
  const now = Date.now();
  const snapshot = await buildRadarFeeds({
    database: { getQueries: () => ({ getSetting: { get: (key) => key === 'social_trends_cloud' ? { value: '0' } : null } }) },
    store: { listPosts: () => [] },
    referenceStore: { listReferences: () => [
      { id: 'old', kind: 'post', topics: ['old'], url: 'https://x.com/ada/status/1', publishedAt: now - 90 * 86400000, capturedAt: now },
      { id: 'new', kind: 'post', topics: ['new'], url: 'https://x.com/ada/status/2', publishedAt: now - 86400000, capturedAt: now },
    ] },
    radarStore: { listReferenceMetricSeries: () => [], listEvents: () => [], listInterest: () => [], cacheClusters: () => {} },
    windowDays: 7,
  });
  assert.equal(snapshot.referenceCount, 1);
  assert.deepEqual(snapshot.feeds.radar.map((cluster) => cluster.topicKey), ['new']);
  assert.equal(snapshot.feeds.emerging.length, 0);
  assert.equal(snapshot.feeds.radar[0].phase, 'observed');
});
