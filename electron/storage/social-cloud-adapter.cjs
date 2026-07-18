'use strict';

/**
 * Social cloud adapter — credentials vault, media upload, cloud_publishing toggle.
 * Contract: domain-sync-v1.md §1.4, plan feature `social_cloud`.
 */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { getDomeProviderBaseUrl } = require('../ai/dome-provider-url.cjs');
const domeOauth = require('../auth/dome-oauth.cjs');
const planGate = require('./plan-gate.cjs');
const domainSync = require('./domain-sync.cjs');

/**
 * @param {object} database
 * @param {string} accountId
 * @param {Record<string, unknown>} tokens
 */
async function uploadAccountCredentials(database, accountId, tokens) {
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const url = `${base}/api/v1/social/accounts/${encodeURIComponent(accountId)}/credentials`;
  const res = await domeOauth.fetchWithDomeAuth(database, url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens ?? {}),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`credentials_upload_failed:${res.status} ${text}`);
  }
}

/**
 * @param {object} database
 * @param {string} accountId
 */
async function revokeAccountCredentials(database, accountId) {
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const url = `${base}/api/v1/social/accounts/${encodeURIComponent(accountId)}/credentials`;
  const res = await domeOauth.fetchWithDomeAuth(database, url, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`credentials_revoke_failed:${res.status} ${text}`);
  }
}

/**
 * @param {object} database
 * @param {string} filePath
 * @param {string} [mimeType]
 */
async function uploadMediaFile(database, filePath, mimeType) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`media_not_found:${filePath}`);
  const buf = fs.readFileSync(abs);
  const contentType = mimeType || 'application/octet-stream';
  const base = getDomeProviderBaseUrl().replace(/\/$/, '');
  const url = `${base}/api/v1/social/media`;
  const res = await domeOauth.fetchWithDomeAuth(database, url, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buf.length),
      'X-File-Name': path.basename(abs),
    },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`media_upload_failed:${res.status} ${text}`);
  }
  const data = await res.json();
  if (!data?.storagePath) throw new Error('media_upload_missing_storage_path');
  return data.storagePath;
}

/**
 * Ensure the social account row is mirrored in Postgres before credentials vault PUT.
 * @param {object} deps
 * @param {import('better-sqlite3').Database} db
 * @param {string} accountId
 */
async function ensureSocialAccountMirrored(deps, db, accountId) {
  const state = domainSync.getDomainState(db, 'social');
  if (!state.enabled) {
    domainSync.setDomainState(db, 'social', { enabled: true });
  }

  const now = Date.now();
  db.prepare('UPDATE social_accounts SET updated_at = ? WHERE id = ?').run(now, accountId);
  const row = db.prepare('SELECT * FROM social_accounts WHERE id = ?').get(accountId);
  if (!row) throw new Error('account_not_found');

  const rows = {
    social_accounts: [domainSync.sanitizeRowForWire(row, ['credentials'])],
  };

  const pushResult = await domainSync.pushDomainRows(deps, 'social', rows);
  if (!pushResult.success) {
    throw new Error(`domain_push_failed:${pushResult.error || 'unknown'}`);
  }
  const rejected = pushResult.rejectedDetails?.find((r) => r.id === accountId);
  if (rejected) {
    throw new Error(`domain_push_rejected:${rejected.reason || 'unknown'}`);
  }
  return pushResult;
}

/**
 * @param {object} deps
 * @param {object} deps.database
 * @param {ReturnType<import('../social/social-store.cjs').createSocialStore>} store
 * @param {string} accountId
 * @param {boolean} enabled
 */
async function setCloudPublishing(deps, store, accountId, enabled) {
  const gate = await planGate.assertFeature(deps.database, 'social_cloud');
  if (!gate.ok) {
    return { success: false, error: gate.reason, feature: gate.feature };
  }

  const row = store.getAccountRow(accountId);
  if (!row) return { success: false, error: 'account_not_found' };

  const db = deps.database.getDB?.();
  if (!db) return { success: false, error: 'no_database' };

  try {
    await ensureSocialAccountMirrored(deps, db, accountId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }

  if (enabled) {
    const tokens = store.getAccountTokens(accountId);
    if (!tokens) return { success: false, error: 'missing_credentials' };
    await uploadAccountCredentials(deps.database, accountId, tokens);
    store.setCloudPublishing(accountId, true);
  } else {
    await revokeAccountCredentials(deps.database, accountId);
    store.setCloudPublishing(accountId, false);
  }

  await domainSync.pushDomain(deps, 'social');
  planGate.invalidateEntitlementsCache();
  return { success: true, account: store.serializeAccount(store.getAccountRow(accountId)) };
}

/**
 * Upload local media paths for a cloud-enabled post and persist media_storage.
 * @param {object} deps
 * @param {ReturnType<import('../social/social-store.cjs').createSocialStore>} store
 * @param {string} postId
 */
async function syncPostMediaStorage(deps, store, postId) {
  const gate = await planGate.assertFeature(deps.database, 'social_cloud');
  if (!gate.ok) return { success: false, error: gate.reason };

  const post = store.getPostRow(postId);
  if (!post) return { success: false, error: 'post_not_found' };
  if (!post.account_id) return { success: true, skipped: true };

  const account = store.getAccountRow(post.account_id);
  if (!account?.cloud_publishing) return { success: true, skipped: true };

  /** @type {Array<{ type?: string, path?: string, url?: string }>} */
  let media = [];
  try {
    media = JSON.parse(post.media || '[]');
  } catch {
    media = [];
  }

  const storagePaths = [];
  for (const item of media) {
    if (item.path) {
      const storagePath = await uploadMediaFile(deps.database, item.path);
      storagePaths.push(storagePath);
    } else if (item.url?.startsWith('social-media/')) {
      storagePaths.push(item.url);
    }
  }

  store.setPostMediaStorage(postId, storagePaths);
  await domainSync.pushDomain(deps, 'social');
  return { success: true, mediaStorage: storagePaths };
}

module.exports = {
  setCloudPublishing,
  syncPostMediaStorage,
  uploadAccountCredentials,
  revokeAccountCredentials,
  uploadMediaFile,
};
