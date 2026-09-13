'use strict';

/* eslint-disable no-console */

/**
 * Instagram provider — "Instagram API with Instagram Login" (graph.instagram.com).
 * Needs a professional (Business/Creator) Instagram account and a Meta app with
 * the Instagram product. OAuth uses Business Login for Instagram
 * (`enable_fb_login=0`, Instagram App ID) via https://dome.dowi.es/oauth/instagram/callback
 * (landing bounce → local HTTP). Dashboard token paste remains available.
 *
 * Publishing: Instagram Graph fetches publicly reachable https URLs. Local and
 * vault files are uploaded to Dome Provider first; `post.media` keeps path/resourceId.
 */

const { instagramContent } = require('../social-source-content.cjs');

const GRAPH_HOST = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v25.0';
const GRAPH = `${GRAPH_HOST}/${GRAPH_VERSION}`;
const FACEBOOK_GRAPH = 'https://graph.facebook.com/v25.0';
const IG_FETCH_TIMEOUT_MS = 20_000;
const CONTAINER_POLL_MS = 2000;
const CONTAINER_POLL_MAX = 15;
const VIDEO_POLL_MAX = 150; // video processing can take minutes

function asTokenString(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function tokenPermissions(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).join(',') || null;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

/** Instagram Login returns `{ data: [{ access_token, user_id, permissions }] }`, not a flat token. */
function normalizeInstagramTokenResponse(payload) {
  const row = Array.isArray(payload?.data) ? payload.data[0] : null;
  const source = row && typeof row === 'object' ? row : payload;
  return {
    accessToken: asTokenString(source?.access_token) || asTokenString(payload?.access_token),
    userId: asTokenString(source?.user_id) || asTokenString(payload?.user_id),
    permissions: tokenPermissions(source?.permissions ?? payload?.permissions),
  };
}

function isUnsupportedHttpMethodError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('unsupported request') && msg.includes('method type');
}

function isFetchNetworkError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  const msg = String(err.message || '').toLowerCase();
  if (msg === 'fetch failed' || msg.includes('aborted')) return true;
  const code = err.cause?.code || err.code;
  return code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN';
}

const IG_GRAPH_ACCESS_HINT =
  'Instagram Graph rejected this token. Add the Instagram account as Tester (App Roles → Instagram Testers) and accept the invite in Instagram → Settings → Apps and websites. Dome IA still lacks Business Verification; Meta often returns this generic 400 until that is complete.';

function wrapInstagramGraphError(err) {
  if (!isUnsupportedHttpMethodError(err)) return err;
  if (String(err?.message || '').startsWith(IG_GRAPH_ACCESS_HINT)) return err;
  const wrapped = new Error(`${IG_GRAPH_ACCESS_HINT} (${err.message})`);
  wrapped.status = err.status;
  wrapped.cause = err;
  return wrapped;
}

/** Graph /me sometimes returns `{ data: [{ user_id, username }] }` like the token payload. */
function unwrapInstagramUserPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const row = Array.isArray(payload.data) ? payload.data[0] : null;
  if (row && typeof row === 'object' && (row.user_id || row.username || row.id || row.name)) {
    return row;
  }
  return payload;
}

function buildInstagramProfile(me, fallbackUserId) {
  const user = unwrapInstagramUserPayload(me);
  const externalId = asTokenString(user?.user_id) || asTokenString(user?.id) || asTokenString(fallbackUserId);
  if (!externalId) return null;
  const username = asTokenString(user?.username);
  return {
    externalId,
    displayName: asTokenString(user?.name) || username || 'Instagram',
    handle: username ? `@${username.replace(/^@/, '')}` : null,
    followers: typeof user?.followers_count === 'number' ? user.followers_count : null,
  };
}

const database = require('../../core/database.cjs');
const fileStorage = require('../../storage/file-storage.cjs');
const { resolveMediaItems } = require('../social-media.cjs');
const {
  planInstagramPublish,
  toPublicPublishItems,
} = require('../instagram-publish.cjs');
const socialCloudAdapter = require('../../storage/social-cloud-adapter.cjs');
const { normalizeComment } = require('../social-messaging.cjs');
const {
  MEDIA_FIELDS_BASE,
  MEDIA_FIELDS_EXTRA,
  isUnknownFieldError,
  applyNativePublishParams,
  parseFacebookPlaceQuery,
  mapLocationSearchResults,
  normalizeLocation,
} = require('../instagram-native.cjs');

