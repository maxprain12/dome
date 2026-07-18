'use strict';

/* eslint-disable no-console */

/**
 * X (Twitter) provider — API v2 with OAuth 2.0 PKCE user context.
 * Free tier allows posting (limited writes/month); reading tweet metrics
 * needs a paid tier — metric fetch failures are tolerated and logged.
 */

const API = 'https://api.x.com/2';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';

const database = require('../../core/database.cjs');
const fileStorage = require('../../storage/file-storage.cjs');
const { resolveMediaItems, uploadXMedia } = require('../social-media.cjs');
const { normalizeComment } = require('../social-messaging.cjs');

async function xFetch(accessToken, path, options = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.detail || data?.title || text.slice(0, 500);
    const err = new Error(`X API ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function fetchProfile(accessToken) {
  const me = await xFetch(accessToken, '/users/me?user.fields=public_metrics,username,name');
  const u = me?.data;
  if (!u?.id) throw new Error('X: could not load user profile');
  return {
    externalId: u.id,
    displayName: u.name || u.username || 'X',
    handle: u.username ? `@${u.username}` : null,
    followers: u.public_metrics?.followers_count ?? null,
  };
}

async function finalizeOAuthAccount(store, tokenData) {
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error('X: no access_token in token response');
  const profile = await fetchProfile(accessToken);
  const tokens = {
    access_token: accessToken,
    refresh_token: tokenData.refresh_token || null,
    expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
  };
  return upsertAccount(store, profile, tokens, tokenData.scope || null);
}

function upsertAccount(store, profile, tokens, scopes) {
  const existing = store.listAccounts('x').find((a) => a.externalId === profile.externalId);
  if (existing) {
    store.updateAccountTokens(existing.id, tokens, { scopes, status: 'active' });
    store.updateAccountProfile(existing.id, profile);
    return store.serializeAccount(store.getAccount(existing.id));
  }
  return store.serializeAccount(
    store.getAccount(store.createAccount({ provider: 'x', ...profile, tokens, scopes }).id)
  );
}

async function refreshTokens(store, accountId, tokens) {
  const { clientId, clientSecret } = store.getProviderConfig('x');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: clientId,
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret) {
    headers.Authorization = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }
  const res = await fetch(TOKEN_URL, { method: 'POST', headers, body: body.toString() });
  const text = await res.text();
  if (!res.ok) throw new Error(`X token refresh failed: ${res.status} ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
  };
  store.updateAccountTokens(accountId, next, { status: 'active' });
  return next;
}

async function ensureAccessToken(store, accountId) {
  let tokens = store.getAccountTokens(accountId);
  if (!tokens?.access_token) throw new Error('X account has no stored token — reconnect in Settings.');
  const now = Date.now();
  if (tokens.expires_at && tokens.expires_at < now + 60 * 1000) {
    if (!tokens.refresh_token) {
      store.setAccountStatus(accountId, 'expired', 'Access token expired — reconnect in Settings.');
      throw new Error('X token expired — reconnect the account in Settings → Social.');
    }
    try {
      tokens = await refreshTokens(store, accountId, tokens);
    } catch (err) {
      store.setAccountStatus(accountId, 'error', err.message);
      throw err;
    }
  }
  return tokens.access_token;
}

async function publishPost(store, post) {
  const account = store.getAccount(post.accountId);
  if (!account) throw new Error('X account not found for post');
  const accessToken = await ensureAccessToken(store, account.id);

  let text = String(post.body || '');
  if (post.linkUrl && !text.includes(post.linkUrl)) {
    text = text ? `${text}\n${post.linkUrl}` : post.linkUrl;
  }

  // Local files / vault resources → v2 chunked binary upload (needs media.write scope).
  const sources = resolveMediaItems(database, fileStorage, post.media);
  const fileSources = sources.filter((s) => s.kind === 'file');
  if (sources.some((s) => s.kind === 'url')) {
    throw new Error('X cannot ingest external media URLs — attach a local file or a vault resource instead.');
  }
  const videos = fileSources.filter((s) => s.mediaKind === 'video');
  if (videos.length > 1 || (videos.length === 1 && fileSources.length > 1)) {
    throw new Error('X allows one video OR up to 4 images per post');
  }
  const mediaIds = [];
  for (const source of fileSources.slice(0, 4)) {
    mediaIds.push(await uploadXMedia(accessToken, source));
  }

  const body = { text };
  if (mediaIds.length > 0) body.media = { media_ids: mediaIds };
  const result = await xFetch(accessToken, '/tweets', { method: 'POST', body });
  const tweetId = result?.data?.id;
  const handle = (account.handle || '').replace(/^@/, '');
  return {
    externalPostId: tweetId || null,
    externalUrl: tweetId && handle ? `https://x.com/${handle}/status/${tweetId}` : null,
  };
}

