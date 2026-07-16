'use strict';

/* eslint-disable no-console */

/**
 * LinkedIn provider — member posts via ugcPosts + OIDC profile, and company
 * pages (organizations) the user administers.
 * Requires the "Sign In with LinkedIn using OpenID Connect" and
 * "Share on LinkedIn" products enabled on the user's LinkedIn app; company
 * pages additionally need the "Community Management API" product (org scopes
 * are opt-in via Settings → Social → LinkedIn → company pages).
 * Member tokens last ~60 days and cannot be refreshed on the standard tier:
 * on expiry the account is marked `expired` and the user reconnects.
 */

const API = 'https://api.linkedin.com/v2';

const database = require('../../core/database.cjs');
const fileStorage = require('../../storage/file-storage.cjs');
const { resolveMediaItems, uploadLinkedInImage } = require('../social-media.cjs');
const { normalizeComment } = require('../social-messaging.cjs');

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

/** Company pages where the token's member is an APPROVED ADMINISTRATOR. */
async function fetchAdminOrganizations(accessToken) {
  const acls = await linkedinFetch(
    accessToken,
    '/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50'
  );
  const orgs = [];
  for (const element of acls?.elements || []) {
    const urn = element?.organization; // urn:li:organization:123456
    const orgId = typeof urn === 'string' ? urn.split(':').pop() : null;
    if (!orgId) continue;
    let name = `LinkedIn Page ${orgId}`;
    let vanityName = null;
    try {
      const org = await linkedinFetch(accessToken, `/organizations/${orgId}`);
      name = org?.localizedName || name;
      vanityName = org?.vanityName || null;
    } catch (err) {
      console.warn(`[Social] LinkedIn org ${orgId} lookup failed:`, err.message);
    }
    orgs.push({ id: orgId, name, vanityName });
  }
  return orgs;
}

async function finalizeOAuthAccount(store, tokenData) {
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error('LinkedIn: no access_token in token response');
  const profile = await fetchProfile(accessToken);
  const tokens = {
    access_token: accessToken,
    expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
  };
  const scopes = tokenData.scope || null;
  const account = upsertAccount(store, profile, tokens, scopes);
  // Company-page mode: the granted scope includes org permissions → also
  // upsert one account per administered page (they share the member token).
  if (String(scopes || '').includes('organization')) {
    try {
      await syncOrganizationAccounts(store, tokens, scopes);
    } catch (err) {
      console.warn('[Social] LinkedIn org discovery failed (member connected anyway):', err.message);
    }
  }
  return account;
}

async function connectWithToken(store, { accessToken }) {
  const profile = await fetchProfile(accessToken);
  const tokens = { access_token: accessToken, expires_at: null };
  const account = upsertAccount(store, profile, tokens, null);
  // Manual tokens may carry org scopes too; discover pages silently.
  try {
    await syncOrganizationAccounts(store, tokens, null);
  } catch { /* token without org scopes — member-only connect */ }
  return account;
}

function upsertAccount(store, profile, tokens, scopes, accountKind = 'member') {
  const existing = store
    .listAccounts('linkedin')
    .find((a) => a.externalId === profile.externalId && (a.accountKind || 'member') === accountKind);
  if (existing) {
    store.updateAccountTokens(existing.id, tokens, { scopes, status: 'active' });
    store.updateAccountProfile(existing.id, profile);
    return store.serializeAccount(store.getAccount(existing.id));
  }
  return store.serializeAccount(
    store.getAccount(store.createAccount({ provider: 'linkedin', accountKind, ...profile, tokens, scopes }).id)
  );
}

/** Upsert one `organization` account per administered company page. */
async function syncOrganizationAccounts(store, tokens, scopes) {
  const orgs = await fetchAdminOrganizations(tokens.access_token);
  return orgs.map((org) =>
    upsertAccount(
      store,
      {
        externalId: org.id,
        displayName: org.name,
        handle: org.vanityName ? `linkedin.com/company/${org.vanityName}` : null,
      },
      tokens,
      scopes,
      'organization'
    )
  );
}

/**
 * Re-discover company pages using an already-connected LinkedIn account's
 * token (Settings → "Buscar páginas de empresa"). Fails with guidance when
 * the token lacks org scopes or the app lacks the Community Management API.
 */
