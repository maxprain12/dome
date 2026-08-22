/**
 * Helpers extracted from runPostLoginBootstrap (S3776).
 * Run: node --test electron/__tests__/post-login-bootstrap.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const domeOauth = require('../auth/dome-oauth.cjs');
const domainSync = require('../storage/domain-sync.cjs');
const planGate = require('../storage/plan-gate.cjs');
const settingsSyncBridge = require('../storage/settings-sync-bridge.cjs');
const {
  probeHadRemoteProfile,
  syncBootstrapDomains,
  hydrateBootstrapBlobs,
  restoreCloudUiBootstrap,
  BOOTSTRAP_DOMAIN_ORDER,
} = require('../storage/post-login-bootstrap.cjs');

describe('BOOTSTRAP_DOMAIN_ORDER', () => {
  it('keeps settings first so preferences land before content domains', () => {
    assert.equal(BOOTSTRAP_DOMAIN_ORDER[0], 'settings');
    assert.ok(BOOTSTRAP_DOMAIN_ORDER.includes('library'));
    assert.ok(BOOTSTRAP_DOMAIN_ORDER.includes('calendar'));
  });
});

describe('probeHadRemoteProfile', () => {
  let original;

  beforeEach(() => {
    original = domeOauth.getRemoteProfile;
  });

  afterEach(() => {
    domeOauth.getRemoteProfile = original;
  });

  it('returns true when remote profile has a non-empty name', async () => {
    domeOauth.getRemoteProfile = async () => ({ name: 'Ada' });
    assert.equal(await probeHadRemoteProfile({}), true);
  });

  it('returns false for blank name or missing profile', async () => {
    domeOauth.getRemoteProfile = async () => ({ name: '  ' });
    assert.equal(await probeHadRemoteProfile({}), false);
    domeOauth.getRemoteProfile = async () => null;
    assert.equal(await probeHadRemoteProfile({}), false);
  });

  it('returns false when profile fetch throws', async () => {
    domeOauth.getRemoteProfile = async () => {
      throw new Error('network');
    };
    assert.equal(await probeHadRemoteProfile({}), false);
  });
});

describe('syncBootstrapDomains', () => {
  let original;

  beforeEach(() => {
    original = domainSync.syncDomain;
  });

  afterEach(() => {
    domainSync.syncDomain = original;
  });

  it('emits domain progress and returns true when any applied > 0', async () => {
    const events = [];
    domainSync.syncDomain = async (_deps, domain) => {
      if (domain === 'library') return { applied: 2 };
      return { applied: 0 };
    };

    const applied = await syncBootstrapDomains({}, ['settings', 'library'], (p) => events.push(p));
    assert.equal(applied, true);
    assert.deepEqual(events, [
      { phase: 'domain', domain: 'settings', index: 0, total: 2 },
      { phase: 'domain', domain: 'library', index: 1, total: 2 },
    ]);
  });

  it('continues after a domain sync failure and returns false when nothing applied', async () => {
    domainSync.syncDomain = async (_deps, domain) => {
      if (domain === 'settings') throw new Error('boom');
      return { applied: 0 };
    };
    const applied = await syncBootstrapDomains({}, ['settings', 'files'], () => {});
    assert.equal(applied, false);
  });
});

describe('hydrateBootstrapBlobs', () => {
  it('emits files phase even when blob/session modules fail', async () => {
    const events = [];
    // Real blob-sync / many-session-sync may throw without full Electron deps;
    // the helper must swallow errors and still emit.
    await hydrateBootstrapBlobs({ database: {} }, {}, (p) => events.push(p));
    assert.deepEqual(events, [{ phase: 'files' }]);
  });
});

describe('restoreCloudUiBootstrap', () => {
  let originalSync;
  let originalFeature;
  let originalCount;

  beforeEach(() => {
    originalSync = domainSync.syncDomain;
    originalFeature = planGate.featureForDomain;
    originalCount = settingsSyncBridge.countSyncedSettings;
  });

  afterEach(() => {
    domainSync.syncDomain = originalSync;
    planGate.featureForDomain = originalFeature;
    settingsSyncBridge.countSyncedSettings = originalCount;
  });

  it('filters domains by entitlement features and marks remote data from settings delta', async () => {
    const events = [];
    let settingsCount = 0;
    planGate.featureForDomain = (d) => `feat_${d}`;
    domainSync.syncDomain = async () => ({ applied: 0 });
    settingsSyncBridge.countSyncedSettings = () => {
      settingsCount += 1;
      return settingsCount === 1 ? 0 : 3;
    };

    const db = {};
    const deps = {
      database: { getDB: () => db },
      windowManager: { broadcast: (_ch, payload) => events.push(payload) },
    };
    const entitlements = {
      features: ['feat_settings', 'feat_library', 'cloud_sync'],
    };

    const hadRemote = await restoreCloudUiBootstrap(deps, entitlements);
    assert.equal(hadRemote, true);
    assert.equal(events[0]?.phase, 'start');
    assert.deepEqual(events[0]?.domains, ['settings', 'library']);
    assert.equal(events.at(-1)?.phase, 'done');
    assert.ok(events.some((e) => e.phase === 'files'));
  });

  it('skips blob hydration without cloud_sync or db', async () => {
    const events = [];
    planGate.featureForDomain = (d) => `feat_${d}`;
    domainSync.syncDomain = async () => ({ applied: 1 });
    settingsSyncBridge.countSyncedSettings = () => 0;

    const deps = {
      database: { getDB: () => null },
      windowManager: { broadcast: (_ch, payload) => events.push(payload) },
    };
    const hadRemote = await restoreCloudUiBootstrap(deps, {
      features: ['feat_settings'],
    });
    assert.equal(hadRemote, true);
    assert.equal(events.some((e) => e.phase === 'files'), false);
  });
});
