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
const syncTombstone = require('../storage/sync-tombstone.cjs');

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
const LINKEDIN_ORG_KEY = 'social_linkedin_org_enabled';
const REPLY_DRAFTS_KEY = 'social_reply_drafts_v1';
const COMMENT_SEEN_KEY = 'social_comment_seen_v1';
const LIVE_REPLY_RULES_KEY = 'social_live_reply_rules_v1';
const ACCOUNT_KINDS = ['member', 'organization'];
const MAX_REPLY_DRAFTS = 200;
const MAX_SEEN_COMMENTS = 2000;

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
    const status = {
      provider,
      clientId: cfg.clientId || '',
      hasClientSecret: Boolean(cfg.clientSecret),
    };
    if (provider === 'linkedin') status.orgEnabled = getLinkedInOrgEnabled();
    return status;
  }

  /** LinkedIn company-page mode: adds organization scopes to the OAuth request. */
  function getLinkedInOrgEnabled() {
    return q().getSetting.get(LINKEDIN_ORG_KEY)?.value === '1';
  }

  function setLinkedInOrgEnabled(enabled) {
    q().setSetting.run(LINKEDIN_ORG_KEY, enabled ? '1' : '0', Date.now());
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

  function createAccount({ provider, accountKind = 'member', displayName, handle, externalId, tokens, scopes }) {
    if (!PROVIDERS.includes(provider)) throw new Error(`Unknown social provider: ${provider}`);
    if (!ACCOUNT_KINDS.includes(accountKind)) throw new Error(`Unknown account kind: ${accountKind}`);
    const now = Date.now();
    const id = `soc-${provider}-${crypto.randomBytes(6).toString('hex')}`;
    q().createSocialAccount.run(
      id, provider, accountKind, displayName || null, handle || null, externalId || null,
      encryptCredentials(tokens || {}), scopes || null, 'active', null, now, null, now, now
    );
    return getAccount(id);
  }

  function getAccount(accountId) {
    return q().getSocialAccountById.get(accountId) || null;
  }

  function getAccountRow(accountId) {
    return getAccount(accountId);
  }

  function isAccountCloudPublishing(accountId) {
    const row = getAccount(accountId);
    return row?.cloud_publishing === 1;
  }

  function setCloudPublishing(accountId, enabled) {
    const row = getAccount(accountId);
    if (!row) throw new Error(`Social account not found: ${accountId}`);
    q().updateSocialAccountCloudPublishing.run(enabled ? 1 : 0, Date.now(), accountId);
  }

  function setPostMediaStorage(postId, storagePaths) {
    const row = q().getSocialPostById.get(postId);
    if (!row) throw new Error(`Social post not found: ${postId}`);
    q().updateSocialPostMediaStorage.run(JSON.stringify(storagePaths || []), Date.now(), postId);
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
    const db = database.getDB?.();
    if (db) syncTombstone.recordTombstone(db, 'social_accounts', accountId);
    q().deleteSocialAccount.run(accountId);
  }

  /** Renderer-safe account shape (credentials never leave the main process). */
  function serializeAccount(row) {
    if (!row) return null;
    return {
      id: row.id,
      provider: row.provider,
      accountKind: row.account_kind || 'member',
      displayName: row.display_name,
      handle: row.handle,
      externalId: row.external_id,
      scopes: row.scopes,
      status: row.status,
      lastError: row.last_error,
      connectedAt: row.connected_at,
      lastSyncAt: row.last_sync_at,
      cloudPublishing: row.cloud_publishing === 1,
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
      mediaStorage: parseJsonArray(row.media_storage),
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
    const db = database.getDB?.();
    if (db) syncTombstone.recordTombstone(db, 'social_posts', postId);
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
    const capturedAt = Date.now();
    q().insertSocialMetric.run(
      id, postId, capturedAt,
      metric.impressions ?? null, metric.likes ?? null, metric.comments ?? null,
      metric.shares ?? null, metric.saves ?? null, metric.clicks ?? null,
      metric.followers ?? null, metric.raw ? JSON.stringify(metric.raw).slice(0, 20000) : null,
      capturedAt,
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

  // ── Account metrics (growth snapshots) ───────────────────────────────────

  function serializeAccountMetric(row) {
    if (!row) return null;
    return {
      id: row.id,
      accountId: row.account_id,
      capturedAt: row.captured_at,
      followers: row.followers,
      following: row.following,
      postsCount: row.posts_count,
    };
  }

  function insertAccountMetric(accountId, metric) {
    const id = `sam-${crypto.randomBytes(8).toString('hex')}`;
    const capturedAt = Date.now();
    q().insertSocialAccountMetric.run(
      id, accountId, capturedAt,
      metric.followers ?? null, metric.following ?? null, metric.postsCount ?? null,
      metric.raw ? JSON.stringify(metric.raw).slice(0, 20000) : null,
      capturedAt,
    );
    return serializeAccountMetric(q().getLatestSocialAccountMetric.get(accountId));
  }

  function getLatestAccountMetric(accountId) {
    return serializeAccountMetric(q().getLatestSocialAccountMetric.get(accountId));
  }

  function listAccountMetrics(accountId, sinceMs) {
    return q().listSocialAccountMetrics.all(accountId, sinceMs ?? 0).map(serializeAccountMetric);
  }

  function listLatestAccountMetrics() {
    return q().listLatestSocialAccountMetrics.all().map(serializeAccountMetric);
  }

  // ── AI reports ───────────────────────────────────────────────────────────

  function serializeReport(row) {
    if (!row) return null;
    let data = null;
    try {
      data = row.data ? JSON.parse(row.data) : null;
    } catch { /* keep null */ }
    return {
      id: row.id,
      status: row.status,
      trigger: row.trigger,
      periodDays: row.period_days,
      title: row.title,
      content: row.content,
      model: row.model,
      error: row.error,
      data,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  function createReport({ trigger = 'user', periodDays = 30 } = {}) {
    const id = `srp-${crypto.randomBytes(8).toString('hex')}`;
    q().createSocialReport.run(id, 'generating', trigger, periodDays, null, null, null, null, null, Date.now(), null);
    return getReport(id);
  }

  function markReportReady(reportId, { title, content, model, data }) {
    q().updateSocialReportResult.run(
      'ready', title || null, content || null, model || null, null,
      data ? JSON.stringify(data).slice(0, 100000) : null, Date.now(), reportId
    );
    return getReport(reportId);
  }

  function markReportFailed(reportId, error) {
    q().updateSocialReportResult.run(
      'failed', null, null, null, String(error || 'Unknown error').slice(0, 2000), null, Date.now(), reportId
    );
    return getReport(reportId);
  }

  function getReport(reportId) {
    return serializeReport(q().getSocialReportById.get(reportId));
  }

  function listReports(limit = 30) {
    return q().listSocialReports.all(Math.min(Math.max(Number(limit) || 30, 1), 100)).map(serializeReport);
  }

  function getLatestReportByTrigger(trigger) {
    return serializeReport(q().getLatestSocialReportByTrigger.get(trigger));
  }

  function deleteReport(reportId) {
    q().deleteSocialReport.run(reportId);
  }

  // ── Report scheduling config (settings) ──────────────────────────────────

  const REPORT_INTERVAL_KEY = 'social_report_interval_hours';
  const REPORT_PERIOD_KEY = 'social_report_period_days';
  const REPORT_LANG_KEY = 'social_report_language';

  function getReportConfig() {
    const readInt = (key, fallback, min, max) => {
      const v = Number.parseInt(q().getSetting.get(key)?.value ?? '', 10);
      return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
    };
    return {
      intervalHours: readInt(REPORT_INTERVAL_KEY, 0, 0, 24 * 90),
      periodDays: readInt(REPORT_PERIOD_KEY, 30, 7, 365),
      language: q().getSetting.get(REPORT_LANG_KEY)?.value || 'es',
    };
  }

  function setReportConfig({ intervalHours, periodDays, language } = {}) {
    const now = Date.now();
    if (intervalHours !== undefined) q().setSetting.run(REPORT_INTERVAL_KEY, String(intervalHours), now);
    if (periodDays !== undefined) q().setSetting.run(REPORT_PERIOD_KEY, String(periodDays), now);
    if (language !== undefined) q().setSetting.run(REPORT_LANG_KEY, String(language), now);
    return getReportConfig();
  }

  // ── Reply drafts (plan 014 draft_only — no live DM until provider caps) ──

  function listReplyDrafts() {
    try {
      const raw = q().getSetting.get(REPLY_DRAFTS_KEY)?.value;
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveReplyDrafts(list) {
    const trimmed = (Array.isArray(list) ? list : []).slice(0, MAX_REPLY_DRAFTS);
    q().setSetting.run(REPLY_DRAFTS_KEY, JSON.stringify(trimmed), Date.now());
    return trimmed;
  }

  function createReplyDraft(input = {}) {
    const draft = {
      id: `srd-${crypto.randomBytes(8).toString('hex')}`,
      status: input.status || 'draft_only',
      provider: input.provider || null,
      accountId: input.accountId || null,
      postId: input.postId || null,
      externalCommentId: input.externalCommentId || null,
      hashtag: input.hashtag || null,
      commentText: input.commentText || null,
      commentAuthor: input.commentAuthor || null,
      replyBody: String(input.replyBody || ''),
      linkUrl: input.linkUrl || null,
      commentAuthorExternalId: input.commentAuthorExternalId || null,
      externalMessageId: null,
      sentAt: null,
      error: null,
      createdAt: Date.now(),
    };
    saveReplyDrafts([draft, ...listReplyDrafts()]);
    return draft;
  }

  function dismissReplyDraft(draftId) {
    const id = String(draftId || '');
    if (!id) return { deleted: false };
    saveReplyDrafts(listReplyDrafts().filter((d) => d.id !== id));
    return { deleted: true };
  }

  function updateReplyDraft(draftId, patch = {}) {
    const id = String(draftId || '');
    const list = listReplyDrafts();
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
    saveReplyDrafts(list);
    return list[idx];
  }

  function listSeenCommentIds() {
    try {
      const raw = q().getSetting.get(COMMENT_SEEN_KEY)?.value;
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function markCommentSeen(externalCommentId) {
    const id = String(externalCommentId || '');
    if (!id) return;
    const next = [id, ...listSeenCommentIds().filter((x) => x !== id)].slice(0, MAX_SEEN_COMMENTS);
    q().setSetting.run(COMMENT_SEEN_KEY, JSON.stringify(next), Date.now());
  }

  function hasSeenComment(externalCommentId) {
    return listSeenCommentIds().includes(String(externalCommentId || ''));
  }

  /** Default live: cold DM automation for #Curso (plan 018 product decisions). */
  function getLiveReplyRules() {
    try {
      const raw = q().getSetting.get(LIVE_REPLY_RULES_KEY)?.value;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch { /* fall through */ }
    return [
      {
        id: 'default-curso',
        enabled: true,
        mode: 'live',
        hashtag: 'Curso',
        replyTemplate:
          'Hola {{author}}! Gracias por tu interés en #{{hashtag}}. Aquí tienes el enlace: {{link}}',
        linkUrl: '',
        accountIds: null,
        postIds: null,
      },
    ];
  }

  function setLiveReplyRules(rules) {
    const list = Array.isArray(rules) ? rules : [];
    q().setSetting.run(LIVE_REPLY_RULES_KEY, JSON.stringify(list), Date.now());
    return getLiveReplyRules();
  }

  function messagingFlagKey(provider, kind) {
    return `social_${provider}_messaging_${kind}`;
  }

  /** Defaults to enabled (true) when unset — matches product decision for live cold DM. */
  function getMessagingCommentsEnabled(provider) {
    const v = q().getSetting.get(messagingFlagKey(provider, 'comments'))?.value;
    if (v === '0') return false;
    return true;
  }

  function setMessagingCommentsEnabled(provider, enabled) {
    q().setSetting.run(messagingFlagKey(provider, 'comments'), enabled ? '1' : '0', Date.now());
    return getMessagingCommentsEnabled(provider);
  }

  function getMessagingDmEnabled(provider) {
    const v = q().getSetting.get(messagingFlagKey(provider, 'dm'))?.value;
    if (v === '0') return false;
    return true;
  }

  function setMessagingDmEnabled(provider, enabled) {
    q().setSetting.run(messagingFlagKey(provider, 'dm'), enabled ? '1' : '0', Date.now());
    return getMessagingDmEnabled(provider);
  }

  return {
    PROVIDERS,
    encryptionAvailable,
    getProviderConfig,
    setProviderConfig,
    getProviderConfigStatus,
    getLinkedInOrgEnabled,
    setLinkedInOrgEnabled,
    getOAuthPort,
    setOAuthPort,
    createAccount,
    getAccount,
    getAccountRow,
    isAccountCloudPublishing,
    setCloudPublishing,
    setPostMediaStorage,
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
    insertAccountMetric,
    getLatestAccountMetric,
    listAccountMetrics,
    listLatestAccountMetrics,
    createReport,
    markReportReady,
    markReportFailed,
    getReport,
    listReports,
    getLatestReportByTrigger,
    deleteReport,
    getReportConfig,
    setReportConfig,
    listReplyDrafts,
    createReplyDraft,
    dismissReplyDraft,
    updateReplyDraft,
    hasSeenComment,
    markCommentSeen,
    getLiveReplyRules,
    setLiveReplyRules,
    getMessagingCommentsEnabled,
    setMessagingCommentsEnabled,
    getMessagingDmEnabled,
    setMessagingDmEnabled,
  };
}

module.exports = { createSocialStore, PROVIDERS, DEFAULT_OAUTH_PORT };
