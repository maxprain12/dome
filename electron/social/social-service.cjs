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
const {
  SOCIAL_PROVIDER_CAPABILITIES,
  anyProviderSupportsLiveCommentDm,
} = require('./provider-capabilities.cjs');
const {
  commentMatchesHashtag,
  renderReplyTemplate,
} = require('./social-comment-match.cjs');
const { accountSupports } = require('./social-messaging.cjs');

const PROVIDER_MODULES = {
  linkedin: require('./providers/linkedin.cjs'),
  instagram: require('./providers/instagram.cjs'),
  x: require('./providers/x.cjs'),
};

const SCHEDULER_TICK_MS = 60 * 1000;
const METRICS_POLL_MS = 6 * 60 * 60 * 1000;
const COMMENT_POLL_MS = 5 * 60 * 1000;
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
  let commentTimer = null;
  let tickRunning = false;
  let reportRunning = false;
  let commentPollRunning = false;

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
      const eventUrl = String(post.eventCardPublicUrl || '').trim();
      const publishBody = eventUrl && !post.body.includes(eventUrl)
        ? [post.body.trim(), eventUrl].filter(Boolean).join('\n\n')
        : post.body;
      const result = await mod.publishPost(store, { ...post, body: publishBody, accountId: account.id });
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

  /**
   * Pull recent posts that already exist on connected platforms into social_posts
   * (created_by=import), then refresh account + post metrics.
   */
  async function syncPlatformFeed({ accountId = null, limit = 25 } = {}) {
    const accounts = accountId
      ? [store.getAccount(accountId)].filter(Boolean)
      : store.listAccounts().filter((a) => a.status === 'active');
    const results = [];
    let imported = 0;
    let updated = 0;
    for (const account of accounts) {
      const mod = providerModule(account.provider);
      if (typeof mod.listRecentPosts !== 'function') {
        results.push({ accountId: account.id, provider: account.provider, skipped: 'unsupported' });
        continue;
      }
      try {
        const { posts = [], skipped = null, error = null } = await mod.listRecentPosts(
          store,
          account,
          { limit },
        );
        if (skipped || error) {
          results.push({
            accountId: account.id,
            provider: account.provider,
            skipped: skipped || null,
            error: error || null,
            imported: 0,
          });
          continue;
        }
        let accountImported = 0;
        let accountUpdated = 0;
        for (const item of posts) {
          if (!item?.externalPostId) continue;
          const result = store.upsertImportedPost({
            accountId: account.id,
            provider: account.provider,
            body: item.body || '',
            externalPostId: item.externalPostId,
            externalUrl: item.externalUrl || null,
            publishedAt: item.publishedAt,
            metrics: item.metrics || null,
          });
          if (result.skipped) continue;
          if (result.created) {
            imported += 1;
            accountImported += 1;
          } else {
            updated += 1;
            accountUpdated += 1;
          }
        }
        results.push({
          accountId: account.id,
          provider: account.provider,
          fetched: posts.length,
          imported: accountImported,
          updated: accountUpdated,
        });
      } catch (err) {
        console.warn('[Social] syncPlatformFeed', account.provider, err.message);
        results.push({
          accountId: account.id,
          provider: account.provider,
          error: err.message,
        });
      }
    }
    await refreshAllMetrics().catch((err) =>
      console.warn('[Social] metrics after feed sync:', err.message),
    );
    broadcast('social:posts-refresh', { imported, updated });
    broadcast('social:metrics-updated', { source: 'feed-sync' });
    return { imported, updated, accounts: results };
  }

  /** Dashboard summary: counts, accounts, aggregate + per-post latest metrics. */
  function getSummary() {
    const accounts = store.listAccounts();
    const counts = store.countPostsByStatus();
    const latestMetrics = store.listLatestMetrics();
    const metricByPost = new Map(latestMetrics.map((m) => [m.postId, m]));
    const published = store.listRecentPublished({ sinceMs: Date.now() - METRICS_WINDOW_MS, limit: 200 });

    const totals = { impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
    const totalsKnown = {
      impressions: false,
      likes: false,
      comments: false,
      shares: false,
      saves: false,
    };
    const byProvider = {};
    const posts = published.map((post) => {
      const m = metricByPost.get(post.id) || null;
      if (m) {
        for (const key of Object.keys(totals)) {
          if (m[key] != null) {
            totals[key] += m[key];
            totalsKnown[key] = true;
          }
        }
        const agg = (byProvider[post.provider] ||= { posts: 0, impressions: 0, likes: 0, comments: 0 });
        agg.posts += 1;
        if (m.impressions != null) agg.impressions += m.impressions;
        if (m.likes != null) agg.likes += m.likes;
        if (m.comments != null) agg.comments += m.comments;
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

    return {
      accounts,
      counts,
      totals: {
        impressions: totalsKnown.impressions ? totals.impressions : null,
        likes: totalsKnown.likes ? totals.likes : null,
        comments: totalsKnown.comments ? totals.comments : null,
        shares: totalsKnown.shares ? totals.shares : null,
        saves: totalsKnown.saves ? totals.saves : null,
      },
      byProvider,
      recentPosts: posts.slice(0, 50),
      topPosts,
    };
  }

  // ── Growth & AI reports ──────────────────────────────────────────────────

  function getGrowth({ days = 90 } = {}) {
    return { accounts: insights.buildGrowth(store, { days }) };
  }

  /** Single payload for the agentic Social workspace. */
  function getWorkspace() {
    const summary = getSummary();
    const growth = getGrowth({ days: 90 });
    const campaigns = store.listCampaigns({ status: 'active' });
    const metricByPost = new Map(store.listLatestMetrics().map((m) => [m.postId, m]));
    const posts = store.listPosts({ limit: 200 }).map((post) => ({
      ...post,
      metrics: metricByPost.get(post.id) || null,
    }));
    const replyDrafts = store.listReplyDrafts();
    const pendingStatuses = new Set(['pending', 'draft', 'draft_only', '']);
    const replyDraftsPending = replyDrafts.filter((d) => pendingStatuses.has(String(d.status || ''))).length;
    let lastSyncAt = null;
    for (const a of summary.accounts) {
      if (a.lastSyncAt != null && (lastSyncAt == null || a.lastSyncAt > lastSyncAt)) {
        lastSyncAt = a.lastSyncAt;
      }
    }
    return {
      ...summary,
      posts,
      campaigns,
      growth: growth.accounts,
      replyDrafts,
      replyDraftsPending,
      lastSyncAt,
      metricsStale:
        lastSyncAt == null || Date.now() - lastSyncAt > 6 * 60 * 60 * 1000,
    };
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

  function stopScheduler() {
    if (schedulerTimer) clearInterval(schedulerTimer);
    if (metricsTimer) clearInterval(metricsTimer);
    if (reportTimer) clearInterval(reportTimer);
    if (commentTimer) clearInterval(commentTimer);
    schedulerTimer = null;
    metricsTimer = null;
    reportTimer = null;
    commentTimer = null;
  }

  /**
   * Match hashtag → create draft; if mode=live and accountSupports(sendDm), send cold DM.
   */
  async function createDraftFromMatchedComment({
    hashtag,
    commentText,
    replyTemplate,
    provider,
    accountId,
    postId,
    externalCommentId,
    commentAuthor,
    commentAuthorExternalId,
    linkUrl,
    mode = 'live',
  } = {}) {
    if (!commentMatchesHashtag(commentText, hashtag)) {
      return { matched: false, draft: null, liveDmAvailable: anyProviderSupportsLiveCommentDm() };
    }
    if (externalCommentId && store.hasSeenComment(externalCommentId)) {
      return { matched: true, draft: null, skipped: 'already_seen' };
    }
    const replyBody = renderReplyTemplate(replyTemplate || '', {
      hashtag,
      comment: commentText,
      author: commentAuthor,
      link: linkUrl,
    });
    const draft = store.createReplyDraft({
      provider,
      accountId,
      postId,
      externalCommentId,
      hashtag,
      commentText,
      commentAuthor,
      commentAuthorExternalId,
      replyBody,
      linkUrl,
      status: 'draft_only',
    });
    if (externalCommentId) store.markCommentSeen(externalCommentId);
    broadcast('social:drafts-updated', { id: draft.id });

    const account = accountId ? store.serializeAccount(store.getAccount(accountId)) : null;
    const canLive = mode === 'live' && account && accountSupports(account, 'sendDm');
    if (canLive) {
      try {
        const sent = await sendReplyDraft(draft.id);
        return {
          matched: true,
          draft: sent.draft,
          liveDmAvailable: true,
          mode: 'live',
          sent: true,
        };
      } catch (err) {
        store.updateReplyDraft(draft.id, {
          status: 'failed',
          error: err.message,
        });
        broadcast('social:drafts-updated', { id: draft.id, failed: true });
        return {
          matched: true,
          draft: store.listReplyDrafts().find((d) => d.id === draft.id),
          liveDmAvailable: true,
          mode: 'live',
          sent: false,
          error: err.message,
        };
      }
    }

    return {
      matched: true,
      draft,
      liveDmAvailable: Boolean(account && accountSupports(account, 'sendDm')),
      mode: canLive ? 'live' : 'draft_only',
      sent: false,
    };
  }

  async function sendReplyDraft(draftId) {
    const draft = store.listReplyDrafts().find((d) => d.id === draftId);
    if (!draft) throw new Error('Reply draft not found');
    if (draft.status === 'sent' && draft.externalMessageId) {
      return { draft, alreadySent: true };
    }
    const account = store.serializeAccount(store.getAccount(draft.accountId));
    if (!account) throw new Error('Draft has no account');
    if (!accountSupports(account, 'sendDm')) {
      throw new Error(`Account ${account.provider} does not support sendDm with current scopes — reconnect in Settings.`);
    }
    const mod = PROVIDER_MODULES[account.provider];
    if (typeof mod.sendDm !== 'function') {
      throw new Error(`Provider ${account.provider} has no sendDm adapter`);
    }
    const recipientExternalId = draft.commentAuthorExternalId;
    if (!recipientExternalId) {
      throw new Error('Cannot send cold DM: comment author external id missing');
    }
    store.updateReplyDraft(draft.id, { status: 'sending', error: null });
    const { externalMessageId } = await mod.sendDm(store, {
      accountId: account.id,
      recipientExternalId,
      text: draft.replyBody,
    });
    const updated = store.updateReplyDraft(draft.id, {
      status: 'sent',
      externalMessageId,
      sentAt: Date.now(),
      error: null,
    });
    broadcast('social:drafts-updated', { id: draft.id, sent: true });
    return { draft: updated, alreadySent: false };
  }

  /**
   * Poll published posts for new comments and apply live reply rules (cold DM).
   */
  async function pollCommentsAndAutoReply() {
    if (commentPollRunning) return { processed: 0 };
    commentPollRunning = true;
    let processed = 0;
    try {
      const rules = store.getLiveReplyRules().filter((r) => r.enabled !== false);
      if (rules.length === 0) return { processed: 0 };

      const posts = store.listRecentPublished({
        sinceMs: Date.now() - METRICS_WINDOW_MS,
        limit: 40,
      });
      for (const post of posts) {
        if (!post.accountId || !post.externalPostId) continue;
        const account = store.serializeAccount(store.getAccount(post.accountId));
        if (!account || account.status !== 'active') continue;
        if (!accountSupports(account, 'listComments')) continue;
        const mod = PROVIDER_MODULES[account.provider];
        if (typeof mod.listComments !== 'function') continue;

        let comments = [];
        try {
          const page = await mod.listComments(store, {
            accountId: account.id,
            externalPostId: post.externalPostId,
          });
          comments = page.comments || [];
        } catch (err) {
          console.warn(`[Social] listComments ${account.provider}/${post.id}:`, err.message);
          continue;
        }

        for (const comment of comments) {
          if (!comment.id || store.hasSeenComment(comment.id)) continue;
          for (const rule of rules) {
            if (Array.isArray(rule.accountIds) && rule.accountIds.length && !rule.accountIds.includes(account.id)) {
              continue;
            }
            if (Array.isArray(rule.postIds) && rule.postIds.length && !rule.postIds.includes(post.id)) {
              continue;
            }
            const result = await createDraftFromMatchedComment({
              hashtag: rule.hashtag,
              commentText: comment.text,
              replyTemplate: rule.replyTemplate,
              provider: account.provider,
              accountId: account.id,
              postId: post.id,
              externalCommentId: comment.id,
              commentAuthor: comment.authorName,
              commentAuthorExternalId: comment.authorExternalId,
              linkUrl: rule.linkUrl || post.externalUrl || '',
              mode: rule.mode || 'live',
            });
            if (result.matched && !result.skipped) processed += 1;
            if (result.matched) break;
          }
          // Unmatched comments still mark seen so we don't re-scan forever
          if (!store.hasSeenComment(comment.id)) store.markCommentSeen(comment.id);
        }
      }
    } finally {
      commentPollRunning = false;
    }
    if (processed > 0) console.log(`[Social] comment poll processed ${processed} match(es)`);
    return { processed };
  }

  function getIntegrationCapabilities() {
    return {
      liveCommentDm: anyProviderSupportsLiveCommentDm(),
      defaultMode: 'live',
      coldDm: true,
      providers: Object.fromEntries(
        PROVIDERS.map((p) => [
          p,
          {
            supportsManualToken: PROVIDER_MODULES[p].supportsManualToken,
            requiresMedia: PROVIDER_MODULES[p].requiresMedia,
            ...(SOCIAL_PROVIDER_CAPABILITIES[p] || {}),
            commentsEnabled: store.getMessagingCommentsEnabled(p),
            dmEnabled: store.getMessagingDmEnabled(p),
          },
        ]),
      ),
      liveReplyRules: store.getLiveReplyRules(),
    };
  }

  function startScheduler() {
    if (schedulerTimer) return;
    schedulerTimer = setInterval(() => void tick(), SCHEDULER_TICK_MS);
    metricsTimer = setInterval(() => void refreshAllMetrics().catch(() => {}), METRICS_POLL_MS);
    reportTimer = setInterval(() => void maybeGenerateAutoReport().catch(() => {}), REPORT_CHECK_MS);
    commentTimer = setInterval(() => void pollCommentsAndAutoReply().catch(() => {}), COMMENT_POLL_MS);
    setTimeout(() => void tick(), 15 * 1000);
    setTimeout(() => void refreshAllMetrics().catch(() => {}), 90 * 1000);
    setTimeout(() => void maybeGenerateAutoReport().catch(() => {}), 3 * 60 * 1000);
    setTimeout(() => void pollCommentsAndAutoReply().catch(() => {}), 2 * 60 * 1000);
    console.log('[Social] scheduler started (incl. comment/DM poller)');
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
    syncPlatformFeed,
    getSummary,
    getGrowth,
    getWorkspace,
    generateReport,
    startScheduler,
    stopScheduler,
    createDraftFromMatchedComment,
    sendReplyDraft,
    pollCommentsAndAutoReply,
    getIntegrationCapabilities,
  };
}

function getSocialService(database, windowManager) {
  if (!_instance) _instance = createSocialService(database, windowManager);
  return _instance;
}

module.exports = { createSocialService, getSocialService };