async function syncOrganizations(store, accountId) {
  const account = store.getAccount(accountId);
  if (!account || account.provider !== 'linkedin') throw new Error('LinkedIn account not found');
  await ensureAccessToken(store, accountId); // validates presence + expiry
  const tokens = store.getAccountTokens(accountId);
  try {
    return await syncOrganizationAccounts(store, tokens, account.scopes);
  } catch (err) {
    if (err.status === 403 || err.status === 401) {
      throw new Error(
        'LinkedIn rejected the organization lookup. Enable company-page mode in Settings → Social → LinkedIn, ' +
        'make sure your developer app has the "Community Management API" product approved, and reconnect the account ' +
        `so the token includes the organization scopes. (${err.message})`
      );
    }
    throw err;
  }
}

/** Post author URN: company pages post as the organization, not the member. */
function authorUrnFor(accountRow) {
  return (accountRow.account_kind || 'member') === 'organization'
    ? `urn:li:organization:${accountRow.external_id}`
    : `urn:li:person:${accountRow.external_id}`;
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
  const authorUrn = authorUrnFor(account);

  // Local files / vault resources → native binary upload (Assets API).
  const sources = resolveMediaItems(database, fileStorage, post.media);
  const fileSources = sources.filter((s) => s.kind === 'file');
  if (sources.some((s) => s.kind === 'url')) {
    throw new Error('LinkedIn cannot ingest external media URLs — attach a local file or a vault resource instead.');
  }
  const imageAssets = [];
  for (const source of fileSources.slice(0, 9)) {
    imageAssets.push(await uploadLinkedInImage(accessToken, authorUrn, source));
  }

  const shareContent = {
    shareCommentary: { text: String(post.body || '') },
    shareMediaCategory: imageAssets.length > 0 ? 'IMAGE' : post.linkUrl ? 'ARTICLE' : 'NONE',
  };
  if (imageAssets.length > 0) {
    shareContent.media = imageAssets.map((asset) => ({ status: 'READY', media: asset }));
  } else if (post.linkUrl) {
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

/**
 * Account-level metrics. Member follower counts need a partner tier we don't
 * have, but organization pages expose follower counts via networkSizes with
 * the Community Management API scopes.
 */
/**
 * List recent org posts (Community Management / Posts API).
 * Personal member timelines are not available on the standard API tier.
 */
async function listRecentPosts(store, account, { limit = 25 } = {}) {
  const kind = account.account_kind || account.accountKind || 'member';
  if (kind !== 'organization') {
    return { posts: [], skipped: 'linkedin_member' };
  }
  const accessToken = await ensureAccessToken(store, account.id);
  const orgId = account.external_id || account.externalId;
  if (!orgId) throw new Error('LinkedIn org account missing external id');
  const author = encodeURIComponent(`urn:li:organization:${orgId}`);
  const capped = Math.min(Math.max(Number(limit) || 25, 1), 50);
  let data;
  try {
    data = await linkedinFetch(
      accessToken,
      `https://api.linkedin.com/rest/posts?author=${author}&q=author&count=${capped}&sortBy=LAST_MODIFIED`,
      { headers: { 'LinkedIn-Version': '202506' } },
    );
  } catch (err) {
    console.warn('[Social][LI] listRecentPosts failed:', err.message);
    return { posts: [], error: err.message };
  }
  const elements = data?.elements || data?.posts || [];
  const posts = elements.map((el) => {
    const id = el.id || el.$URN || null;
    const commentary =
      el.commentary ||
      el.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text ||
      '';
    const created =
      el.createdAt ||
      el.publishedAt ||
      el.lastModifiedAt ||
      el.created?.time ||
      null;
    const publishedAt = created != null ? Number(created) : null;
    return {
      externalPostId: id ? String(id) : null,
      body: typeof commentary === 'string' ? commentary : String(commentary || ''),
      externalUrl: id
        ? `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}/`
        : null,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
      metrics: null,
    };
  }).filter((p) => p.externalPostId);
  return { posts };
}

async function fetchAccountMetrics(store, account) {
  if ((account.accountKind || 'member') !== 'organization') return null;
  const accessToken = await ensureAccessToken(store, account.id);
  const urn = encodeURIComponent(`urn:li:organization:${account.externalId}`);
  // The edgeType enum differs per API surface: legacy /v2 wants camel case,
  // the versioned /rest API wants SCREAMING_SNAKE + a LinkedIn-Version header.
  // Mixing them yields a confusing 403 "validation failed ... [/edgeType]".
  let data;
  try {
    data = await linkedinFetch(
      accessToken,
      `/networkSizes/${urn}?edgeType=CompanyFollowedByMember`
    );
  } catch (err) {
    if (!err.status || err.status < 400 || err.status >= 500) throw err;
    data = await linkedinFetch(
      accessToken,
      `https://api.linkedin.com/rest/networkSizes/${urn}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
      { headers: { 'LinkedIn-Version': '202506' } }
    );
  }
  const followers = data?.firstDegreeSize;
  if (typeof followers !== 'number') return null;
  return { followers, raw: data };
}

/**
 * Comments on a share/ugcPost via socialActions (works best with org CMA scopes).
 */
async function listComments(store, { accountId, externalPostId, cursor } = {}) {
  if (!externalPostId) return { comments: [] };
  const accessToken = await ensureAccessToken(store, accountId);
  const urn = encodeURIComponent(externalPostId);
  let path = `/socialActions/${urn}/comments?count=50`;
  if (cursor) path += `&start=${encodeURIComponent(cursor)}`;
  let data;
  try {
    data = await linkedinFetch(accessToken, path);
  } catch (err) {
    console.warn('[Social][LI] listComments failed:', err.message);
    return { comments: [] };
  }
  const comments = (data?.elements || []).map((el) => {
    const actor = el?.actor || el?.commenter || null;
    const text =
      el?.message?.text ||
      el?.commentary?.text ||
      el?.message ||
      '';
    return normalizeComment({
      id: el?.id || el?.$URN || `${externalPostId}:${el?.created?.time || Math.random()}`,
      text: typeof text === 'string' ? text : String(text || ''),
      authorName: null,
      authorExternalId: typeof actor === 'string' ? actor : actor?.id || null,
      createdAt: el?.created?.time || el?.lastModified?.time || null,
    });
  });
  const nextStart = data?.paging?.start != null && data?.paging?.count != null
    ? data.paging.start + data.paging.count
    : undefined;
  return { comments, nextCursor: nextStart != null ? String(nextStart) : undefined };
}

/**
 * Best-effort cold DM via LinkedIn messages API (often partner-gated).
 * recipientExternalId should be a person URN or member id.
 */
async function sendDm(store, { accountId, recipientExternalId, text } = {}) {
  if (!recipientExternalId) throw new Error('LinkedIn DM requires recipientExternalId.');
  if (!String(text || '').trim()) throw new Error('LinkedIn DM text is empty.');
  const accessToken = await ensureAccessToken(store, accountId);
  const account = store.getAccount(accountId);
  const recipientUrn = String(recipientExternalId).startsWith('urn:')
    ? String(recipientExternalId)
    : `urn:li:person:${recipientExternalId}`;
  const senderUrn =
    (account?.account_kind || account?.accountKind) === 'organization'
      ? `urn:li:organization:${account.external_id}`
      : `urn:li:person:${account.external_id}`;

  // Prefer versioned Messages API; fall back to legacy mailbox.
  try {
    const result = await linkedinFetch(accessToken, 'https://api.linkedin.com/rest/messages', {
      method: 'POST',
      headers: {
        'LinkedIn-Version': '202506',
        'Content-Type': 'application/json',
      },
      body: {
        recipients: [recipientUrn],
        subject: '',
        body: String(text).slice(0, 8000),
        // Some tenants require sender; ignored when unsupported.
        sender: senderUrn,
      },
    });
    const externalMessageId =
      result?.id || result?._headers?.['x-restli-id'] || `li-msg-${Date.now()}`;
    return { externalMessageId: String(externalMessageId) };
  } catch (err) {
    console.warn('[Social][LI] rest/messages failed, trying legacy mailbox:', err.message);
  }

  const result = await linkedinFetch(accessToken, '/messages', {
    method: 'POST',
    body: {
      recipients: { person: [recipientUrn] },
      subject: 'Dome',
      body: String(text).slice(0, 8000),
      messageType: 'MEMBER_TO_MEMBER',
    },
  });
  const externalMessageId =
    result?.id || result?._headers?.['x-restli-id'] || null;
  if (!externalMessageId) {
    throw new Error(
      'LinkedIn DM failed — messaging usually needs partner/Community access. Draft kept; reconnect with org scopes or use Monitor.',
    );
  }
  return { externalMessageId: String(externalMessageId) };
}

module.exports = {
  finalizeOAuthAccount,
  connectWithToken,
  ensureAccessToken,
  publishPost,
  fetchPostMetrics,
  fetchAccountMetrics,
  listRecentPosts,
  listComments,
  sendDm,
  syncOrganizations,
  supportsManualToken: true,
  requiresMedia: false,
};
