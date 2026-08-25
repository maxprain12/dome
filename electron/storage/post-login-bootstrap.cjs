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
 * Best-effort remote profile probe — a non-empty name means cloud data exists.
 * Extracted so `runPostLoginBootstrap` stays under Sonar S3776.
 *
 * @param {object} database
 * @returns {Promise<boolean>}
 */
async function probeHadRemoteProfile(database) {
  try {
    const profile = await domeOauth.getRemoteProfile(database);
    return Boolean(profile?.name?.trim());
  } catch (err) {
    console.warn('[post-login-bootstrap] profile fetch failed:', err?.message);
    return false;
  }
}

/**
 * Pull each bootstrap domain in order; returns true if any apply count > 0.
 * Extracted so `runPostLoginBootstrap` stays under Sonar S3776.
 *
 * @param {object} deps
 * @param {string[]} domains
 * @param {(payload: object) => void} emit
 * @returns {Promise<boolean>}
 */
async function syncBootstrapDomains(deps, domains, emit) {
  let appliedAny = false;
  for (let i = 0; i < domains.length; i += 1) {
    const domain = domains[i];
    emit({ phase: 'domain', domain, index: i, total: domains.length });
    try {
      const result = await domainSync.syncDomain(deps, domain);
      if (result && typeof result === 'object' && Number(result.applied) > 0) {
        appliedAny = true;
      }
    } catch (err) {
      console.warn(`[post-login-bootstrap] ${domain} sync failed:`, err?.message);
    }
  }
  return appliedAny;
}

/**
 * Vault file bytes + Many session bodies after domain manifests are local.
 * Extracted so `runPostLoginBootstrap` stays under Sonar S3776.
 *
 * @param {object} deps
 * @param {object} db
 * @param {(payload: object) => void} emit
 * @returns {Promise<void>}
 */
async function hydrateBootstrapBlobs(deps, db, emit) {
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

/**
 * Domains the current entitlement unlocks, in dependency order.
 * Extracted so `restoreCloudUiBootstrap` stays under Sonar S3776.
 *
 * @param {string[]} features
 * @returns {string[]}
 */
function selectBootstrapDomains(features) {
  return BOOTSTRAP_DOMAIN_ORDER.filter((d) =>
    features.includes(planGate.featureForDomain(d)),
  );
}

/**
 * Vault + session hydration only when both a db handle and the cloud_sync flag are present.
 * Extracted so `restoreCloudUiBootstrap` stays under Sonar S3776.
 *
 * @param {object} entitlements
 * @param {object | undefined | null} db
 * @returns {boolean}
 */
function shouldHydrateBlobs(entitlements, db) {
  return Boolean(db) && entitlements.features.includes('cloud_sync');
}

/**
 * Settings delta landed from the cloud during this restore (count grew).
 * Extracted so `restoreCloudUiBootstrap` stays under Sonar S3776.
 *
 * @param {object | undefined | null} db
 * @param {number} settingsBefore
 * @returns {boolean}
 */
function settingsLandedFromCloud(db, settingsBefore) {
  return Boolean(db) && settingsSyncBridge.countSyncedSettings(db) > settingsBefore;
}

/**
 * Cloud-UI restore path: ordered domain pulls, optional blob hydration, settings delta.
 * Extracted so `runPostLoginBootstrap` stays under Sonar S3776.
 *
 * @param {object} deps
 * @param {object} entitlements
 * @returns {Promise<boolean>} whether remote data was applied
 */
async function restoreCloudUiBootstrap(deps, entitlements) {
  const { database, windowManager } = deps;
  const db = database.getDB?.();
  const settingsBefore = db ? settingsSyncBridge.countSyncedSettings(db) : 0;
  const emit = (payload) => windowManager?.broadcast?.('domain-sync:progress', payload);

  const domains = selectBootstrapDomains(entitlements.features);
  emit({ phase: 'start', domains });

  let hadRemoteData = await syncBootstrapDomains(deps, domains, emit);

  if (shouldHydrateBlobs(entitlements, db)) {
    await hydrateBootstrapBlobs(deps, db, emit);
  }

  emit({ phase: 'done' });

  if (settingsLandedFromCloud(db, settingsBefore)) {
    hadRemoteData = true;
  }
  return hadRemoteData;
}

/**
 * @param {object} deps
 * @param {object} deps.database
 * @param {object} [deps.windowManager]
 * @returns {Promise<{ hadRemoteData: boolean, entitlements?: object }>}
 */
async function runPostLoginBootstrap(deps) {
  const { database } = deps;
  planGate.invalidateEntitlementsCache();

  const sessionMgr = require('../auth/dome-session-manager.cjs');
  await sessionMgr.refreshSessionIfNeeded();

  const ent = await planGate.getEntitlements(database, { forceRefresh: true });
  let hadRemoteData = await probeHadRemoteProfile(database);

  if (ent.entitlements.showCloudUi) {
    if (await restoreCloudUiBootstrap(deps, ent.entitlements)) {
      hadRemoteData = true;
    }
  }

  return { hadRemoteData, entitlements: ent.entitlements };
}

module.exports = {
  runPostLoginBootstrap,
  BOOTSTRAP_DOMAIN_ORDER,
  probeHadRemoteProfile,
  syncBootstrapDomains,
  hydrateBootstrapBlobs,
  restoreCloudUiBootstrap,
};
