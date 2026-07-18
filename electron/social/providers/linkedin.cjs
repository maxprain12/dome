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
/** LMS / Community Management versioned REST (YYYYMM). Bump when LinkedIn sunsets. */
const LINKEDIN_VERSION = '202601';

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
      'LinkedIn-Version': LINKEDIN_VERSION,
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

/** Rest.li entity param for memberCreatorPostAnalytics (share | ugcPost). */
function memberAnalyticsEntityParam(externalPostId) {
  const raw = String(externalPostId || '').trim();
  if (!raw) return null;
  const urn = raw.startsWith('urn:')
    ? raw
    : raw.includes('share')
      ? `urn:li:share:${raw}`
      : `urn:li:ugcPost:${raw}`;
  const kind = urn.includes(':share:') ? 'share' : 'ugcPost';
  return `(${kind}:${encodeURIComponent(urn)})`;
}

async function fetchMemberCreatorMetric(accessToken, entityParam, queryType) {
  const url =
    `https://api.linkedin.com/rest/memberCreatorPostAnalytics` +
    `?q=entity&entity=${entityParam}&queryType=${queryType}&aggregation=TOTAL`;
  const data = await linkedinFetch(accessToken, url);
  const el = data?.elements?.[0] || data;
  const count =
    el?.count ??
    el?.value ??
    el?.metricValue ??
    el?.[queryType.toLowerCase()] ??
    null;
  return typeof count === 'number' ? count : null;
}

async function fetchPostMetrics(store, post) {
  if (!post.externalPostId) return null;
  const account = store.getAccount(post.accountId);
  if (!account) return null;
  const accessToken = await ensureAccessToken(store, account.id);
  const kind = account.accountKind || account.account_kind || 'member';

  let likes = null;
  let comments = null;
  let shares = null;
  let impressions = null;
  let socialRaw = null;
  let analyticsRaw = null;

  try {
    const data = await linkedinFetch(
      accessToken,
      `/socialActions/${encodeURIComponent(post.externalPostId)}`,
    );
    socialRaw = data;
    likes = data?.likesSummary?.totalLikes ?? null;
    comments =
      data?.commentsSummary?.aggregatedTotalComments ??
      data?.commentsSummary?.totalFirstLevelComments ??
      null;
    shares = data?.sharesSummary?.totalShares ?? null;
  } catch (err) {
    console.warn('[Social][LI] socialActions metrics failed:', err.message);
  }

  // Personal + CMA: richer post analytics (impressions / reactions / …).
  if (kind === 'member') {
    const entity = memberAnalyticsEntityParam(post.externalPostId);
    if (entity) {
      try {
        const [imp, reaction, comment, reshare] = await Promise.all([
          fetchMemberCreatorMetric(accessToken, entity, 'IMPRESSION').catch(() => null),
          fetchMemberCreatorMetric(accessToken, entity, 'REACTION').catch(() => null),
          fetchMemberCreatorMetric(accessToken, entity, 'COMMENT').catch(() => null),
          fetchMemberCreatorMetric(accessToken, entity, 'RESHARE').catch(() => null),
        ]);
        analyticsRaw = { IMPRESSION: imp, REACTION: reaction, COMMENT: comment, RESHARE: reshare };
        if (imp != null) impressions = imp;
        if (reaction != null) likes = reaction;
        if (comment != null) comments = comment;
        if (reshare != null) shares = reshare;
      } catch (err) {
        console.warn('[Social][LI] memberCreatorPostAnalytics failed:', err.message);
      }
    }
  }

  if (
    likes == null &&
    comments == null &&
    shares == null &&
    impressions == null
  ) {
    return null;
  }
  return {
    impressions,
    likes,
    comments,
    shares,
    raw: { socialActions: socialRaw, memberAnalytics: analyticsRaw },
  };
}