async function igFetchOnce(path, { method = 'GET', params = {}, accessToken, body, form, authStyle = 'query' } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const headers = {};
  let fetchBody;
  let httpMethod = method;
  if (form) {
    httpMethod = httpMethod === 'GET' ? 'POST' : httpMethod;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const encoded = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) {
      if (v !== undefined && v !== null) encoded.set(k, String(v));
    }
    fetchBody = encoded.toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  if (accessToken && authStyle === 'bearer') {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (accessToken && httpMethod === 'GET') {
    url.searchParams.set('access_token', accessToken);
  } else if (accessToken && httpMethod !== 'GET' && !form) {
    url.searchParams.set('access_token', accessToken);
  }
  const init = { method: httpMethod, headers, signal: AbortSignal.timeout(IG_FETCH_TIMEOUT_MS) };
  if (fetchBody !== undefined) init.body = fetchBody;
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (!isFetchNetworkError(err)) throw err;
    const code = err.cause?.code || err.code || (err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : 'network');
    const wrapped = new Error(`Instagram API unreachable (${code})`);
    wrapped.status = 0;
    wrapped.cause = err;
    throw wrapped;
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const errBody = data?.error && typeof data.error === 'object' ? data.error : null;
    const msg = errBody?.message || text.slice(0, 500);
    const err = new Error(`Instagram API ${res.status}: ${msg}`);
    err.status = res.status;
    // Instagram Login has no /collaborators (Facebook Login only). Unknown
    // fields are retried by callers; don't spam the console on every media item.
    if (!isUnknownFieldError(err)) {
      console.warn('[Social][IG] graph error', {
        path: url.pathname,
        method: httpMethod,
        authStyle,
        type: errBody?.type || null,
        code: errBody?.code || res.status,
        subcode: errBody?.error_subcode || null,
        message: msg,
        fbtrace_id: errBody?.fbtrace_id || null,
      });
    }
    throw err;
  }
  return data;
}

async function igFetch(path, opts = {}) {
  const method = opts.method || 'GET';
  const attempts = [];
  if (method === 'GET' && opts.accessToken && !String(path).startsWith('http')) {
    attempts.push({ path, opts: { ...opts, authStyle: 'query' } });
    attempts.push({ path, opts: { ...opts, authStyle: 'bearer' } });
    attempts.push({ path: `${GRAPH_HOST}${path}`, opts: { ...opts, authStyle: 'query' } });
    attempts.push({ path: `${GRAPH_HOST}${path}`, opts: { ...opts, authStyle: 'bearer' } });
  } else if (method === 'GET' && opts.params && Object.keys(opts.params).length > 0) {
    attempts.push({ path, opts });
    attempts.push({ path, opts: { method: 'POST', form: opts.params, accessToken: opts.accessToken } });
  } else {
    attempts.push({ path, opts });
  }
  let lastErr;
  for (const attempt of attempts) {
    try {
      return await igFetchOnce(attempt.path, attempt.opts);
    } catch (err) {
      lastErr = err;
      if (!isUnsupportedHttpMethodError(err)) throw wrapInstagramGraphError(err);
    }
  }
  throw wrapInstagramGraphError(lastErr);
}

async function igTokenRequest(path, form) {
  try {
    return await igFetch(path, { params: form });
  } catch (err) {
    if (!isUnsupportedHttpMethodError(err)) throw err;
    return igFetch(path, { method: 'POST', form });
  }
}

async function fetchProfile(accessToken, fallbackUserId) {
  const fieldSets = ['user_id,username,name,followers_count', 'user_id,username'];
  const paths = ['/me'];
  if (fallbackUserId) paths.push(`/${encodeURIComponent(fallbackUserId)}`);
  let lastErr;
  for (const path of paths) {
    for (const fields of fieldSets) {
      try {
        const me = await igFetch(path, { accessToken, params: { fields } });
        const profile = buildInstagramProfile(me, fallbackUserId);
        if (profile) return profile;
      } catch (err) {
        lastErr = err;
      }
    }
  }
  const fallback = buildInstagramProfile(null, fallbackUserId);
  if (fallback) {
    if (isUnsupportedHttpMethodError(lastErr)) {
      throw wrapInstagramGraphError(lastErr);
    }
    console.warn('[Social][IG] profile lookup failed, using token user id:', lastErr?.message || lastErr);
    return fallback;
  }
  throw lastErr ? wrapInstagramGraphError(lastErr) : new Error('Instagram did not return an account identity. Reconnect the account.');
}

