import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const oauth = require('../auth/dome-oauth.cjs');
const gate = require('../storage/plan-gate.cjs');
const original = { session: oauth.getOrRefreshSession, fetch: oauth.fetchWithDomeAuth };
beforeEach(() => gate.invalidateEntitlementsCache());
afterEach(() => { oauth.getOrRefreshSession = original.session; oauth.fetchWithDomeAuth = original.fetch; gate.invalidateEntitlementsCache(); });
const quota = (features = ['cloud_sync']) => ({ planId: 'custom', subscriptionStatus: 'active', features });
describe('access tiers and capabilities', () => {
  it('never grants cloud access without an account or active subscription', () => {
    assert.equal(gate.buildEntitlements(quota(), false).tier, 'local');
    for (const status of ['unsubscribed', 'canceled', 'past_due', 'unknown']) {
      const result = gate.buildEntitlements({ ...quota(), subscriptionStatus: status });
      assert.equal(result.tier, 'account'); assert.deepEqual(result.features, []);
    }
    assert.equal(gate.buildEntitlements({ ...quota(), subscriptionStatus: 'trialing' }).tier, 'subscription');
  });
  it('respects explicit server denials even on legacy Pro and arbitrary future plans', () => {
    assert.equal(gate.buildEntitlements({ ...quota([]), planId: 'dome_pro' }).hasCloudSync, false);
    assert.equal(gate.buildEntitlements(quota(['social_cloud'])).hasCloudSync, false);
    assert.equal(gate.buildEntitlements(quota(['social_cloud'])).hasSocialCloud, true);
    assert.equal(gate.buildEntitlements({ planId: 'dome_pro', subscriptionStatus: 'active' }).hasCloudSync, true);
  });
  it('does not reuse permissions across account changes', async () => {
    let userId = 'a'; let requests = 0;
    oauth.getOrRefreshSession = async () => ({ connected: true, userId });
    oauth.fetchWithDomeAuth = async () => { requests++; return { ok: true, json: async () => quota(userId === 'a' ? ['cloud_sync'] : []) }; };
    assert.equal((await gate.assertFeature({}, 'cloud_sync')).ok, true);
    userId = 'b';
    assert.equal((await gate.assertFeature({}, 'cloud_sync')).reason, 'feature_not_in_plan');
    assert.equal(requests, 2);
  });
  it('rejects an in-flight response invalidated by logout', async () => {
    oauth.getOrRefreshSession = async () => ({ connected: true, userId: 'a' });
    let resolve;
    oauth.fetchWithDomeAuth = () => new Promise((done) => { resolve = done; });
    const pending = gate.getEntitlements({});
    await new Promise((done) => setImmediate(done));
    gate.invalidateEntitlementsCache();
    resolve({ ok: true, json: async () => quota() });
    assert.equal((await pending).ok, false);
  });
  it('distinguishes missing account from network failure and lets failures retry', async () => {
    oauth.getOrRefreshSession = async () => ({ connected: false });
    assert.equal((await gate.assertFeature({}, 'cloud_sync')).reason, 'account_required');
    oauth.getOrRefreshSession = async () => ({ connected: true, userId: 'a' });
    oauth.fetchWithDomeAuth = async () => { throw new Error('offline'); };
    assert.equal((await gate.assertFeature({}, 'cloud_sync')).reason, 'entitlements_unavailable');
    oauth.fetchWithDomeAuth = async () => ({ ok: true, json: async () => quota() });
    assert.equal((await gate.assertFeature({}, 'cloud_sync')).ok, true);
  });
});
