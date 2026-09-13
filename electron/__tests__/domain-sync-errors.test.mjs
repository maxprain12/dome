/**
 * Domain Sync fetch unwrap + transport backoff.
 * Run: node --test electron/__tests__/domain-sync-errors.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  BACKOFF_MIN_MS,
  BACKOFF_MAX_MS,
  formatDomainSyncError,
  isTransportFailure,
  createDomainErrorTracker,
} = require('../storage/domain-sync-errors.cjs');

describe('domain-sync error unwrap', () => {
  it('explains ECONNREFUSED instead of raw fetch failed', () => {
    const err = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const message = formatDomainSyncError(err, 'http://localhost:3001');
    assert.match(message, /not reachable/);
    assert.match(message, /localhost:3001/);
    assert.match(message, /ECONNREFUSED/);
    assert.equal(isTransportFailure(err), true);
  });

  it('explains ENOTFOUND for DNS failures', () => {
    const err = Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const message = formatDomainSyncError(err, 'https://provider.dome.app');
    assert.match(message, /Could not resolve/);
    assert.equal(isTransportFailure(err), true);
  });

  it('keeps typed HTTP messages as-is', () => {
    const err = new Error('401 unauthorized');
    assert.equal(formatDomainSyncError(err, 'https://provider.dome.app'), '401 unauthorized');
    assert.equal(isTransportFailure(err), false);
  });
});

describe('domain-sync transport backoff', () => {
  it('skips the domain until backoff elapses, then doubles the delay', () => {
    const tracker = createDomainErrorTracker();
    const t0 = 1_000_000;
    tracker.recordFailure('social', 'Dome Provider is not reachable', { transport: true }, t0);
    assert.equal(tracker.shouldSkip('social', t0 + 1), true);
    assert.equal(tracker.shouldSkip('social', t0 + BACKOFF_MIN_MS + 1), false);
    assert.equal(tracker.getLastError('social'), 'Dome Provider is not reachable');

    tracker.recordFailure('social', 'still down', { transport: true }, t0 + BACKOFF_MIN_MS);
    assert.equal(tracker.shouldSkip('social', t0 + BACKOFF_MIN_MS + BACKOFF_MIN_MS), true);
    assert.equal(tracker.shouldSkip('social', t0 + BACKOFF_MIN_MS + BACKOFF_MIN_MS * 2 + 1), false);
  });

  it('caps backoff and clears it on success', () => {
    const tracker = createDomainErrorTracker();
    let now = 0;
    for (let i = 0; i < 8; i += 1) {
      tracker.recordFailure('social', 'down', { transport: true }, now);
      now += BACKOFF_MAX_MS;
    }
    tracker.recordFailure('social', 'down', { transport: true }, now);
    assert.equal(tracker.shouldSkip('social', now + BACKOFF_MAX_MS - 1), true);
    tracker.recordSuccess('social');
    assert.equal(tracker.shouldSkip('social', now), false);
    assert.equal(tracker.getLastError('social'), null);
  });

  it('records HTTP errors without skipping the next tick', () => {
    const tracker = createDomainErrorTracker();
    tracker.recordFailure('social', '403 gated', { transport: false }, 10);
    assert.equal(tracker.getLastError('social'), '403 gated');
    assert.equal(tracker.shouldSkip('social', 11), false);
  });
});
