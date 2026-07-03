'use strict';

/* eslint-disable no-console */

/**
 * LinkedIn provider — member posts via ugcPosts + OIDC profile.
 * Requires the "Sign In with LinkedIn using OpenID Connect" and
 * "Share on LinkedIn" products enabled on the user's LinkedIn app.
 * Member tokens last ~60 days and cannot be refreshed on the standard tier:
 * on expiry the account is marked `expired` and the user reconnects.
 */

const API = 'https://api.linkedin.com/v2';

async function linkedinFetch(accessToken, path, options = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`LinkedIn API ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204 || res.status === 201) {
    return { _headers: Object.fromEntries(res.headers.entries()) };
  }
  return res.json();
}

async function fetchProfile(accessToken) {
  const me = await linkedinFetch(accessToken, '/userinfo');
  return {
    externalId: me.sub,
    displayName: me.name || [me.given_name, me.family_name].filter(Boolean).join(' ') || 'LinkedIn',
    handle: me.email || null,
  };
}

async function finalizeOAuthAccount(store, tokenData) {
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error('LinkedIn: no access_token in token response');
  const profile = await fetchProfile(accessToken);
  const tokens = {
    access_token: accessToken,
    expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
  };
  return upsertAccount(store, profile, tokens, tokenData.scope || null);
}

async function connectWithToken(store, { accessToken }) {
  const profile = await fetchProfile(accessToken);
  return upsertAccount(store, profile, { access_token: accessToken, expires_at: null }, null);
}

function upsertAccount(store, profile, tokens, scopes) {
  const existing = store
    .listAccounts('linkedin')
    .find((a) => a.externalId === profile.externalId);
  if (existing) {
    store.updateAccountTokens(existing.id, tokens, { scopes, status: 'active' });
    store.updateAccountProfile(existing.id, profile);
    return store.serializeAccount(store.getAccount(existing.id));
  }
  return store.serializeAccount(
    store.getAccount(store.createAccount({ provider: 'linkedin', ...profile, tokens, scopes }).id)
  );
}

async function ensureAccessToken(store, accountId) {
  const tokens = store.getAccountTokens(accountId);
  if (!tokens?.access_token) throw new Error('LinkedIn account has no stored token — reconnect in Settings.');
  if (tokens.expires_at && tokens.expires_at < Date.now()) {
    store.setAccountStatus(accountId, 'expired', 'Access token expired — reconnect in Settings.');
    throw new Error('LinkedIn token expired — reconnect the account in Settings → Social.');
  }
  return tokens.access_token;
}

async function publishPost(store, post) {
  const account = store.getAccount(post.accountId);
  if (!account) throw new Error('LinkedIn account not found for post');
  const accessToken = await ensureAccessToken(store, account.id);
  const authorUrn = `urn:li:person:${account.external_id}`;

  const shareContent = {
    shareCommentary: { text: String(post.body || '') },
    shareMediaCategory: post.linkUrl ? 'ARTICLE' : 'NONE',
  };
  if (post.linkUrl) {
    shareContent.media = [{ status: 'READY', originalUrl: post.linkUrl }];
  }

  const result = await linkedinFetch(accessToken, '/ugcPosts', {
    method: 'POST',
    body: {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
  });
  const postUrn = result?.id || result?._headers?.['x-restli-id'] || null;
  return {
    externalPostId: postUrn,
    externalUrl: postUrn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/` : null,
  };
}

async function fetchPostMetrics(store, post) {
  if (!post.externalPostId) return null;
  const account = store.getAccount(post.accountId);
  if (!account) return null;
  const accessToken = await ensureAccessToken(store, account.id);
  // socialActions gives aggregate likes/comments for a share/ugcPost URN.
  const data = await linkedinFetch(
    accessToken,
    `/socialActions/${encodeURIComponent(post.externalPostId)}`
  );
  return {
    likes: data?.likesSummary?.totalLikes ?? null,
    comments: data?.commentsSummary?.aggregatedTotalComments ?? data?.commentsSummary?.totalFirstLevelComments ?? null,
    raw: data,
  };
}

module.exports = {
  finalizeOAuthAccount,
  connectWithToken,
  ensureAccessToken,
  publishPost,
  fetchPostMetrics,
  supportsManualToken: true,
  requiresMedia: false,
};
