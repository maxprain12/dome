'use strict';

/* eslint-disable no-console */

/**
 * Social hub store — provider credentials (Settings-configurable, never env-only)
 * and account/post/metric persistence helpers.
 *
 * Provider app credentials (client id/secret) live in the `settings` table so the
 * user configures them from Settings → Social. Secrets are encrypted with the OS
 * keychain (Electron safeStorage) when available; account OAuth tokens are always
 * stored encrypted in `social_accounts.credentials` (BLOB).
 */

const crypto = require('crypto');
const { safeStorage } = require('electron');

const PROVIDERS = ['linkedin', 'instagram', 'x'];

/** Settings keys per provider. Secret-ish fields are encrypted at rest. */
const PROVIDER_CONFIG_FIELDS = {
  linkedin: { clientId: 'social_linkedin_client_id', clientSecret: 'social_linkedin_client_secret' },
  instagram: { clientId: 'social_instagram_app_id', clientSecret: 'social_instagram_app_secret' },
  x: { clientId: 'social_x_client_id', clientSecret: 'social_x_client_secret' },
};
const SECRET_FIELDS = new Set(['clientSecret']);
const OAUTH_PORT_KEY = 'social_oauth_port';
const DEFAULT_OAUTH_PORT = 8737;

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Encrypt a string for the settings table (text column) — prefixed base64. */
function encryptSettingValue(value) {
  const str = String(value ?? '');
  if (!str) return '';
  if (encryptionAvailable()) {
    return 'enc1:' + safeStorage.encryptString(str).toString('base64');
  }
  return 'raw1:' + Buffer.from(str, 'utf8').toString('base64');
}

