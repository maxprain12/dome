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
 * True if a syncDomain result represents applied remote writes.
 * Extracted so `syncBootstrapDomains` stays under Sonar S3776.
 *
 * @param {unknown} result
 * @returns {boolean}
 */
function hasAppliedSyncResult(result) {
  return Boolean(result && typeof result === 'object' && Number(result.applied) > 0);
}

/**
 * Run syncDomain for one bootstrap domain, swallowing errors so a single
 * failure does not abort the bootstrap. Extracted so `syncBootstrapDomains`
 * stays under Sonar S3776.
 *
 * @param {object} deps
 * @param {string} domain
 * @returns {Promise<unknown>}
 */
async function syncOneBootstrapDomain(deps, domain) {
  try {
    return await domainSync.syncDomain(deps, domain);
  } catch (err) {
    console.warn(`[post-login-bootstrap] ${domain} sync failed:`, err?.message);
    return null;
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
    if (hasAppliedSyncResult(await syncOneBootstrapDomain(deps, domain))) {
      appliedAny = true;
    }
  }
  return appliedAny;
}

/**
 * Vault file byte hydration after domain manifests are local. Extracted so
 * `hydrateBootstrapBlobs` stays under Sonar S3776.
 *
 * @param {object} deps
 * @returns {Promise<void>}
 */
async function hydrateVaultBlobsSafe(deps) {
  try {
    const blobSync = require('./blob-sync.cjs');
    await blobSync.run(deps);
  } catch (err) {
    console.warn('[post-login-bootstrap] blob hydration failed:', err?.message);
  }
}

/**
 * Many session body restore after domain manifests are local. Extracted so
 * `hydrateBootstrapBlobs` stays under Sonar S3776.
 *
 * @param {object} deps
 * @param {object} db
 * @returns {Promise<void>}
 */
async function restoreMissingSessionsSafe(deps, db) {
  try {
    const manySessionSync = require('./many-session-sync.cjs');
    await manySessionSync.restoreMissingSessions(deps, db);
  } catch (err) {
    console.warn('[post-login-bootstrap] session restore failed:', err?.message);
  }
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
  await hydrateVaultBlobsSafe(deps);
  await restoreMissingSessionsSafe(deps, db);
}

/**
 * Domains the current plan allows in the bootstrap order. Extracted so
 * `restoreCloudUiBootstrap` stays under Sonar S3776.
 *
 * @param {object} entitlements
 * @returns {string[]}
 */
function selectEnabledBootstrapDomains(entitlements) {
  return BOOTSTRAP_DOMAIN_ORDER.filter((d) =>
    entitlements.features.includes(planGate.featureForDomain(d)),
  );
}

/**
 * Whether the plan has cloud_sync and a local db is available for hydration.
 * Extracted so `restoreCloudUiBootstrap` stays under Sonar S3776.
 *
 * @param {object} entitlements
 * @param {object | null | undefined} db
 * @returns {boolean}
 */
function shouldHydrateBlobs(entitlements, db) {
  return Boolean(db) && entitlements.features.includes('cloud_sync');
}

/**
 * Whether the settings table grew during this bootstrap run. Extracted so
 * `restoreCloudUiBootstrap` stays under Sonar S3776.
 *
 * @param {object | null | undefined} db
 * @param {number} before
 * @returns {boolean}
 */
function settingsCountGrew(db, before) {
  return Boolean(db) && settingsSyncBridge.countSyncedSettings(db) > before;
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
  const domains = selectEnabledBootstrapDomains(entitlements);

  emit({ phase: 'start', domains });

  let hadRemoteData = await syncBootstrapDomains(deps, domains, emit);

  if (shouldHydrateBlobs(entitlements, db)) {
    await hydrateBootstrapBlobs(deps, db, emit);
  }

  emit({ phase: 'done' });

  if (settingsCountGrew(db, settingsBefore)) {
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
