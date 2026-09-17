import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildAffinityProfile, clusterAffinity } = require('../social/radar/radar-affinity.cjs');

describe('radar affinity', () => {
  it('decays old events and boosts generate/publish', () => {
    const now = Date.now();
    const profile = buildAffinityProfile({
      now,
      ownPosts: [{ topics: ['ai'], engagementScore: 800 }],
      references: [{ topics: ['design'] }],
      explicitInterests: [{ topicKey: 'ai', weight: 1 }],
      events: [
        { eventType: 'dismiss', createdAt: now, payload: { topicKey: 'viral' } },
        { eventType: 'generate', createdAt: now - 40 * 24 * 60 * 60 * 1000, payload: { topicKey: 'old' } },
        { eventType: 'publish', createdAt: now, payload: { topicKey: 'launch' } },
      ],
    });
    assert.ok((profile.weights.get('ai') || 0) > (profile.weights.get('design') || 0));
    assert.ok((profile.weights.get('launch') || 0) > (profile.weights.get('old') || 0));
    assert.ok((profile.weights.get('viral') || 0) < 0.2);
  });

  it('scores a cluster against the local profile', () => {
    const profile = buildAffinityProfile({
      explicitInterests: [{ topicKey: 'hooks', weight: 1 }],
    });
    const high = clusterAffinity({ topicKey: 'hooks', topics: ['hooks'] }, profile);
    const low = clusterAffinity({ topicKey: 'unrelated', topics: ['unrelated'] }, profile);
    assert.ok(high > 0.8);
    assert.equal(low, 0);
  });
});