async function fetchPostMetrics(store, post) {
  if (!post.externalPostId) return null;
  const account = store.getAccount(post.accountId);
  if (!account) return null;
  const accessToken = await ensureAccessToken(store, account.id);
  const data = await xFetch(
    accessToken,
    `/tweets/${post.externalPostId}?tweet.fields=public_metrics`
  );
  const m = data?.data?.public_metrics;
  if (!m) return null;
  return {
    impressions: m.impression_count ?? null,
    likes: m.like_count ?? null,
    comments: m.reply_count ?? null,
    shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
    saves: m.bookmark_count ?? null,
    raw: data,
  };
}

async function fetchAccountMetrics(store, account) {
  const accessToken = await ensureAccessToken(store, account.id);
  const me = await xFetch(accessToken, '/users/me?user.fields=public_metrics');
  const m = me?.data?.public_metrics;
  if (!m) return null;
  return {
    followers: m.followers_count ?? null,
    following: m.following_count ?? null,
    postsCount: m.tweet_count ?? null,
    raw: me,
  };
}

/**
 * List recent tweets already on X for this account.
 */
async function listRecentPosts(store, account, { limit = 25 } = {}) {
  const accessToken = await ensureAccessToken(store, account.id);
  const userId = account.external_id || account.externalId;
  if (!userId) throw new Error('X account missing external id');
  const capped = Math.min(Math.max(Number(limit) || 25, 5), 50);
  const handle = String(account.handle || '').replace(/^@/, '');
  const data = await xFetch(
    accessToken,
    `/users/${encodeURIComponent(userId)}/tweets` +
      `?max_results=${capped}&exclude=retweets,replies` +
      `&tweet.fields=created_at,public_metrics,text`,
  );
  const posts = (data?.data || []).map((t) => {
    const m = t.public_metrics || {};
    const publishedAt = t.created_at ? Date.parse(t.created_at) : null;
    return {
      externalPostId: String(t.id),
      body: t.text || '',
      externalUrl: handle ? `https://x.com/${handle}/status/${t.id}` : null,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
      metrics: {
        impressions: m.impression_count ?? null,
        likes: m.like_count ?? null,
        comments: m.reply_count ?? null,
        shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
        saves: m.bookmark_count ?? null,
        raw: m,
      },
    };
  });
  return { posts };
}

/**
 * Replies in the conversation of a root tweet (best-effort via recent search).
 */
async function listComments(store, { accountId, externalPostId, cursor } = {}) {
  if (!externalPostId) return { comments: [] };
  const accessToken = await ensureAccessToken(store, accountId);
  const query = encodeURIComponent(`conversation_id:${externalPostId} is:reply`);
  let path =
    `/tweets/search/recent?query=${query}&max_results=50` +
    `&tweet.fields=created_at,author_id,conversation_id,text` +
    `&expansions=author_id&user.fields=name,username`;
  if (cursor) path += `&next_token=${encodeURIComponent(cursor)}`;
  let data;
  try {
    data = await xFetch(accessToken, path);
  } catch (err) {
    // Free tier often lacks search — fall back to empty rather than crashing the poller.
    console.warn('[Social][X] listComments search failed:', err.message);
    return { comments: [] };
  }
  const users = new Map((data?.includes?.users || []).map((u) => [u.id, u]));
  const comments = (data?.data || [])
    .filter((t) => String(t.id) !== String(externalPostId))
    .map((t) => {
      const u = users.get(t.author_id);
      return normalizeComment({
        id: t.id,
        text: t.text,
        authorName: u?.name || u?.username || null,
        authorExternalId: t.author_id || null,
        createdAt: t.created_at,
      });
    });
  return {
    comments,
    nextCursor: data?.meta?.next_token || undefined,
  };
}

/**
 * Cold DM to an X user id.
 */
async function sendDm(store, { accountId, recipientExternalId, text } = {}) {
  if (!recipientExternalId) throw new Error('X DM requires recipientExternalId.');
  if (!String(text || '').trim()) throw new Error('X DM text is empty.');
  const accessToken = await ensureAccessToken(store, accountId);
  const result = await xFetch(
    accessToken,
    `/dm_conversations/with/${encodeURIComponent(recipientExternalId)}/messages`,
    {
      method: 'POST',
      body: { text: String(text).slice(0, 10000) },
    },
  );
  const externalMessageId =
    result?.data?.dm_event_id || result?.data?.id || result?.dm_event_id || null;
  if (!externalMessageId) {
    throw new Error('X DM response missing event id — check dm.write scope and API access tier.');
  }
  return { externalMessageId: String(externalMessageId) };
}

module.exports = {
  finalizeOAuthAccount,
  connectWithToken: null, // X user-context tokens cannot be hand-issued; use OAuth
  ensureAccessToken,
  publishPost,
  fetchPostMetrics,
  fetchAccountMetrics,
  listRecentPosts,
  listComments,
  sendDm,
  supportsManualToken: false,
  requiresMedia: false,
};
