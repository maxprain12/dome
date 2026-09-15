/**
 * Desktop scheduler: skip Instagram cloud accounts while the provider ticker is live.
 * Run: node --test electron/__tests__/social-scheduler.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { selectDuePostsForLocalTick } = require('../social/social-scheduler.cjs');

const due = [
  { id: 'local', accountId: 'acc-local', provider: 'instagram', scheduledAt: 1 },
  { id: 'cloud-ig', accountId: 'acc-cloud', provider: 'instagram', scheduledAt: 1 },
  { id: 'cloud-li', accountId: 'acc-cloud', provider: 'linkedin', scheduledAt: 1 },
];

describe('selectDuePostsForLocalTick', () => {
  it('publishes every due post when no cloud worker providers are configured', () => {
    const picked = selectDuePostsForLocalTick(due, {
      isAccountCloudPublishing: (id) => id === 'acc-cloud',
    });
    assert.deepEqual(picked.map((p) => p.id), ['local', 'cloud-ig', 'cloud-li']);
  });

  it('skips Instagram cloud accounts and still publishes LinkedIn', () => {
    const picked = selectDuePostsForLocalTick(due, {
      cloudWorkerProviders: ['instagram'],
      isAccountCloudPublishing: (id) => id === 'acc-cloud',
      now: 60_000,
      cloudFallbackMs: 10 * 60 * 1000,
    });
    assert.deepEqual(picked.map((p) => p.id), ['local', 'cloud-li']);
  });

  it('falls back to local Instagram publish after the cloud grace window', () => {
    const picked = selectDuePostsForLocalTick(due, {
      cloudWorkerProviders: ['instagram'],
      isAccountCloudPublishing: (id) => id === 'acc-cloud',
      now: 11 * 60 * 1000,
      cloudFallbackMs: 10 * 60 * 1000,
    });
    assert.deepEqual(picked.map((p) => p.id), ['local', 'cloud-ig', 'cloud-li']);
  });
});
