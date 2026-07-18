'use strict';

/**
 * Runs after a successful Dome account connection (native login, OAuth,
 * dashboard connect). Refreshes entitlements and performs the initial
 * restore: ordered domain pulls (settings first so preferences land before
 * the heavy content domains), then blob hydration (vault files + Many
 * session bodies). Progress is broadcast on `domain-sync:progress` so the
 * renderer can show a first-sync indicator.
 */

/* eslint-disable no-console */

const domeOauth = require('../auth/dome-oauth.cjs');
const planGate = require('./plan-gate.cjs');
const domainSync = require('./domain-sync.cjs');
const settingsSyncBridge = require('./settings-sync-bridge.cjs');

/** Dependency-ordered initial restore (parents/preferences before content). */
const BOOTSTRAP_DOMAIN_ORDER = [
  'settings',
  'library',
  'files',
  'agents',
  'conversations',
  'learn',
  'social',
  'pipelines',
  'calendar',
];

/**
 * @param {object} deps
 * @param {object} deps.database
 * @param {object} [deps.windowManager]
 * @returns {Promise<{ hadRemoteData: boolean, entitlements?: object }>}
 */
async function runPostLoginBootstrap(deps) {
  const { database, windowManager } = deps;
  planGate.invalidateEntitlementsCache();

  const sessionMgr = require('../auth/dome-session-manager.cjs');
  await sessionMgr.refreshSessionIfNeeded();

  const ent = await planGate.getEntitlements(database, { forceRefresh: true });
  let hadRemoteData = false;

  try {
    const profile = await domeOauth.getRemoteProfile(database);
    if (profile?.name?.trim()) hadRemoteData = true;
  } catch (err) {
    console.warn('[post-login-bootstrap] profile fetch failed:', err?.message);
  }

  if (ent.entitlements.showCloudUi) {
    const db = database.getDB?.();
    const settingsBefore = db ? settingsSyncBridge.countSyncedSettings(db) : 0;
    const emit = (payload) => windowManager?.broadcast?.('domain-sync:progress', payload);

    const domains = BOOTSTRAP_DOMAIN_ORDER.filter((d) =>
      ent.entitlements.features.includes(planGate.featureForDomain(d)),
    );
    emit({ phase: 'start', domains });

    for (let i = 0; i < domains.length; i += 1) {
      const domain = domains[i];
      emit({ phase: 'domain', domain, index: i, total: domains.length });
      try {
        const result = await domainSync.syncDomain(deps, domain);
        if (result && typeof result === 'object' && Number(result.applied) > 0) {
          hadRemoteData = true;
        }
      } catch (err) {
        console.warn(`[post-login-bootstrap] ${domain} sync failed:`, err?.message);
      }
    }

    // Bytes: vault files + Many session bodies referenced by the pulled manifests.
    if (ent.entitlements.features.includes('cloud_sync') && db) {
      emit({ phase: 'files' });
      try {
        const blobSync = require('./blob-sync.cjs');
        await blobSync.run(deps);
      } catch (err) {
        console.warn('[post-login-bootstrap] blob hydration failed:', err?.message);
      }
      try {
        const manySessionSync = require('./many-session-sync.cjs');
        await manySessionSync.restoreMissingSessions(deps, db);
      } catch (err) {
        console.warn('[post-login-bootstrap] session restore failed:', err?.message);
      }
    }

    emit({ phase: 'done' });

    if (db && settingsSyncBridge.countSyncedSettings(db) > settingsBefore) {
      hadRemoteData = true;
    }
  }

  return { hadRemoteData, entitlements: ent.entitlements };
}

module.exports = { runPostLoginBootstrap, BOOTSTRAP_DOMAIN_ORDER };