function decryptSettingValue(stored) {
  const str = String(stored ?? '');
  if (!str) return '';
  if (str.startsWith('enc1:')) {
    try {
      return safeStorage.decryptString(Buffer.from(str.slice(5), 'base64'));
    } catch (err) {
      console.error('[Social] Failed to decrypt setting value:', err.message);
      return '';
    }
  }
  if (str.startsWith('raw1:')) {
    try {
      return Buffer.from(str.slice(5), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return str; // legacy plaintext
}

function createSocialStore(database) {
  const q = () => database.getQueries();

  // ── Provider app credentials (Settings) ──────────────────────────────────

  function getProviderConfig(provider) {
    const fields = PROVIDER_CONFIG_FIELDS[provider];
    if (!fields) throw new Error(`Unknown social provider: ${provider}`);
    const out = {};
    for (const [field, key] of Object.entries(fields)) {
      const row = q().getSetting.get(key);
      const raw = row?.value ?? '';
      out[field] = SECRET_FIELDS.has(field) ? decryptSettingValue(raw) : raw;
    }
    return out;
  }

  function setProviderConfig(provider, config) {
    const fields = PROVIDER_CONFIG_FIELDS[provider];
    if (!fields) throw new Error(`Unknown social provider: ${provider}`);
    const now = Date.now();
    for (const [field, key] of Object.entries(fields)) {
      if (!(field in config)) continue;
      const value = String(config[field] ?? '').trim();
      const stored = SECRET_FIELDS.has(field) && value ? encryptSettingValue(value) : value;
      q().setSetting.run(key, stored, now);
    }
  }

  /** Config summary safe for the renderer: never returns the secret itself. */
  function getProviderConfigStatus(provider) {
    const cfg = getProviderConfig(provider);
    return {
      provider,
      clientId: cfg.clientId || '',
      hasClientSecret: Boolean(cfg.clientSecret),
    };
  }

  function getOAuthPort() {
    const row = q().getSetting.get(OAUTH_PORT_KEY);
    const port = Number.parseInt(row?.value ?? '', 10);
    return Number.isInteger(port) && port > 1024 && port < 65536 ? port : DEFAULT_OAUTH_PORT;
  }

  function setOAuthPort(port) {
    const p = Number.parseInt(port, 10);
    if (!Number.isInteger(p) || p <= 1024 || p >= 65536) throw new Error('Invalid OAuth port');
    q().setSetting.run(OAUTH_PORT_KEY, String(p), Date.now());
  }

  // ── Account token storage (encrypted BLOB) ───────────────────────────────

  function encryptCredentials(obj) {
    const json = JSON.stringify(obj || {});
    if (encryptionAvailable()) return safeStorage.encryptString(json);
    return Buffer.from('raw1:' + json, 'utf8');
  }

  function decryptCredentials(blob) {
    if (!blob) return null;
    try {
      const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
      const asText = buf.toString('utf8');
      if (asText.startsWith('raw1:')) return JSON.parse(asText.slice(5));
      return JSON.parse(safeStorage.decryptString(buf));
    } catch (err) {
      console.error('[Social] Failed to decrypt account credentials:', err.message);
      return null;
    }
  }

  // ── Accounts ─────────────────────────────────────────────────────────────

  function createAccount({ provider, displayName, handle, externalId, tokens, scopes }) {
    if (!PROVIDERS.includes(provider)) throw new Error(`Unknown social provider: ${provider}`);
    const now = Date.now();
    const id = `soc-${provider}-${crypto.randomBytes(6).toString('hex')}`;
    q().createSocialAccount.run(
      id, provider, displayName || null, handle || null, externalId || null,
      encryptCredentials(tokens || {}), scopes || null, 'active', null, now, null, now, now
    );
    return getAccount(id);
  }

  function getAccount(accountId) {
    return q().getSocialAccountById.get(accountId) || null;
  }

  function getAccountTokens(accountId) {
    const row = getAccount(accountId);
    if (!row) return null;
    return decryptCredentials(row.credentials);
  }

  function updateAccountTokens(accountId, tokens, { scopes = null, status = 'active', lastError = null } = {}) {
    const row = getAccount(accountId);
    if (!row) throw new Error(`Social account not found: ${accountId}`);
    q().updateSocialAccountCredentials.run(
      encryptCredentials(tokens || {}), scopes ?? row.scopes, status, lastError, Date.now(), accountId
    );
  }

  function updateAccountProfile(accountId, { displayName, handle, externalId }) {
    const row = getAccount(accountId);
    if (!row) throw new Error(`Social account not found: ${accountId}`);
    q().updateSocialAccountProfile.run(
      displayName ?? row.display_name, handle ?? row.handle, externalId ?? row.external_id,
      Date.now(), accountId
    );
  }

  function setAccountStatus(accountId, status, lastError = null) {
    q().updateSocialAccountStatus.run(status, lastError, Date.now(), accountId);
  }

  function listAccounts(provider = null) {
    const rows = provider
      ? q().listSocialAccountsByProvider.all(provider)
      : q().listSocialAccounts.all();
    return rows.map(serializeAccount);
  }

  function deleteAccount(accountId) {
    q().deleteSocialAccount.run(accountId);
  }

  /** Renderer-safe account shape (credentials never leave the main process). */
  function serializeAccount(row) {
    if (!row) return null;
    return {
      id: row.id,
      provider: row.provider,
      displayName: row.display_name,
      handle: row.handle,
      externalId: row.external_id,
      scopes: row.scopes,
      status: row.status,
      lastError: row.last_error,
      connectedAt: row.connected_at,
      lastSyncAt: row.last_sync_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ── Posts ────────────────────────────────────────────────────────────────

  function parseJsonArray(text) {
    try {
      const v = JSON.parse(text || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function serializePost(row) {
    if (!row) return null;
    return {
      id: row.id,
      accountId: row.account_id,
      provider: row.provider,
      status: row.status,
      body: row.body,
      media: parseJsonArray(row.media),
      linkUrl: row.link_url,
      topics: parseJsonArray(row.topics),
      campaign: row.campaign,
      scheduledAt: row.scheduled_at,
      publishedAt: row.published_at,
      externalPostId: row.external_post_id,
      externalUrl: row.external_url,
      error: row.error,
      createdBy: row.created_by,
      groupId: row.group_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function createPost({
    provider, accountId = null, body = '', media = [], linkUrl = null, topics = [],
    campaign = null, scheduledAt = null, status, createdBy = 'user', groupId = null,
  }) {
    if (!PROVIDERS.includes(provider)) throw new Error(`Unknown social provider: ${provider}`);
    const now = Date.now();
    const id = `sp-${crypto.randomBytes(8).toString('hex')}`;
    const finalStatus = status || (scheduledAt ? 'scheduled' : 'draft');
    q().createSocialPost.run(
      id, accountId, provider, finalStatus, String(body || ''),
      JSON.stringify(media || []), linkUrl, JSON.stringify(topics || []), campaign,
      scheduledAt, null, null, null, null, createdBy, groupId, now, now
    );
    return serializePost(q().getSocialPostById.get(id));
  }

  function getPost(postId) {
    return serializePost(q().getSocialPostById.get(postId));
  }

  function getPostRow(postId) {
    return q().getSocialPostById.get(postId) || null;
  }

  function updatePost(postId, patch = {}) {
    const row = q().getSocialPostById.get(postId);
    if (!row) throw new Error(`Social post not found: ${postId}`);
    if (row.status === 'published') throw new Error('Cannot edit a published post');
    const next = {
      accountId: patch.accountId !== undefined ? patch.accountId : row.account_id,
      body: patch.body !== undefined ? String(patch.body) : row.body,
      media: patch.media !== undefined ? JSON.stringify(patch.media || []) : row.media,
      linkUrl: patch.linkUrl !== undefined ? patch.linkUrl : row.link_url,
      topics: patch.topics !== undefined ? JSON.stringify(patch.topics || []) : row.topics,
      campaign: patch.campaign !== undefined ? patch.campaign : row.campaign,
      scheduledAt: patch.scheduledAt !== undefined ? patch.scheduledAt : row.scheduled_at,
    };
    let status = patch.status !== undefined ? patch.status : row.status;
    if (patch.status === undefined) {
      if (next.scheduledAt && row.status === 'draft') status = 'scheduled';
      if (!next.scheduledAt && row.status === 'scheduled') status = 'draft';
    }
    q().updateSocialPostContent.run(
      next.accountId, next.body, next.media, next.linkUrl, next.topics, next.campaign,
      next.scheduledAt, status, Date.now(), postId
    );
    return getPost(postId);
  }

  function markPostPublishing(postId) {
    const row = q().getSocialPostById.get(postId);
    if (!row) throw new Error(`Social post not found: ${postId}`);
    q().updateSocialPostPublishResult.run('publishing', row.published_at, row.external_post_id, row.external_url, null, Date.now(), postId);
  }

  function markPostPublished(postId, { externalPostId = null, externalUrl = null } = {}) {
    q().updateSocialPostPublishResult.run('published', Date.now(), externalPostId, externalUrl, null, Date.now(), postId);
    return getPost(postId);
  }

  function markPostFailed(postId, error) {
    const row = q().getSocialPostById.get(postId);
    if (!row) return null;
    q().updateSocialPostPublishResult.run('failed', row.published_at, row.external_post_id, row.external_url, String(error || 'Unknown error').slice(0, 2000), Date.now(), postId);
    return getPost(postId);
  }

  function listPosts({ status = null, limit = 100 } = {}) {
    const capped = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const rows = status
      ? q().listSocialPostsByStatus.all(status, capped)
      : q().listSocialPosts.all(capped);
    return rows.map(serializePost);
  }

  function listDuePosts(now = Date.now()) {
    return q().listDueSocialPosts.all(now).map(serializePost);
  }

  function listRecentPublished({ sinceMs, limit = 50 } = {}) {
    const since = sinceMs ?? Date.now() - 14 * 24 * 60 * 60 * 1000;
    return q().listRecentPublishedSocialPosts.all(since, Math.min(limit, 200)).map(serializePost);
  }

  function deletePost(postId) {
    q().deleteSocialPost.run(postId);
  }

  function countPostsByStatus() {
    const out = { draft: 0, scheduled: 0, publishing: 0, published: 0, failed: 0 };
    for (const row of q().countSocialPostsByStatus.all()) out[row.status] = row.c;
    return out;
  }

  // ── Metrics ──────────────────────────────────────────────────────────────

  function serializeMetric(row) {
    if (!row) return null;
    return {
      id: row.id,
      postId: row.post_id,
      capturedAt: row.captured_at,
      impressions: row.impressions,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      saves: row.saves,
      clicks: row.clicks,
      followers: row.followers,
    };
  }

  function insertMetric(postId, metric) {
    const id = `sm-${crypto.randomBytes(8).toString('hex')}`;
    q().insertSocialMetric.run(
      id, postId, Date.now(),
      metric.impressions ?? null, metric.likes ?? null, metric.comments ?? null,
      metric.shares ?? null, metric.saves ?? null, metric.clicks ?? null,
      metric.followers ?? null, metric.raw ? JSON.stringify(metric.raw).slice(0, 20000) : null
    );
  }

  function getLatestMetric(postId) {
    return serializeMetric(q().getLatestSocialMetricForPost.get(postId));
  }

  function listMetricsForPost(postId) {
    return q().listSocialMetricsForPost.all(postId).map(serializeMetric);
  }

  function listLatestMetrics() {
    return q().listLatestSocialMetrics.all().map(serializeMetric);
  }

  return {
    PROVIDERS,
    encryptionAvailable,
    getProviderConfig,
    setProviderConfig,
    getProviderConfigStatus,
    getOAuthPort,
    setOAuthPort,
    createAccount,
    getAccount,
    getAccountTokens,
    updateAccountTokens,
    updateAccountProfile,
    setAccountStatus,
    listAccounts,
    deleteAccount,
    serializeAccount,
    createPost,
    getPost,
    getPostRow,
    updatePost,
    markPostPublishing,
    markPostPublished,
    markPostFailed,
    listPosts,
    listDuePosts,
    listRecentPublished,
    deletePost,
    countPostsByStatus,
    insertMetric,
    getLatestMetric,
    listMetricsForPost,
    listLatestMetrics,
  };
}

module.exports = { createSocialStore, PROVIDERS, DEFAULT_OAUTH_PORT };