async function exchangeLongLived(store, shortToken) {
  const { clientSecret } = store.getProviderConfig('instagram');
  if (!clientSecret) return { access_token: shortToken, expires_in: null };
  const params = {
    grant_type: 'ig_exchange_token',
    client_secret: clientSecret,
    access_token: shortToken,
  };
  return igTokenRequest('https://graph.instagram.com/access_token', params);
}

async function finalizeOAuthAccount(store, tokenData) {
  const normalized = normalizeInstagramTokenResponse(tokenData);
  const shortToken = normalized.accessToken;
  if (!shortToken) throw new Error('Instagram: no access_token in token response');
  console.warn('[Social][IG] short token', {
    prefix: shortToken.slice(0, 4),
    userId: normalized.userId || null,
    permissions: normalized.permissions || null,
    wrapped: Array.isArray(tokenData?.data),
  });
  const longLived = await exchangeLongLived(store, shortToken).catch((err) => {
    console.warn('[Social][IG] long-lived exchange failed, keeping short token:', err.message);
    return { access_token: shortToken, expires_in: 3600 };
  });
  const profile = await fetchProfile(longLived.access_token, normalized.userId);
  const tokens = {
    access_token: longLived.access_token,
    expires_at: longLived.expires_in ? Date.now() + longLived.expires_in * 1000 : null,
    obtained_at: Date.now(),
  };
  return upsertAccount(store, profile, tokens, normalized.permissions);
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
      const refreshed = await igTokenRequest('https://graph.instagram.com/refresh_access_token', {
        grant_type: 'ig_refresh_token',
        access_token: tokens.access_token,
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

async function createMediaContainer(igUserId, accessToken, params, waitMax = 0) {
  const container = await igFetch(`/${igUserId}/media`, {
    method: 'POST',
    accessToken,
    params,
  });
  const containerId = container.id;
  if (!containerId) throw new Error('Instagram did not return a media container id.');
  if (waitMax > 0) await waitForContainer(igUserId, containerId, accessToken, waitMax);
  return String(containerId);
}

async function publishPost(store, post) {
  const account = store.getAccount(post.accountId);
  if (!account) throw new Error('Instagram account not found for post');
  const accessToken = await ensureAccessToken(store, account.id);
  const igUserId = account.external_id;

  const sources = resolveMediaItems(database, fileStorage, post.media);
  if (sources.length === 0) {
    throw new Error('Instagram posts require at least one media item (photo, video, or vault file).');
  }

  const { items, storagePaths } = await toPublicPublishItems(sources, (filePath, mime) =>
    socialCloudAdapter.uploadMediaFile(database, filePath, mime),
  );
  const persisted = storagePaths.filter(Boolean);
  if (persisted.length && post.id) {
    store.setPostMediaStorage(post.id, persisted);
  }

  const plan = planInstagramPublish(items);
  let containerId;
  if (plan.mode === 'carousel') {
    const childIds = [];
    for (const item of plan.items) {
      const isVideo = item.mediaKind === 'video';
      const childParams = isVideo
        ? { video_url: item.url, is_carousel_item: true }
        : { image_url: item.url, is_carousel_item: true };
      applyNativePublishParams(childParams, post.source, { isVideo, isCarouselItem: true });
      childIds.push(await createMediaContainer(
        igUserId,
        accessToken,
        childParams,
        isVideo ? VIDEO_POLL_MAX : CONTAINER_POLL_MAX,
      ));
    }
    const parentParams = {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: post.body || '',
    };
    applyNativePublishParams(parentParams, post.source, { isCarouselParent: true });
    containerId = await createMediaContainer(igUserId, accessToken, parentParams, CONTAINER_POLL_MAX);
  } else if (plan.mode === 'reel') {
    const containerParams = {
      media_type: 'REELS',
      video_url: plan.items[0].url,
      caption: post.body || '',
    };
    applyNativePublishParams(containerParams, post.source, { isVideo: true });
    containerId = await createMediaContainer(igUserId, accessToken, containerParams, VIDEO_POLL_MAX);
  } else {
    const containerParams = {
      image_url: plan.items[0].url,
      caption: post.body || '',
    };
    applyNativePublishParams(containerParams, post.source, { isVideo: false });
    containerId = await createMediaContainer(igUserId, accessToken, containerParams);
  }

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

async function deleteRemotePost(store, post) {
  if (!post?.externalPostId) return { remoteDeleted: false };
  const account = store.getAccount(post.accountId);
  if (!account) return { remoteDeleted: false };
  const accessToken = await ensureAccessToken(store, account.id);
  await igFetch(`/${post.externalPostId}`, { method: 'DELETE', accessToken });
  return { remoteDeleted: true };
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

async function fetchMediaList(igUserId, accessToken, capped) {
  try {
    return await igFetch(`/${igUserId}/media`, {
      accessToken,
      params: { fields: `${MEDIA_FIELDS_BASE}${MEDIA_FIELDS_EXTRA}`, limit: capped },
    });
  } catch (err) {
    if (!isUnknownFieldError(err)) throw err;
    return igFetch(`/${igUserId}/media`, {
      accessToken,
      params: { fields: MEDIA_FIELDS_BASE, limit: capped },
    });
  }
}

/**
 * List recent media already published on Instagram (not created in Dome).
 * Enriches each item with insights (views/reach/saved/shares) when available.
 * Collaborator tags are Facebook Login only (`GET /{ig-media-id}/collaborators`
 * does not exist on graph.instagram.com).
 * @returns {{ posts: Array<{ externalPostId, body, externalUrl, publishedAt, metrics }> }}
 */
async function listRecentPosts(store, account, { limit = 25 } = {}) {
  const accessToken = await ensureAccessToken(store, account.id);
  const igUserId = account.external_id || account.externalId;
  if (!igUserId) throw new Error('Instagram account missing external id');
  const capped = Math.min(Math.max(Number(limit) || 25, 1), 50);
  const data = await fetchMediaList(igUserId, accessToken, capped);
  const media = data?.data || [];
  const posts = [];
  for (const m of media) {
    const publishedAt = m.timestamp ? Date.parse(m.timestamp) : null;
    let insights = {};
    try {
      const insightData = await igFetch(`/${m.id}/insights`, {
        accessToken,
        params: { metric: 'views,reach,saved,shares,total_interactions' },
      });
      for (const item of insightData?.data || []) {
        insights[item.name] = item.values?.[0]?.value ?? null;
      }
    } catch {
      /* insights often missing for stories / some media types */
    }
    const content = instagramContent(m, account);
    posts.push({
      externalPostId: String(m.id),
      body: m.caption || '',
      ...content,
      externalUrl: m.permalink || null,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
      metrics: {
        impressions: insights.views ?? insights.reach ?? null,
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        shares: insights.shares ?? null,
        saves: insights.saved ?? null,
        clicks: insights.total_interactions ?? null,
        raw: { media_type: m.media_type, insights },
      },
    });
  }
  return { posts };
}

async function facebookFetch(path, { accessToken, params = {} } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${FACEBOOK_GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  url.searchParams.set('access_token', accessToken);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(IG_FETCH_TIMEOUT_MS) });
  } catch (err) {
    if (!isFetchNetworkError(err)) throw err;
    const code = err.cause?.code || err.code || 'network';
    const wrapped = new Error(`Facebook API unreachable (${code})`);
    wrapped.status = 0;
    wrapped.cause = err;
    throw wrapped;
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || text.slice(0, 500);
    const err = new Error(`Facebook API ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Resolve a place name or Facebook Page URL to { id, name } for location_id.
 * Pages Search often fails with Instagram Login tokens — callers should treat
 * searchUnsupported as the URL fallback.
 */
async function searchLocations(store, account, { query } = {}) {
  const accessToken = await ensureAccessToken(store, account.id);
  const q = String(query || '').trim();
  if (!q) return { locations: [], searchUnsupported: false };

  const parsed = parseFacebookPlaceQuery(q);
  if (parsed) {
    try {
      const page = await facebookFetch(`/${encodeURIComponent(parsed)}`, {
        accessToken,
        params: { fields: 'id,name,location' },
      });
      const location = normalizeLocation(page);
      if (location?.id) return { locations: [location], searchUnsupported: false };
    } catch {
      /* fall through to name search */
    }
  }

  try {
    const data = await facebookFetch('/pages/search', {
      accessToken,
      params: { q, fields: 'id,name,location' },
    });
    const withPlace = (data?.data || []).filter((row) => row.location);
    return {
      locations: mapLocationSearchResults({ data: withPlace.length ? withPlace : data?.data }),
      searchUnsupported: false,
    };
  } catch (err) {
    if (err && (err.status === 400 || err.status === 403)) {
      return { locations: [], searchUnsupported: true };
    }
    throw err;
  }
}

/**
 * List comments on an Instagram media object.
 * @returns {{ comments: object[], nextCursor?: string }}
 */
async function listComments(store, { accountId, externalPostId, cursor } = {}) {
  if (!externalPostId) return { comments: [] };
  const accessToken = await ensureAccessToken(store, accountId);
  const withReplies = 'id,text,username,timestamp,from{id,username},replies{id,text,username,timestamp,from{id,username}}';
  const withRepliesPlain = 'id,text,username,timestamp,from,replies{id,text,username,timestamp,from}';
  const base = 'id,text,username,timestamp,from';
  const params = { fields: withReplies, limit: 50 };
  if (cursor) params.after = cursor;
  let data;
  try {
    data = await igFetch(`/${externalPostId}/comments`, { accessToken, params });
  } catch (err) {
    if (!isUnknownFieldError(err)) throw err;
    try {
      data = await igFetch(`/${externalPostId}/comments`, {
        accessToken,
        params: { ...params, fields: withRepliesPlain },
      });
    } catch (retryErr) {
      if (!isUnknownFieldError(retryErr)) throw retryErr;
      data = await igFetch(`/${externalPostId}/comments`, {
        accessToken,
        params: { ...params, fields: base },
      });
    }
  }
  const comments = flattenIgComments(data?.data || []);
  return {
    comments,
    nextCursor: data?.paging?.cursors?.after || undefined,
  };
}

function mapIgComment(raw, parentId) {
  const fromUsername = raw.from?.username || raw.user?.username || null;
  const nestedParent = parentId || raw.parent_id || raw.parentId || null;
  return normalizeComment({
    id: raw.id,
    text: raw.text,
    authorName: raw.username || fromUsername || null,
    authorExternalId: raw.from?.id || raw.user?.id || raw.username || fromUsername || null,
    createdAt: raw.timestamp,
    parentId: nestedParent,
  });
}

function flattenIgComments(rows, parentId = null, out = [], seen = new Map()) {
  for (const raw of rows) {
    if (!raw?.id) continue;
    const mapped = mapIgComment(raw, parentId);
    const prev = seen.get(mapped.id);
    if (prev) {
      prev.text = prev.text || mapped.text;
      prev.authorName = prev.authorName || mapped.authorName;
      prev.authorExternalId = prev.authorExternalId || mapped.authorExternalId;
      prev.createdAt = prev.createdAt ?? mapped.createdAt;
      prev.parentId = prev.parentId || mapped.parentId;
    } else {
      seen.set(mapped.id, mapped);
      out.push(mapped);
    }
    const nested = raw.replies?.data;
    if (Array.isArray(nested) && nested.length) {
      flattenIgComments(nested, raw.id, out, seen);
    }
  }
  return out;
}

async function replyToComment(store, { accountId, commentId, text } = {}) {
  if (!commentId) throw new Error('Instagram reply requires a comment id.');
  const message = String(text || '').trim();
  if (!message) throw new Error('Instagram reply text is empty.');
  const accessToken = await ensureAccessToken(store, accountId);
  const result = await igFetch(`/${commentId}/replies`, {
    method: 'POST',
    accessToken,
    params: { message: message.slice(0, 2200) },
  });
  const id = result?.id || null;
  if (!id) throw new Error('Instagram did not return a reply id.');
  return { id: String(id) };
}

/**
 * Cold DM to an Instagram user (IGSID) who commented / messaged.
 * Requires instagram_business_manage_messages on the token.
 */
async function sendDm(store, { accountId, recipientExternalId, text } = {}) {
  if (!recipientExternalId) throw new Error('Instagram DM requires recipientExternalId (commenter IGSID).');
  if (!String(text || '').trim()) throw new Error('Instagram DM text is empty.');
  const account = store.getAccount(accountId);
  if (!account) throw new Error('Instagram account not found');
  const accessToken = await ensureAccessToken(store, accountId);
  const igUserId = account.external_id;
  const result = await igFetch(`/${igUserId}/messages`, {
    method: 'POST',
    accessToken,
    body: {
      recipient: { id: String(recipientExternalId) },
      message: { text: String(text).slice(0, 1000) },
    },
  });
  const externalMessageId = result?.message_id || result?.id || null;
  if (!externalMessageId) {
    throw new Error('Instagram DM response missing message id — check Messaging product / App Review.');
  }
  return { externalMessageId: String(externalMessageId) };
}

module.exports = {
  normalizeInstagramTokenResponse,
  isUnsupportedHttpMethodError,
  isFetchNetworkError,
  wrapInstagramGraphError,
  unwrapInstagramUserPayload,
  buildInstagramProfile,
  finalizeOAuthAccount,
  connectWithToken,
  ensureAccessToken,
  publishPost,
  deleteRemotePost,
  fetchPostMetrics,
  fetchAccountMetrics,
  listRecentPosts,
  listComments,
  replyToComment,
  sendDm,
  searchLocations,
  supportsManualToken: true,
  requiresMedia: true,
};
