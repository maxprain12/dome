'use strict';

/* eslint-disable no-console */

/**
 * Social service — facade over the store, OAuth flow and per-provider modules.
 * Owns the publish pipeline (draft → scheduled → publishing → published/failed),
 * the scheduler tick for due posts and the periodic metrics polling.
 */

const { createSocialStore, PROVIDERS } = require('./social-store.cjs');
const { createSocialOAuth } = require('./social-oauth.cjs');
const { createSocialReferenceStore } = require('./social-reference-store.cjs');
const { resolvePublicSocial } = require('./social-public-resolver.cjs');
const {
  getRecipes,
  saveRecipes,
  runExploration,
  cancelExploration,
  refreshSuggestions,
  dueScheduledExplorations,
  queueThemeExplorations,
} = require('./social-explorations.cjs');
const { isCachedAvatarUrl, persistSocialAvatar } = require('./social-avatar-cache.cjs');
const { deriveTrends, buildCompetitiveReport, buildFitSuggestions, buildProfileComparison } = require('./social-trends.cjs');
const calendarBridge = require('./social-calendar-bridge.cjs');
const sourceIndex = require('../search/source-index.cjs');
const insights = require('./social-insights.cjs');
const {
  SOCIAL_PROVIDER_CAPABILITIES,
  anyProviderSupportsLiveCommentDm,
} = require('./provider-capabilities.cjs');
const {
  commentMatchesHashtag,
  renderReplyTemplate,
} = require('./social-comment-match.cjs');
const { accountSupports, nestComments } = require('./social-messaging.cjs');
const peopleStore = require('../people/people-store.cjs');
const { selectDuePostsForLocalTick } = require('./social-scheduler.cjs');

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
  const references = createSocialReferenceStore(database);
  let schedulerTimer = null;
  let metricsTimer = null;
  let reportTimer = null;
  let commentTimer = null;
  let tickRunning = false;
  let reportRunning = false;
  let commentPollRunning = false;
  let avatarRefreshPromise = null;
  let explorationJobRunning = false;

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

  function messagingFlags(provider) {
    if (provider === 'linkedin') {
      return { commentsEnabled: store.getLinkedInOrgEnabled() };
    }
    return {
      commentsEnabled: store.getMessagingCommentsEnabled(provider),
      dmEnabled: store.getMessagingDmEnabled(provider),
    };
  }

  // ── Connections ──────────────────────────────────────────────────────────

  async function hydrateAccountAvatar(account) {
    if (!account?.id || isCachedAvatarUrl(account.avatarUrl)) return account;
    let remoteUrl = account.avatarUrl || null;
    try {
      const mod = providerModule(account.provider);
      if (typeof mod.fetchProfile === 'function') {
        const accessToken = typeof mod.ensureAccessToken === 'function'
          ? await mod.ensureAccessToken(store, account.id)
          : store.getAccountTokens(account.id)?.access_token;
        if (accessToken) {
          const profile = await mod.fetchProfile(accessToken, account.externalId);
          if (profile?.avatarUrl) remoteUrl = profile.avatarUrl;
          if (profile?.displayName || profile?.handle || profile?.externalId) {
            store.updateAccountProfile(account.id, {
              displayName: profile.displayName,
              handle: profile.handle,
              externalId: profile.externalId,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Social] avatar profile lookup:', err.message);
    }
    const cached = await persistSocialAvatar({
      remoteUrl,
      provider: account.provider,
      handle: account.handle,
      currentUrl: account.avatarUrl,
    });
    if (cached && cached !== account.avatarUrl) {
      store.updateAccountProfile(account.id, { avatarUrl: cached });
      return store.serializeAccount(store.getAccount(account.id)) || account;
    }
    return store.serializeAccount(store.getAccount(account.id)) || account;
  }

  async function ensureAccountAvatars() {
    if (avatarRefreshPromise) return avatarRefreshPromise;
    avatarRefreshPromise = (async () => {
      try {
        const accounts = store.listAccounts();
        for (const account of accounts) {
          if (isCachedAvatarUrl(account.avatarUrl)) continue;
          try {
            const next = await hydrateAccountAvatar(account);
            if (next?.avatarUrl && next.avatarUrl !== account.avatarUrl) {
              broadcast('social:account-updated', next);
            }
          } catch (err) {
            console.warn('[Social] avatar hydrate:', err.message);
          }
        }
        return store.listAccounts();
      } finally {
        avatarRefreshPromise = null;
      }
    })();
    return avatarRefreshPromise;
  }

  async function connectOAuth(provider) {
    const mod = providerModule(provider);
    const account = await oauth.startConnect(provider, (p, tokenData) =>
      mod.finalizeOAuthAccount(store, tokenData)
    );
    const hydrated = await hydrateAccountAvatar(account);
    broadcast('social:account-updated', hydrated);
    return hydrated;
  }

  async function connectWithToken(provider, accessToken) {
    const mod = providerModule(provider);
    if (!mod.supportsManualToken || !mod.connectWithToken) {
      throw new Error(`${provider} does not support manual token connection — use OAuth.`);
    }
    const account = await mod.connectWithToken(store, { accessToken });
    const hydrated = await hydrateAccountAvatar(account);
    broadcast('social:account-updated', hydrated);
    return hydrated;
  }

  function forgetLocalPost(postId) {
    void calendarBridge.removePostEvent?.(postId);
    try {
      sourceIndex.removeDocument('social_post', postId);
    } catch {
      /* FTS index is optional in tests / older DBs */
    }
  }

  function disconnect(accountId) {
    const result = store.deleteAccount(accountId) || {};
    const deletedPostIds = Array.isArray(result.deletedPostIds) ? result.deletedPostIds : [];
    for (const postId of deletedPostIds) forgetLocalPost(postId);
    broadcast('social:account-updated', { id: accountId, deleted: true });
    broadcast('social:posts-refresh', { deleted: deletedPostIds.length });
    broadcast('social:metrics-updated', { source: 'disconnect' });
  }

  /** Discover/refresh LinkedIn company pages administered by a connected account. */
  async function syncLinkedInOrganizations(accountId) {
    const orgs = await PROVIDER_MODULES.linkedin.syncOrganizations(store, accountId);
    for (const org of orgs) broadcast('social:account-updated', org);
    return orgs;
  }

  function resolveAccountForPost(post) {
    if (!post.accountId) {
      throw new Error('Select an account for this post before publishing.');
    }
    const account = store.getAccount(post.accountId);
    if (!account || account.status !== 'active' || account.provider !== post.provider) {
      throw new Error('The selected account is unavailable or belongs to another network. Select an active account.');
    }
    return account;
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  async function publishPost(postId) {
    const post = store.getPost(postId);
    if (!post) throw new Error(`Social post not found: ${postId}`);
    if (post.status === 'published') throw new Error('Post is already published');
    if (post.status === 'publishing') throw new Error('Post is already being published');

    try {
      const account = resolveAccountForPost(post);
      store.markPostPublishing(postId);
      broadcast('social:post-updated', store.getPost(postId));
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

  async function deletePost(postId) {
    const post = store.getPost(postId);
    if (!post) throw new Error(`Social post not found: ${postId}`);
    let remoteDeleted = false;
    let remoteError = null;
    if (post.externalPostId) {
      const mod = PROVIDER_MODULES[post.provider];
      if (typeof mod?.deleteRemotePost === 'function') {
        try {
          const result = await mod.deleteRemotePost(store, post);
          remoteDeleted = Boolean(result?.remoteDeleted);
        } catch (err) {
          remoteError = err instanceof Error ? err.message : String(err);
          console.warn(`[Social] remote delete failed for ${postId}:`, remoteError);
        }
      }
    }
    store.deletePost(postId);
    broadcast('social:post-updated', { id: postId, deleted: true });
    void calendarBridge.removePostEvent(postId);
    return { deleted: true, remoteDeleted, remoteError };
  }

  // ── Metrics ──────────────────────────────────────────────────────────────

  async function refreshPostMetrics(postId) {
    const post = store.getPost(postId);
    if (!post || post.status !== 'published' || !post.externalPostId || !post.accountId) return null;
    const account = store.getAccount(post.accountId);
    if (!account || account.status !== 'active') return null;
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
  async function refreshAccountMetrics(accountId = null) {
    const accounts = store.listAccounts().filter((a) => a.status === 'active' && (!accountId || a.id === accountId));
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
          database.getQueries().touchSocialAccountSync.run(Date.now(), Date.now(), account.id);
          refreshed += 1;
        }
      } catch (err) {
        console.warn(`[Social] account metrics failed for ${account.id}:`, err.message);
      }
    }
    return refreshed;
  }

  async function refreshAllMetrics(accountId = null) {
    const accountsRefreshed = await refreshAccountMetrics(accountId);
    const posts = store.listRecentPublished({ sinceMs: Date.now() - METRICS_WINDOW_MS, limit: 100 })
      .filter((post) => {
        if (!post.accountId) return false;
        if (accountId && post.accountId !== accountId) return false;
        const owner = store.getAccount(post.accountId);
        return Boolean(owner && owner.status === 'active');
      });
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

  function importPlatformPosts(account, posts, totals) {
    let imported = 0;
    let updated = 0;
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
        media: item.media,
        linkUrl: item.linkUrl,
        source: item.source,
      });
      if (result.skipped) continue;
      if (result.created) {
        totals.imported += 1;
        imported += 1;
      } else {
        totals.updated += 1;
        updated += 1;
      }
    }
    return { imported, updated };
  }

  /**
   * Pull recent posts that already exist on connected platforms into social_posts
   * (created_by=import), then refresh account + post metrics.
   */
  async function syncPlatformFeed({ accountId = null, limit = 25 } = {}) {
    const accounts = accountId
      ? [store.getAccount(accountId)].filter(Boolean)
      : store.listAccounts().filter((a) => a.status === 'active');
    if (accountId && (accounts.length === 0 || accounts[0].status !== 'active')) {
      throw new Error('The selected account is unavailable. Reconnect it before syncing.');
    }
    const results = [];
    const totals = { imported: 0, updated: 0 };
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
        const accountTotals = importPlatformPosts(account, posts, totals);
        database.getQueries().touchSocialAccountSync.run(Date.now(), Date.now(), account.id);
        results.push({
          accountId: account.id,
          provider: account.provider,
          fetched: posts.length,
          imported: accountTotals.imported,
          updated: accountTotals.updated,
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
    await refreshAllMetrics(accountId).catch((err) =>
      console.warn('[Social] metrics after feed sync:', err.message),
    );
    broadcast('social:posts-refresh', { imported: totals.imported, updated: totals.updated });
    broadcast('social:metrics-updated', { source: 'feed-sync' });
    return { imported: totals.imported, updated: totals.updated, accounts: results };
  }

  /** Dashboard summary: counts, accounts, aggregate + per-post latest metrics. */
  function forgetUnlinkedPosts() {
    const purged = typeof store.purgeUnlinkedPosts === 'function' ? store.purgeUnlinkedPosts() : [];
    if (purged.length === 0) return;
    for (const postId of purged) forgetLocalPost(postId);
    broadcast('social:posts-refresh', { deleted: purged.length });
    broadcast('social:metrics-updated', { source: 'orphan-purge' });
  }

  function getSummary() {
    forgetUnlinkedPosts();
    const accounts = store.listAccounts();
    const linkedAccountIds = new Set(accounts.map((account) => account.id));
    const counts = store.countPostsByStatus();
    const latestMetrics = store.listLatestMetrics();
    const metricByPost = new Map(latestMetrics.map((m) => [m.postId, m]));
    const published = store.listRecentPublished({ sinceMs: Date.now() - METRICS_WINDOW_MS, limit: 200 })
      .filter((post) => post.accountId && linkedAccountIds.has(post.accountId));

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
      const due = selectDuePostsForLocalTick(store.listDuePosts(), {
        cloudWorkerProviders: ['instagram'],
        isAccountCloudPublishing: (accountId) => store.isAccountCloudPublishing(accountId),
      });
      if (due.length) {
        console.log(`[Social] scheduler: ${due.length} due post(s)`);
      }
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
    try {
      const runEngine = require('../agents/run-engine.cjs');
      void runEngine.fireContextualAutomations('social_comment_matched').catch((err) => {
        console.warn('[Social] contextual automation:', err?.message || err);
      });
    } catch {
      /* run-engine may not be initialized in isolated tests */
    }

    const account = accountId ? store.serializeAccount(store.getAccount(accountId)) : null;
    const canLive = mode === 'live' && account && accountSupports(account, 'sendDm', messagingFlags(account.provider));
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
      liveDmAvailable: Boolean(account && accountSupports(account, 'sendDm', messagingFlags(account.provider))),
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
    if (!accountSupports(account, 'sendDm', messagingFlags(account.provider))) {
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

  function attachAccountAuthors(comments, account) {
    const handle = String(account?.handle || '').replace(/^@/, '').trim();
    const display = String(account?.displayName || '').trim();
    const ext = String(account?.externalId || account?.external_id || '').trim();
    const handleLc = handle.toLowerCase();
    const walk = (list) => {
      for (const comment of list) {
        const name = String(comment.authorName || '').replace(/^@/, '').trim();
        const own =
          Boolean(ext && comment.authorExternalId && String(comment.authorExternalId) === ext) ||
          Boolean(handleLc && name && name.toLowerCase() === handleLc);
        if (own) {
          comment.isOwnAccount = true;
          if (!comment.authorName) comment.authorName = handle || display || comment.authorName;
        }
        if (Array.isArray(comment.replies) && comment.replies.length) walk(comment.replies);
      }
    };
    walk(comments);
    return comments;
  }

  function attachPeopleToComments(comments, provider, projectId) {
    if (typeof peopleStore.findPersonByIdentity !== 'function') return comments;
    const walk = (list) => {
      for (const comment of list) {
        const person =
          peopleStore.findPersonByIdentity(projectId, provider, comment.authorExternalId) ||
          peopleStore.findPersonByIdentity(projectId, provider, comment.authorName);
        if (person) {
          comment.personId = person.id;
          comment.personDisplayName = person.displayName;
        }
        if (Array.isArray(comment.replies) && comment.replies.length) walk(comment.replies);
      }
    };
    walk(comments);
    return comments;
  }

  /**
   * List public comments for a Dome post (provider listComments).
   * Use only the post’s selected account and call the API
   * even when stored OAuth scopes omit the comment permission (manual tokens /
   * older reconnects). Permission failures return unsupported + reason.
   * @param {{ postId: string, cursor?: string|null, projectId?: string|null }} opts
   */
  async function listPostComments({ postId, cursor = null, projectId = null } = {}) {
    const post = store.getPost(postId);
    if (!post) throw new Error('Post not found');
    if (post.status !== 'published' || !post.externalPostId) {
      return { comments: [], nextCursor: undefined, unsupported: false };
    }

    const account = post.accountId
      ? store.serializeAccount(store.getAccount(post.accountId))
      : null;
    if (!account || account.status !== 'active' || account.provider !== post.provider) {
      return {
        comments: [],
        nextCursor: undefined,
        unsupported: true,
        reason: 'no_account',
      };
    }

    const mod = PROVIDER_MODULES[account.provider];
    if (typeof mod?.listComments !== 'function') {
      return {
        comments: [],
        nextCursor: undefined,
        unsupported: true,
        reason: 'unsupported',
      };
    }

    try {
      const page = await mod.listComments(store, {
        accountId: account.id,
        externalPostId: post.externalPostId,
        cursor: cursor || undefined,
      });
      const nested = nestComments(Array.isArray(page?.comments) ? page.comments : []);
      attachAccountAuthors(nested, account);
      return {
        comments: attachPeopleToComments(nested, account.provider, projectId),
        nextCursor: page?.nextCursor,
        unsupported: false,
      };
    } catch (err) {
      const message = String(err?.message || err);
      const permission = /permission|oauth|scope|#10\b|#200\b|not authorized|insufficient/i.test(
        message,
      );
      console.warn(`[Social] listPostComments ${account.provider}/${post.id}:`, message);
      return {
        comments: [],
        nextCursor: undefined,
        unsupported: true,
        reason: permission ? 'permission' : 'error',
        error: message,
      };
    }
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
        if (!accountSupports(account, 'listComments', messagingFlags(account.provider))) continue;
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

  async function replyToComment({ postId, commentId, text } = {}) {
    const body = String(text || '').trim();
    if (!body) throw new Error('Reply text is empty.');
    const post = store.getPost(postId);
    if (!post) throw new Error('Post not found');
    const account = post.accountId ? store.serializeAccount(store.getAccount(post.accountId)) : null;
    if (!account || account.status !== 'active' || account.provider !== post.provider) {
      throw new Error('The selected account is unavailable. Reconnect it before replying.');
    }
    const mod = providerModule(account.provider);
    if (typeof mod.replyToComment !== 'function') {
      throw new Error(`${account.provider} does not support public comment replies from Dome.`);
    }
    const result = await mod.replyToComment(store, {
      accountId: account.id,
      commentId,
      text: body,
      post,
    });
    broadcast('social:drafts-updated', { commentId, replied: true });
    return result;
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
      accounts: store.listAccounts().map((row) => {
        const account = store.serializeAccount(row);
        const flags = messagingFlags(account.provider);
        return {
          accountId: account.id,
          listComments: account.status === 'active' && accountSupports(account, 'listComments', flags),
          sendDm: account.status === 'active' && accountSupports(account, 'sendDm', flags),
        };
      }),
    };
  }

  async function searchInstagramLocations({ accountId, query }) {
    const account = store.getAccount(accountId);
    if (!account || account.provider !== 'instagram') {
      throw new Error('Instagram account not found');
    }
    return providerModule('instagram').searchLocations(store, account, { query });
  }

  async function resolvePublic(url) {
    return resolvePublicSocial({ store, database }, { url });
  }

  function snapshotTrends({ projectId = 'default', windowDays = 30 } = {}) {
    return deriveTrends(store, references, { projectId, windowDays });
  }

  function competitiveReport({ watchlistId, projectId = 'default' } = {}) {
    const lists = references.ensureDefaultWatchlists(projectId);
    const watchlist = watchlistId
      ? lists.find((item) => item.id === watchlistId)
      : lists.find((item) => item.kind === 'competitor') || lists[0];
    const refs = references.listReferences({ projectId, limit: 200 });
    const handles = new Set(
      (watchlist?.members || []).map((member) => String(member.handle || '').replace(/^@/, '').toLowerCase()).filter(Boolean),
    );
    const urls = new Set((watchlist?.members || []).map((member) => member.profileUrl).filter(Boolean));
    const scoped = watchlist && (handles.size > 0 || urls.size > 0)
      ? refs.filter((ref) => {
          const handle = String(ref.author?.handle || '').replace(/^@/, '').toLowerCase();
          return (handle && handles.has(handle)) || (ref.url && urls.has(ref.url));
        })
      : refs;
    return buildCompetitiveReport({
      ownPosts: store.listPosts({ projectId, limit: 400 }),
      watchlist,
      references: scoped,
    });
  }

  function insightsSnapshot({ projectId = 'default', referenceId, watchlistId } = {}) {
    const report = competitiveReport({ projectId, watchlistId });
    const refs = references.listReferences({ projectId, limit: 200 });
    const selected = referenceId ? refs.find((item) => item.id === referenceId) : refs.find((item) => item.kind === 'profile') || refs[0];
    const accounts = store.listAccounts().filter((account) => account.status === 'active');
    const ownAccount = selected?.provider
      ? accounts.find((account) => account.provider === selected.provider)
      : accounts[0];
    const ownMetric = ownAccount ? store.getLatestAccountMetric?.(ownAccount.id) : null;
    return {
      success: true,
      comparison: buildProfileComparison({ ownAccount, ownMetric, reference: selected }),
      fits: buildFitSuggestions({
        ownPosts: store.listPosts({ projectId, limit: 400 }),
        references: refs,
      }),
      competitive: report,
      selectedReferenceId: selected?.id || null,
    };
  }

  async function runCreatorExploration(input) {
    const result = await runExploration({ store, references, resolvePublic, database }, input);
    broadcast('social:explorations-updated', { exploration: result, personId: input.personId });
    return result;
  }

  async function tickExplorations() {
    if (explorationJobRunning) return;
    explorationJobRunning = true;
    try {
      const queued = references.listQueuedExplorations?.(1)?.[0];
      if (queued) {
        await runCreatorExploration({
          projectId: queued.projectId || 'default',
          personId: queued.personId,
          recipeId: queued.recipeId,
          watchlistKind: queued.watchlistKind,
          explorationId: queued.id,
          theme: queued.payload?.theme || null,
        });
        return;
      }
      const due = dueScheduledExplorations({ store, references, resolvePublic, database }, { projectId: 'default' });
      const next = due[0];
      if (!next) return;
      await runCreatorExploration({ projectId: 'default', ...next });
    } catch (err) {
      console.warn('[Social] exploration tick:', err.message);
    } finally {
      explorationJobRunning = false;
    }
  }

  function startScheduler() {
    if (schedulerTimer) return;
    schedulerTimer = setInterval(() => { void tick().catch((err) => console.warn('[Social] tick:', err.message)); }, SCHEDULER_TICK_MS);
    metricsTimer = setInterval(() => void refreshAllMetrics().catch(() => {}), METRICS_POLL_MS);
    reportTimer = setInterval(() => void maybeGenerateAutoReport().catch(() => {}), REPORT_CHECK_MS);
    commentTimer = setInterval(() => void pollCommentsAndAutoReply().catch(() => {}), COMMENT_POLL_MS);
    setTimeout(() => { void tick().catch((err) => console.warn('[Social] tick:', err.message)); }, 15 * 1000);
    setTimeout(() => {
      ensureAccountAvatars().catch((err) => console.warn('[Social] avatars:', err.message));
    }, 3 * 1000);
    setTimeout(() => {
      refreshSuggestions({ store, references, resolvePublic, database }, { projectId: 'default' });
    }, 20 * 1000);
    setTimeout(() => { void tickExplorations().catch(() => {}); }, 45 * 1000);
    setInterval(() => { void tickExplorations().catch(() => {}); }, 30 * 60 * 1000);
    setTimeout(() => void refreshAllMetrics().catch(() => {}), 90 * 1000);
    setTimeout(() => void maybeGenerateAutoReport().catch(() => {}), 3 * 60 * 1000);
    setTimeout(() => void pollCommentsAndAutoReply().catch(() => {}), 2 * 60 * 1000);
    console.log('[Social] scheduler started (incl. comment/DM poller)');
  }

  return {
    store,
    oauth,
    references,
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
    deletePost,
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
    ensureAccountAvatars,
    createDraftFromMatchedComment,
    sendReplyDraft,
    listPostComments,
    replyToComment,
    pollCommentsAndAutoReply,
    getIntegrationCapabilities,
    searchInstagramLocations,
    resolvePublic,
    snapshotTrends,
    competitiveReport,
    insightsSnapshot,
    runCreatorExploration,
    cancelCreatorExploration: (id) => {
      const result = cancelExploration({ references }, id);
      broadcast('social:explorations-updated', { exploration: result, personId: result?.personId });
      return result;
    },
    listExplorations: (input) => references.listExplorations(input),
    listSuggestions: (input) => references.listSuggestions(input),
    refreshCreatorSuggestions: (input) => refreshSuggestions({ store, references, resolvePublic, database }, input),
    acceptCreatorSuggestion: ({ suggestionId, watchlistKind = 'inspiration', projectId = 'default' }) => {
      const suggestion = references.getSuggestion(suggestionId);
      if (!suggestion) throw new Error('Suggestion not found');
      const lists = references.ensureDefaultWatchlists(projectId);
      const list = lists.find((item) => item.kind === watchlistKind) || lists[0];
      if (!list) throw new Error('Watchlist missing');
      const updated = references.addWatchlistMember(list.id, {
        handle: suggestion.handle,
        provider: suggestion.provider,
        profileUrl: suggestion.profileUrl,
        avatarUrl: suggestion.avatarUrl,
        displayName: suggestion.displayName,
      });
      const member = (updated.members || []).find((item) => {
        const handle = String(suggestion.handle || '').replace(/^@/, '').toLowerCase();
        const itemHandle = String(item.handle || '').replace(/^@/, '').toLowerCase();
        if (handle && itemHandle && handle === itemHandle) return true;
        return Boolean(suggestion.profileUrl && item.profileUrl === suggestion.profileUrl);
      }) || updated.members?.[0] || null;
      return {
        suggestion: references.setSuggestionStatus(suggestionId, 'accepted'),
        member,
      };
    },
    dismissCreatorSuggestion: (suggestionId) => references.setSuggestionStatus(suggestionId, 'dismissed'),
    getExplorationRecipes: () => getRecipes(database),
    saveExplorationRecipes: (recipes) => saveRecipes(database, recipes),
    queueThemeExplorations: async (input) => {
      const result = queueThemeExplorations({ store, references, resolvePublic, database }, input);
      if (result.queued > 0) {
        setTimeout(() => { void tickExplorations().catch(() => {}); }, 0);
      }
      return result;
    },
    tickExplorations,
  };
}

function getSocialService(database, windowManager) {
  if (!_instance) _instance = createSocialService(database, windowManager);
  return _instance;
}

module.exports = { createSocialService, getSocialService };
