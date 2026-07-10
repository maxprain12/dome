'use strict';

/**
 * Client-side plan / subscription gating for Dome Cloud features.
 * Mirrors dome-provider/lib/cloud-sync-access.ts (contract domain-sync-v1 §4).
 */
/* eslint-disable no-console */

const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');

const CACHE_TTL_MS = 5 * 60_000;
const CLOUD_FEATURES = ['cloud_sync', 'social_cloud', 'pipelines_cloud'];

/** @type {{ at: number, data: object } | null} */
let cache = null;

/**
 * @param {string} planId
 * @param {string[] | undefined} features
 */
function effectiveFeatures(planId, features) {
  const list = Array.isArray(features) ? [...features] : [];
  if (planId === 'dome_pro' && !list.includes('cloud_sync')) list.push('cloud_sync');
  return list;
}

/**
 * @param {Record<string, unknown>} quota
 */
function buildEntitlements(quota) {
  const subscriptionStatus = String(quota.subscriptionStatus ?? 'unsubscribed');
  const subscribed = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const planId = String(quota.planId ?? 'unsubscribed');
  const features = subscribed ? effectiveFeatures(planId, /** @type {string[]} */ (quota.features)) : [];
  const has = (f) => features.includes(f);
  return {
    subscribed,
    planId,
    planName: quota.planName ?? null,
    subscriptionStatus,
    features,
    hasCloudSync: has('cloud_sync'),
    hasSocialCloud: has('social_cloud'),
    hasPipelinesCloud: has('pipelines_cloud'),
    /** Hide all cloud sync UI and block schedulers when false. */
    showCloudUi: subscribed && CLOUD_FEATURES.some((f) => features.includes(f)),
  };
}

/**
 * @param {object} database
 */
async function fetchEntitlements(database) {
  const session = await domeOauth.getOrRefreshSession(database);
  if (!session.connected) {
    return {
      ok: true,
      entitlements: buildEntitlements({ planId: 'unsubscribed', subscriptionStatus: 'unsubscribed' }),
    };
  }
  const url = `${getDomeProviderBaseUrl().replace(/\/$/, '')}/api/v1/me/quota`;
  const res = await domeOauth.fetchWithDomeAuth(database, url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `quota_${res.status}`,
      detail: text,
      entitlements: buildEntitlements({ planId: 'unsubscribed', subscriptionStatus: 'unknown' }),
    };
  }
  const quota = await res.json();
  return { ok: true, entitlements: buildEntitlements(quota) };
}

/**
 * @param {object} database
 * @param {{ forceRefresh?: boolean }} [opts]
 */
async function getEntitlements(database, opts = {}) {
  const now = Date.now();
  if (!opts.forceRefresh && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }
  const result = await fetchEntitlements(database);
  cache = { at: now, data: result };
  return result;
}

function invalidateEntitlementsCache() {
  cache = null;
}

/**
 * @param {object} database
 * @param {string} feature
 */
async function assertFeature(database, feature) {
  const result = await getEntitlements(database);
  const { entitlements } = result;
  if (!entitlements.subscribed) {
    return { ok: false, reason: 'subscription_inactive', entitlements };
  }
  if (!entitlements.features.includes(feature)) {
    return { ok: false, reason: 'feature_not_in_plan', feature, entitlements };
  }
  return { ok: true, entitlements };
}

/**
 * @param {import('./domain-sync.cjs').DomainName} domain
 */
function featureForDomain(domain) {
  /** @type {Record<string, string>} */
  const map = {
    social: 'social_cloud',
    pipelines: 'pipelines_cloud',
    calendar: 'cloud_sync',
    settings: 'cloud_sync',
    actions: 'cloud_sync',
  };
  return map[domain] ?? 'cloud_sync';
}

module.exports = {
  CLOUD_FEATURES,
  getEntitlements,
  invalidateEntitlementsCache,
  assertFeature,
  featureForDomain,
  buildEntitlements,
};
