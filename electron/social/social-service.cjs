'use strict';

/* eslint-disable no-console */

/**
 * Social service — facade over the store, OAuth flow and per-provider modules.
 * Owns the publish pipeline (draft → scheduled → publishing → published/failed),
 * the scheduler tick for due posts and the periodic metrics polling.
 */

const { createSocialStore, PROVIDERS } = require('./social-store.cjs');
const { createSocialOAuth } = require('./social-oauth.cjs');
const calendarBridge = require('./social-calendar-bridge.cjs');
const insights = require('./social-insights.cjs');

const PROVIDER_MODULES = {
  linkedin: require('./providers/linkedin.cjs'),
  instagram: require('./providers/instagram.cjs'),
  x: require('./providers/x.cjs'),
};

const SCHEDULER_TICK_MS = 60 * 1000;
const METRICS_POLL_MS = 6 * 60 * 60 * 1000;
const METRICS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_SNAPSHOT_MIN_GAP_MS = 30 * 60 * 1000;
const REPORT_CHECK_MS = 60 * 60 * 1000;

let _instance = null;

function createSocialService(database, windowManager) {
  const store = createSocialStore(database);
  const oauth = createSocialOAuth(store);
  let schedulerTimer = null;
  let metricsTimer = null;
  let reportTimer = null;
  let tickRunning = false;
  let reportRunning = false;

  function broadcast(channel, payload) {
    try {
      windowManager?.broadcast?.(channel, payload);
    } catch { /* no windows */ }
  }

  function providerModule(provider) {
    const mod = PROVIDER_MODULES[provider];
    if (!mod) throw new Error(`Unknown social provider: ${provider}`);
    return mod;
  }

  // ── Connections ──────────────────────────────────────────────────────────

  async function connectOAuth(provider) {
    const mod = providerModule(provider);
    const account = await oauth.startConnect(provider, (p, tokenData) =>
      mod.finalizeOAuthAccount(store, tokenData)
    );
    broadcast('social:account-updated', account);
    return account;
  }

  async function connectWithToken(provider, accessToken) {
    const mod = providerModule(provider);
    if (!mod.supportsManualToken || !mod.connectWithToken) {
      throw new Error(`${provider} does not support manual token connection — use OAuth.`);
    }
    const account = await mod.connectWithToken(store, { accessToken });
    broadcast('social:account-updated', account);
    return account;
  }

  function disconnect(accountId) {
    store.deleteAccount(accountId);
    broadcast('social:account-updated', { id: accountId, deleted: true });
  }

  /** Discover/refresh LinkedIn company pages administered by a connected account. */
  async function syncLinkedInOrganizations(accountId) {
    const orgs = await PROVIDER_MODULES.linkedin.syncOrganizations(store, accountId);
    for (const org of orgs) broadcast('social:account-updated', org);
    return orgs;
  }

  function resolveAccountForPost(post) {
    if (post.accountId) {
      const acc = store.getAccount(post.accountId);
      if (acc) return acc;
    }
    const candidates = store.listAccounts(post.provider).filter((a) => a.status === 'active');
    if (candidates.length === 0) {
      throw new Error(`No connected ${post.provider} account. Connect one in Settings → Social.`);
    }
    return store.getAccount(candidates[0].id);
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  async function publishPost(postId) {
    const post = store.getPost(postId);
    if (!post) throw new Error(`Social post not found: ${postId}`);
    if (post.status === 'published') throw new Error('Post is already published');
    if (post.status === 'publishing') throw new Error('Post is already being published');

    const account = resolveAccountForPost(post);
    if (post.accountId !== account.id) {
      store.updatePost(postId, { accountId: account.id });
    }
    store.markPostPublishing(postId);
    broadcast('social:post-updated', store.getPost(postId));

    try {
      const mod = providerModule(post.provider);
      const result = await mod.publishPost(store, { ...post, accountId: account.id });
      const published = store.markPostPublished(postId, result);
      broadcast('social:post-updated', published);
      void calendarBridge.syncPostEvent(published);
      return published;
    } catch (err) {
      console.error(`[Social] publish failed for ${postId}:`, err.message);
      const failed = store.markPostFailed(postId, err.message);
      broadcast('social:post-updated', failed);
      void calendarBridge.syncPostEvent(failed);
      throw err;
    }
  }

  // ── Metrics ──────────────────────────────────────────────────────────────

  async function refreshPostMetrics(postId) {
    const post = store.getPost(postId);
    if (!post || post.status !== 'published' || !post.externalPostId) return null;
    const mod = providerModule(post.provider);
    try {
      const metric = await mod.fetchPostMetrics(store, post);
      if (metric) {
        store.insertMetric(postId, metric);
        if (post.accountId) {
          database.getQueries().touchSocialAccountSync.run(Date.now(), Date.now(), post.accountId);
        }
      }
      return metric ? store.getLatestMetric(postId) : null;
    } catch (err) {
      console.warn(`[Social] metrics refresh failed for ${postId}:`, err.message);
      return null;
    }
  }

  /** Snapshot account-level metrics (followers/following/posts) per active account. */
  async function refreshAccountMetrics() {
    const accounts = store.listAccounts().filter((a) => a.status === 'active');
    let refreshed = 0;
    for (const account of accounts) {
      const mod = PROVIDER_MODULES[account.provider];
      if (typeof mod?.fetchAccountMetrics !== 'function') continue;
      const latest = store.getLatestAccountMetric(account.id);
      if (latest && Date.now() - latest.capturedAt < ACCOUNT_SNAPSHOT_MIN_GAP_MS) continue;
      try {
        const metric = await mod.fetchAccountMetrics(store, account);
        if (metric) {
          store.insertAccountMetric(account.id, metric);
          refreshed += 1;
        }
      } catch (err) {
        console.warn(`[Social] account metrics failed for ${account.id}:`, err.message);
      }
    }
    return refreshed;
  }

  async function refreshAllMetrics() {
    const accountsRefreshed = await refreshAccountMetrics();
    const posts = store.listRecentPublished({ sinceMs: Date.now() - METRICS_WINDOW_MS, limit: 100 });
    let refreshed = 0;
    for (const post of posts) {
      const metric = await refreshPostMetrics(post.id);
      if (metric) refreshed += 1;
    }
    if (refreshed > 0 || accountsRefreshed > 0) {
      broadcast('social:metrics-updated', { refreshed, accountsRefreshed });
    }
    return { total: posts.length, refreshed, accountsRefreshed };
  }

  /** Dashboard summary: counts, accounts, aggregate + per-post latest metrics. */
  function getSummary() {
    const accounts = store.listAccounts();
    const counts = store.countPostsByStatus();
    const latestMetrics = store.listLatestMetrics();
    const metricByPost = new Map(latestMetrics.map((m) => [m.postId, m]));
    const published = store.listRecentPublished({ sinceMs: Date.now() - METRICS_WINDOW_MS, limit: 200 });

    const totals = { impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
    const byProvider = {};
    const posts = published.map((post) => {
      const m = metricByPost.get(post.id) || null;
      if (m) {
        for (const key of Object.keys(totals)) totals[key] += m[key] || 0;
        const agg = (byProvider[post.provider] ||= { posts: 0, impressions: 0, likes: 0, comments: 0 });
        agg.posts += 1;
        agg.impressions += m.impressions || 0;
        agg.likes += m.likes || 0;
        agg.comments += m.comments || 0;
      } else {
        (byProvider[post.provider] ||= { posts: 0, impressions: 0, likes: 0, comments: 0 }).posts += 1;
      }
      return { ...post, metrics: m };
    });

    const topPosts = [...posts]
      .filter((p) => p.metrics)
      .sort((a, b) => {
        const score = (m) => (m.impressions || 0) + (m.likes || 0) * 10 + (m.comments || 0) * 20;
        return score(b.metrics) - score(a.metrics);
      })
      .slice(0, 5);

    return { accounts, counts, totals, byProvider, recentPosts: posts.slice(0, 50), topPosts };
  }

  // ── Growth & AI reports ──────────────────────────────────────────────────

  function getGrowth({ days = 90 } = {}) {
    return { accounts: insights.buildGrowth(store, { days }) };
  }

  async function generateReport({ periodDays, language, trigger = 'user' } = {}) {
    if (reportRunning) throw new Error('A report is already being generated');
    reportRunning = true;
    try {
      return await insights.generateReport(database, store, {
        periodDays,
        language,
        trigger,
        onUpdate: (report) => broadcast('social:report-updated', report),
      });
    } finally {
      reportRunning = false;
    }
  }

  /** Auto-report tick: honors the user-configured interval (0 = disabled). */
  async function maybeGenerateAutoReport() {
    const { intervalHours } = store.getReportConfig();
    if (!intervalHours || reportRunning) return;
    if (store.listAccounts().filter((a) => a.status === 'active').length === 0) return;
    const last = store.getLatestReportByTrigger('auto');
    if (last && Date.now() - last.createdAt < intervalHours * 60 * 60 * 1000) return;
    console.log('[Social] generating scheduled AI report');
    // Fresh metrics first so the report reflects current numbers.
    await refreshAllMetrics().catch(() => {});
    await generateReport({ trigger: 'auto' }).catch((err) =>
      console.warn('[Social] auto report failed:', err.message)
    );
  }

  // ── Scheduler ────────────────────────────────────────────────────────────

  async function tick() {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const due = store.listDuePosts().filter((post) => {
        if (!post.accountId) return true;
        return !store.isAccountCloudPublishing(post.accountId);
      });
      for (const post of due) {
        try {
          await publishPost(post.id);
          console.log(`[Social] scheduled post published: ${post.id} (${post.provider})`);
        } catch (err) {
          console.error(`[Social] scheduled publish failed: ${post.id}:`, err.message);
        }
      }
    } finally {
      tickRunning = false;
    }
  }

  function startScheduler() {
    if (schedulerTimer) return;
    schedulerTimer = setInterval(() => void tick(), SCHEDULER_TICK_MS);
    metricsTimer = setInterval(() => void refreshAllMetrics().catch(() => {}), METRICS_POLL_MS);
    reportTimer = setInterval(() => void maybeGenerateAutoReport().catch(() => {}), REPORT_CHECK_MS);
    // Catch up on due posts shortly after boot; defer metrics/reports to not slow startup.
    setTimeout(() => void tick(), 15 * 1000);
    setTimeout(() => void refreshAllMetrics().catch(() => {}), 90 * 1000);
    setTimeout(() => void maybeGenerateAutoReport().catch(() => {}), 3 * 60 * 1000);
    console.log('[Social] scheduler started');
  }

  function stopScheduler() {
    if (schedulerTimer) clearInterval(schedulerTimer);
    if (metricsTimer) clearInterval(metricsTimer);
    if (reportTimer) clearInterval(reportTimer);
    schedulerTimer = null;
    metricsTimer = null;
    reportTimer = null;
  }

  return {
    store,
    oauth,
    PROVIDERS,
    providerCapabilities: Object.fromEntries(
      PROVIDERS.map((p) => [p, {
        supportsManualToken: PROVIDER_MODULES[p].supportsManualToken,
        requiresMedia: PROVIDER_MODULES[p].requiresMedia,
      }])
    ),
    connectOAuth,
    connectWithToken,
    disconnect,
    syncLinkedInOrganizations,
    publishPost,
    refreshPostMetrics,
    refreshAllMetrics,
    refreshAccountMetrics,
    getSummary,
    getGrowth,
    generateReport,
    startScheduler,
    stopScheduler,
  };
}

function getSocialService(database, windowManager) {
  if (!_instance) _instance = createSocialService(database, windowManager);
  return _instance;
}

module.exports = { createSocialService, getSocialService };