async function mapPostsFromElements(accessToken, elements) {
  const posts = [];
  for (const el of elements) {
    const id = el.id || el.$URN || null;
    if (!id) continue;
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
    let metrics = null;
    try {
      const social = await linkedinFetch(
        accessToken,
        `/socialActions/${encodeURIComponent(id)}`,
      );
      metrics = {
        likes: social?.likesSummary?.totalLikes ?? null,
        comments:
          social?.commentsSummary?.aggregatedTotalComments ??
          social?.commentsSummary?.totalFirstLevelComments ??
          null,
        shares: social?.sharesSummary?.totalShares ?? null,
        raw: social,
      };
    } catch {
      /* socialActions may be unavailable for some post types */
    }
    posts.push({
      externalPostId: String(id),
      body: typeof commentary === 'string' ? commentary : String(commentary || ''),
      externalUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}/`,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
      metrics,
    });
  }
  return posts;
}

/**
 * List recent posts (org pages via CMA, personal when the token has read access).
 * Personal history normally needs r_member_social (closed by LinkedIn); we still
 * try /rest/posts so apps that somehow have it work, and return a clear skip.
 */
async function listRecentPosts(store, account, { limit = 25 } = {}) {
  const kind = account.account_kind || account.accountKind || 'member';
  const accessToken = await ensureAccessToken(store, account.id);
  const externalId = account.external_id || account.externalId;
  if (!externalId) throw new Error('LinkedIn account missing external id');
  const capped = Math.min(Math.max(Number(limit) || 25, 1), 50);
  const authorUrn =
    kind === 'organization'
      ? `urn:li:organization:${externalId}`
      : `urn:li:person:${externalId}`;
  const author = encodeURIComponent(authorUrn);

  let data;
  try {
    data = await linkedinFetch(
      accessToken,
      `https://api.linkedin.com/rest/posts?author=${author}&q=author&count=${capped}&sortBy=LAST_MODIFIED`,
    );
  } catch (err) {
    console.warn('[Social][LI] listRecentPosts failed:', kind, err.message);
    if (kind === 'member') {
      return {
        posts: [],
        skipped: 'linkedin_member',
        error: err.message,
      };
    }
    return { posts: [], error: err.message };
  }

  const elements = data?.elements || data?.posts || [];
  const posts = await mapPostsFromElements(accessToken, elements);
  if (kind === 'member' && posts.length === 0) {
    return { posts: [], skipped: 'linkedin_member' };
  }
  return { posts };
}

async function fetchMemberAccountMetrics(store, account, accessToken) {
  const personId = account.externalId || account.external_id;
  const raw = {};
  let followers = null;
  let following = null; // 1st-degree connections count

  try {
    const data = await linkedinFetch(
      accessToken,
      'https://api.linkedin.com/rest/memberFollowersCount?q=me',
    );
    raw.memberFollowersCount = data;
    const el = data?.elements?.[0];
    const n = el?.memberFollowersCount ?? data?.memberFollowersCount;
    if (typeof n === 'number') followers = n;
  } catch (err) {
    console.warn('[Social][LI] memberFollowersCount failed:', err.message);
  }

  if (personId) {
    try {
      const data = await linkedinFetch(
        accessToken,
        `/connections/${encodeURIComponent(`urn:li:person:${personId}`)}`,
      );
      raw.connections = data;
      if (typeof data?.firstDegreeSize === 'number') following = data.firstDegreeSize;
    } catch (err) {
      console.warn('[Social][LI] connections size failed:', err.message);
    }
  }

  if (followers == null && following == null) return null;
  return { followers, following, raw };
}

async function fetchOrganizationAccountMetrics(accessToken, account) {
  const urn = encodeURIComponent(`urn:li:organization:${account.externalId}`);
  // The edgeType enum differs per API surface: legacy /v2 wants camel case,
  // the versioned /rest API wants SCREAMING_SNAKE + a LinkedIn-Version header.
  let data;
  try {
    data = await linkedinFetch(
      accessToken,
      `/networkSizes/${urn}?edgeType=CompanyFollowedByMember`,
    );
  } catch (err) {
    if (!err.status || err.status < 400 || err.status >= 500) throw err;
    data = await linkedinFetch(
      accessToken,
      `https://api.linkedin.com/rest/networkSizes/${urn}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
    );
  }
  const followers = data?.firstDegreeSize;
  if (typeof followers !== 'number') return null;
  return { followers, raw: data };
}

async function fetchAccountMetrics(store, account) {
  const accessToken = await ensureAccessToken(store, account.id);
  const kind = account.accountKind || account.account_kind || 'member';
  if (kind === 'organization') {
    return fetchOrganizationAccountMetrics(accessToken, account);
  }
  return fetchMemberAccountMetrics(store, account, accessToken);
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
