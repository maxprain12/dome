'use strict';

/**
 * Runs after a successful Dome account connection (native login, OAuth, dashboard connect).
 * Refreshes entitlements, pulls domain sync (including settings), and bundle sync.
 */

/* eslint-disable no-console */

const domeOauth = require('../auth/dome-oauth.cjs');
const planGate = require('./plan-gate.cjs');
const domainSync = require('./domain-sync.cjs');
const cloudSync = require('./cloud-sync-service.cjs');
const fileStorage = require('./file-storage.cjs');
const settingsSyncBridge = require('./settings-sync-bridge.cjs');

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

    try {
      const syncResult = await domainSync.syncAllEnabledDomains({ database, windowManager });
      const results = syncResult.results ?? {};
      for (const entry of Object.values(results)) {
        if (entry && typeof entry === 'object' && Number(entry.applied) > 0) {
          hadRemoteData = true;
        }
      }
    } catch (err) {
      console.warn('[post-login-bootstrap] domain sync failed:', err?.message);
    }

    if (db && settingsSyncBridge.countSyncedSettings(db) > settingsBefore) {
      hadRemoteData = true;
    }

    try {
      const db = database.getDB?.();
      const { getLocalRevision } = cloudSync;
      const beforeRev = db ? getLocalRevision(db) : 0;
      const pullResult = await cloudSync.pullAndApply({ database, fileStorage, windowManager });
      if (pullResult?.success && db && getLocalRevision(db) > beforeRev) {
        hadRemoteData = true;
      }
    } catch (err) {
      console.warn('[post-login-bootstrap] bundle pull failed:', err?.message);
    }
  }

  return { hadRemoteData, entitlements: ent.entitlements };
}

module.exports = { runPostLoginBootstrap };
