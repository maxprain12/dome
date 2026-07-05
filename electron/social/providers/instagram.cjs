'use strict';

/* eslint-disable no-console */

/**
 * Instagram provider — "Instagram API with Instagram Login" (graph.instagram.com).
 * Needs a professional (Business/Creator) Instagram account and a Meta app with
 * the Instagram product. The dashboard token generator is the easiest way to
 * connect (paste the token in Settings); OAuth loopback also works while the
 * Meta app is in development mode.
 *
 * Publishing requires publicly reachable media URLs (Instagram fetches them),
 * so image posts must reference an https URL, not a local file.
 */

const GRAPH = 'https://graph.instagram.com/v23.0';
const CONTAINER_POLL_MS = 2000;
const CONTAINER_POLL_MAX = 15;
const VIDEO_POLL_MAX = 150; // video processing can take minutes

const database = require('../../core/database.cjs');
const fileStorage = require('../../storage/file-storage.cjs');
const { resolveMediaItems } = require('../social-media.cjs');

async function igFetch(path, { method = 'GET', params = {}, accessToken } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  if (accessToken) url.searchParams.set('access_token', accessToken);
  const res = await fetch(url, { method });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || text.slice(0, 500);
    const err = new Error(`Instagram API ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function fetchProfile(accessToken) {
  const me = await igFetch('/me', {
    accessToken,
    params: { fields: 'user_id,username,name,followers_count' },
  });
  return {
    externalId: String(me.user_id || me.id),
    displayName: me.name || me.username || 'Instagram',
    handle: me.username ? `@${me.username}` : null,
    followers: me.followers_count ?? null,
  };
}

async function exchangeLongLived(store, shortToken) {
  const { clientSecret } = store.getProviderConfig('instagram');
  if (!clientSecret) return { access_token: shortToken, expires_in: null };
  const data = await igFetch('https://graph.instagram.com/access_token', {
    params: { grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: shortToken },
  });
  return data;
}

async function finalizeOAuthAccount(store, tokenData) {
  const shortToken = tokenData.access_token;
  if (!shortToken) throw new Error('Instagram: no access_token in token response');
  const longLived = await exchangeLongLived(store, shortToken).catch((err) => {
    console.warn('[Social][IG] long-lived exchange failed, keeping short token:', err.message);
    return { access_token: shortToken, expires_in: 3600 };
  });
  const profile = await fetchProfile(longLived.access_token);
  const tokens = {
    access_token: longLived.access_token,
    expires_at: longLived.expires_in ? Date.now() + longLived.expires_in * 1000 : null,
    obtained_at: Date.now(),
  };
  return upsertAccount(store, profile, tokens, tokenData.permissions?.join?.(',') || null);
}

async function connectWithToken(store, { accessToken }) {
  const profile = await fetchProfile(accessToken);
  const tokens = {
    access_token: accessToken,
    // Dashboard-generated tokens are long-lived (~60 days); refresh keeps them alive.
    expires_at: Date.now() + 60 * 24 * 60 * 60 * 1000,
    obtained_at: Date.now(),
  };
  return upsertAccount(store, profile, tokens, null);
}

function upsertAccount(store, profile, tokens, scopes) {
  const existing = store
    .listAccounts('instagram')
    .find((a) => a.externalId === profile.externalId);
  if (existing) {
    store.updateAccountTokens(existing.id, tokens, { scopes, status: 'active' });
    store.updateAccountProfile(existing.id, profile);
    return store.serializeAccount(store.getAccount(existing.id));
  }
  return store.serializeAccount(
    store.getAccount(store.createAccount({ provider: 'instagram', ...profile, tokens, scopes }).id)
  );
}

async function ensureAccessToken(store, accountId) {
  const tokens = store.getAccountTokens(accountId);
  if (!tokens?.access_token) throw new Error('Instagram account has no stored token — reconnect in Settings.');

  const now = Date.now();
  if (tokens.expires_at && tokens.expires_at < now) {
    store.setAccountStatus(accountId, 'expired', 'Access token expired — reconnect in Settings.');
    throw new Error('Instagram token expired — reconnect the account in Settings → Social.');
  }

  // Refresh long-lived tokens once they are >24h old and expire within 10 days.
  const oldEnough = !tokens.obtained_at || now - tokens.obtained_at > 24 * 60 * 60 * 1000;
  const nearExpiry = tokens.expires_at && tokens.expires_at - now < 10 * 24 * 60 * 60 * 1000;
  if (oldEnough && nearExpiry) {
    try {
      const refreshed = await igFetch('https://graph.instagram.com/refresh_access_token', {
        params: { grant_type: 'ig_refresh_token', access_token: tokens.access_token },
      });
      const next = {
        access_token: refreshed.access_token,
        expires_at: refreshed.expires_in ? now + refreshed.expires_in * 1000 : tokens.expires_at,
        obtained_at: now,
      };
      store.updateAccountTokens(accountId, next, { status: 'active' });
      return next.access_token;
    } catch (err) {
      console.warn('[Social][IG] token refresh failed:', err.message);
    }
  }
  return tokens.access_token;
}

async function waitForContainer(igUserId, containerId, accessToken, maxPolls = CONTAINER_POLL_MAX) {
  for (let i = 0; i < maxPolls; i++) {
    const status = await igFetch(`/${containerId}`, { accessToken, params: { fields: 'status_code' } });
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR') throw new Error('Instagram media container failed to process.');
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_MS));
  }
  throw new Error('Instagram media container processing timed out.');
}

async function publishPost(store, post) {
  const account = store.getAccount(post.accountId);
  if (!account) throw new Error('Instagram account not found for post');
  const accessToken = await ensureAccessToken(store, account.id);
  const igUserId = account.external_id;

  const sources = resolveMediaItems(database, fileStorage, post.media);
  if (sources.length === 0) {
    throw new Error('Instagram posts require at least one media item (photo URL, or a local/vault video).');
  }

  // "Instagram API with Instagram Login" (graph.instagram.com) has NO binary
  // upload at all: resumable uploads are exclusive to Facebook-Login apps, so
  // photos AND videos must be reachable at a public https URL.
  const localFile = sources.find((s) => s.kind === 'file');
  if (localFile) {
    throw new Error(
      'Instagram (with Instagram Login) cannot receive files directly — Meta downloads media from a public https URL. ' +
      'Paste a public URL for the Instagram variant of this post; local files and vault resources work on LinkedIn and X.'
    );
  }

  const urlVideo = sources.find((s) => s.kind === 'url' && s.mediaKind === 'video');
  const urlImage = sources.find((s) => s.kind === 'url' && s.mediaKind === 'image');
  const containerParams = urlVideo
    ? { media_type: 'REELS', video_url: urlVideo.url, caption: post.body || '' }
    : { image_url: urlImage.url, caption: post.body || '' };
  const container = await igFetch(`/${igUserId}/media`, {
    method: 'POST',
    accessToken,
    params: containerParams,
  });
  const containerId = container.id;
  if (urlVideo) await waitForContainer(igUserId, containerId, accessToken, VIDEO_POLL_MAX);

  const published = await igFetch(`/${igUserId}/media_publish`, {
    method: 'POST',
    accessToken,
    params: { creation_id: containerId },
  });

  let permalink = null;
  try {
    const info = await igFetch(`/${published.id}`, { accessToken, params: { fields: 'permalink' } });
    permalink = info.permalink || null;
  } catch { /* permalink is best-effort */ }

  return { externalPostId: String(published.id), externalUrl: permalink };
}

async function fetchPostMetrics(store, post) {
  if (!post.externalPostId) return null;
  const account = store.getAccount(post.accountId);
  if (!account) return null;
  const accessToken = await ensureAccessToken(store, account.id);

  const fields = await igFetch(`/${post.externalPostId}`, {
    accessToken,
    params: { fields: 'like_count,comments_count' },
  });

  let insights = {};
  try {
    const data = await igFetch(`/${post.externalPostId}/insights`, {
      accessToken,
      params: { metric: 'views,reach,saved,shares,total_interactions' },
    });
    for (const item of data?.data || []) {
      insights[item.name] = item.values?.[0]?.value ?? null;
    }
  } catch (err) {
    console.warn('[Social][IG] insights unavailable for post', post.id, '-', err.message);
  }

  let followers = null;
  try {
    const me = await igFetch('/me', { accessToken, params: { fields: 'followers_count' } });
    followers = me.followers_count ?? null;
  } catch { /* optional */ }

  return {
    impressions: insights.views ?? insights.reach ?? null,
    likes: fields.like_count ?? null,
    comments: fields.comments_count ?? null,
    shares: insights.shares ?? null,
    saves: insights.saved ?? null,
    followers,
    raw: { fields, insights },
  };
}

async function fetchAccountMetrics(store, account) {
  const accessToken = await ensureAccessToken(store, account.id);
  const me = await igFetch('/me', {
    accessToken,
    params: { fields: 'followers_count,follows_count,media_count,username' },
  });
  return {
    followers: me.followers_count ?? null,
    following: me.follows_count ?? null,
    postsCount: me.media_count ?? null,
    raw: me,
  };
}

module.exports = {
  finalizeOAuthAccount,
  connectWithToken,
  ensureAccessToken,
  publishPost,
  fetchPostMetrics,
  fetchAccountMetrics,
  supportsManualToken: true,
  requiresMedia: true,
};
