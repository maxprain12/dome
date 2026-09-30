import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CloudFeedSchema } = require('../social/radar/radar-cloud.cjs');

it('preserves verifiable evidence across the cloud boundary', () => {
  const evidence = {
    id: 'source', title: 'A post', body: 'Actual caption', provider: 'instagram',
    metrics: { likes: 37, comments: 2, impressions: null }, format: 'reel', publishedAt: 1700000000000,
    media: [{ type: 'video', thumbnailUrl: 'https://example.com/image.jpg' }],
    author: { name: 'Ada', avatarUrl: 'https://example.com/avatar.jpg' },
  };
  const parsed = CloudFeedSchema.parse({ clusters: [{
    id: 'cluster', topicKey: 'design', title: '#design', phase: 'emerging',
    confidence: 0.5, trendScore: 0.5, evidence: [evidence],
  }] });
  assert.deepEqual(parsed.clusters[0].evidence[0], evidence);
});
