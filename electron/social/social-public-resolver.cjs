'use strict';

const crypto = require('node:crypto');
const { parseSocialUrl } = require('./social-url-parse.cjs');
const { assertPublicUrl, fetchPublicWithTimeout } = require('../services/web/url-guard.cjs');
const { DEFAULT_USER_AGENT } = require('../services/web/http-utils.cjs');
const {
  decodeEntities,
  parseProfileCounts,
  parsePostOgMetrics,
  parsePostOgPublishedAt,
  mergePostMetrics,
  applyMetricsToPost,
  cleanProfileName,
  extractPublicPostsFromHtml,
  extractPublicProfileFromHtml,
  extractOpenGraph,
} = require('./social-public-html.cjs');

const MAX_POST_ENRICH = 8;

const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
/** Instagram's Chrome HTML is a JS shell with no OG; the public unfurl UA receives tags + logged-out profile JSON. */
const INSTAGRAM_PUBLIC_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function emptyCard(parsed, fetchMethod, limitations) {
  return {
    provider: parsed.provider,
    kind: parsed.kind,
    url: parsed.canonicalUrl,
    externalId: parsed.externalId,
    author: {
      name: parsed.handle || parsed.provider,
      handle: parsed.handle || null,
      avatarUrl: null,
    },
    body: null,
    media: [],
    metrics: null,
    followers: null,
    following: null,
    postsCount: null,
    recentPosts: [],
    format: parsed.kind === 'post' ? null : 'profile',
    limitations,
    fetchMethod,
    fetchedAt: Date.now(),
  };
}

function localPostToCard(post, account) {
  const source = post.source || {};
  return {
    provider: post.provider,
    kind: 'post',
    url: post.externalUrl || parsedFallback(post),
    externalId: post.externalPostId || post.id,
    author: {
      name: source.authorName || account?.displayName || account?.handle || post.provider,
      handle: source.authorHandle || account?.handle || null,
      avatarUrl: source.avatarUrl || account?.avatarUrl || null,
    },
    body: post.body || null,
    media: post.media || [],
    metrics: post.metrics || null,
    format: source.format || null,
    publishedAt: post.publishedAt || null,
    limitations: post.metrics ? [] : ['metrics_unavailable'],
    fetchMethod: 'connected_account',
    fetchedAt: Date.now(),
    localPostId: post.id,
    recentPosts: [],
  };
}

function parsedFallback(post) {
  return post.externalUrl || null;
}

function findLocalPost(store, parsed) {
  const posts = store.listPosts({ limit: 200 }) || [];
  return posts.find((post) => {
    if (post.provider !== parsed.provider) return false;
    if (parsed.kind === 'post' && post.externalPostId && post.externalPostId === parsed.externalId) return true;
    const url = String(post.externalUrl || '');
    return url && (url === parsed.canonicalUrl || url.includes(parsed.externalId));
  }) || null;
}

function findLocalAccount(store, parsed) {
  if (parsed.kind !== 'profile') return null;
  const handle = String(parsed.handle || parsed.externalId || '').replace(/^@/, '').toLowerCase();
  return store.listAccounts(parsed.provider).find((account) => {
    const accountHandle = String(account.handle || '').replace(/^@/, '').toLowerCase();
    return accountHandle && accountHandle === handle;
  }) || null;
}

function isHollowPublicCard(card) {
  if (!card || typeof card !== 'object') return true;
  const limitations = Array.isArray(card.limitations) ? card.limitations : [];
  const noCatalog = !Array.isArray(card.recentPosts) || card.recentPosts.length === 0;
  const noCounts = card.followers == null && card.postsCount == null;
  return noCatalog && noCounts && limitations.includes('requires_browser');
}

function postHasEngagement(metrics) {
  return typeof metrics?.likes === 'number' || typeof metrics?.impressions === 'number';
}

/** Cached IG grids often have posts but no likes/views — those snapshots must be re-fetched. */
function isStaleMetricsCard(card) {
  if (!card || card.provider !== 'instagram') return false;
  if (card.metricsEnriched) return false;
  if (card.kind === 'post') return !postHasEngagement(card.metrics);
  const posts = Array.isArray(card.recentPosts) ? card.recentPosts : [];
  if (posts.length === 0) return false;
  return posts.every((post) => !postHasEngagement(post?.metrics));
}

function cacheGet(database, url) {
  try {
    if (!database?.getQueries) return null;
    const row = database.getQueries().getSocialPublicSnapshotByUrl.get(url);
    if (!row) return null;
    if (row.expires_at < Date.now()) return null;
    const card = JSON.parse(row.payload_json);
    if (isHollowPublicCard(card) || isStaleMetricsCard(card)) return null;
    return card;
  } catch {
    return null;
  }
}

async function fetchPublicPage(url, provider, timeoutOverrideMs) {
  await assertPublicUrl(url);
  const userAgent = provider === 'instagram' ? INSTAGRAM_PUBLIC_UA : DEFAULT_USER_AGENT;
  const timeoutMs = timeoutOverrideMs ?? (provider === 'instagram' ? 15000 : 8000);
  const response = await fetchPublicWithTimeout(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': userAgent,
    },
  }, timeoutMs);
  const html = await response.text();
  return { ...extractOpenGraph(html), html, status: response.status };
}

function cacheSet(database, card) {
  try {
    if (!database?.getQueries || isHollowPublicCard(card)) return;
    const now = Date.now();
    database.getQueries().upsertSocialPublicSnapshot.run(
      `sps-${crypto.randomBytes(8).toString('hex')}`,
      card.url,
      JSON.stringify(card).slice(0, 80000),
      card.fetchMethod,
      now + SNAPSHOT_TTL_MS,
      now,
      now,
    );
  } catch (err) {
    console.warn('[Social] public snapshot cache failed:', err.message);
  }
}

function limitationsForPublicCard({ counts, recentPosts, loginWall, needsBrowser, hasOg, hasPostMetrics }) {
  const limitations = [];
  if (hasOg && recentPosts.length === 0 && !hasPostMetrics) limitations.push('og_only');
  if (loginWall) limitations.push('login_wall');
  if (needsBrowser) limitations.push('requires_browser');
  const hasPublicCounts = counts.followers != null
    || counts.postsCount != null
    || recentPosts.some((post) => postHasEngagement(post?.metrics))
    || Boolean(hasPostMetrics);
  if (!hasPublicCounts) limitations.push('metrics_unavailable');
  return limitations;
}

function applyPublicPostEnrichment(post, page) {
  const htmlPosts = extractPublicPostsFromHtml(page?.html || '', post.provider || 'instagram');
  const fromJson = htmlPosts.find((item) =>
    (post.externalId && item.externalId === post.externalId)
    || (post.url && item.url === post.url),
  ) || null;
  let next = post;
  if (fromJson) {
    next = {
      ...post,
      body: fromJson.body || post.body,
      format: fromJson.format || post.format,
      media: fromJson.media?.length ? fromJson.media : post.media,
      metrics: mergePostMetrics(post.metrics, fromJson.metrics),
      publishedAt: fromJson.publishedAt || post.publishedAt || null,
      limitations: fromJson.limitations,
    };
  }
  if (page?.image && (!next.media || next.media.length === 0)) {
    next = {
      ...next,
      media: [{ type: next.format === 'reel' ? 'video' : 'image', url: page.image }],
    };
  }
  return applyMetricsToPost(
    next,
    parsePostOgMetrics(page?.description),
    parsePostOgPublishedAt(page?.description),
  );
}

async function enrichInstagramRecentPosts(posts) {
  const slice = posts.slice(0, MAX_POST_ENRICH);
  const rest = posts.slice(MAX_POST_ENRICH);
  const enriched = await Promise.all(slice.map(async (post) => {
    if (!post?.url) return post;
    if (postHasEngagement(post.metrics) && post.format !== 'reel') return post;
    if (post.format === 'reel' && typeof post.metrics?.likes === 'number' && typeof post.metrics?.impressions === 'number') {
      return post;
    }
    try {
      const page = await fetchPublicPage(post.url, 'instagram', 8000);
      return applyPublicPostEnrichment(post, page);
    } catch {
      return post;
    }
  }));
  return [...enriched, ...rest];
}

/**
 * Resolve a public social URL into a structured card with honest limitations.
 * @param {{ store: object, database?: object }} deps
 * @param {{ url: string }} input
 */
async function resolvePublicSocial(deps, { url }) {
  const parsed = parseSocialUrl(url);
  if (!parsed) {
    return { success: false, error: 'URL is not a supported Instagram, X or LinkedIn profile or post.' };
  }

  const cached = cacheGet(deps.database, parsed.canonicalUrl);
  if (cached) return { success: true, source: 'social_public', card: cached, cached: true };

  const localPost = findLocalPost(deps.store, parsed);
  if (localPost) {
    const account = localPost.accountId ? deps.store.serializeAccount(deps.store.getAccount(localPost.accountId)) : null;
    const card = localPostToCard(localPost, account);
    cacheSet(deps.database, card);
    return { success: true, source: 'social_public', card };
  }

  const localAccount = findLocalAccount(deps.store, parsed);
  if (localAccount) {
    const metric = deps.store.getLatestAccountMetric?.(localAccount.id);
    const card = {
      ...emptyCard(parsed, 'connected_account', []),
      author: {
        name: localAccount.displayName || localAccount.handle || parsed.provider,
        handle: localAccount.handle,
        avatarUrl: localAccount.avatarUrl || null,
      },
      followers: metric?.followers ?? null,
      postsCount: metric?.postsCount ?? null,
      localAccountId: localAccount.id,
    };
    cacheSet(deps.database, card);
    return { success: true, source: 'social_public', card };
  }

  try {
    const og = await fetchPublicPage(parsed.canonicalUrl, parsed.provider);
    const loginWall = og.status === 401 || og.status === 403
      || /log in|iniciar sesi[oó]n|sign in/i.test(`${og.title}${og.description}`);
    const ogCounts = parseProfileCounts(og.description);
    const jsonProfile = extractPublicProfileFromHtml(og.html);
    const counts = {
      followers: jsonProfile.followers ?? ogCounts.followers,
      following: jsonProfile.following ?? ogCounts.following,
      postsCount: jsonProfile.postsCount ?? ogCounts.postsCount,
    };
    const avatarUrl = jsonProfile.avatarUrl || og.image || null;
    let recentPosts = parsed.kind === 'profile'
      ? extractPublicPostsFromHtml(og.html, parsed.provider).map((post) => ({
          ...post,
          author: {
            name: post.author.name || jsonProfile.name || cleanProfileName(og.title, parsed.handle),
            handle: post.author.handle || parsed.handle || null,
            avatarUrl: post.author.avatarUrl || avatarUrl,
          },
        }))
      : [];
    if (parsed.provider === 'instagram' && parsed.kind === 'profile' && recentPosts.length > 0) {
      recentPosts = await enrichInstagramRecentPosts(recentPosts);
    }
    const htmlPosts = parsed.kind === 'post'
      ? extractPublicPostsFromHtml(og.html, parsed.provider)
      : [];
    const selfPost = htmlPosts.find((item) =>
      item.externalId === parsed.externalId || item.url === parsed.canonicalUrl,
    ) || htmlPosts[0] || null;
    const postMetrics = parsed.kind === 'post'
      ? mergePostMetrics(selfPost?.metrics, parsePostOgMetrics(og.description))
      : null;
    const postPublishedAt = parsed.kind === 'post'
      ? (selfPost?.publishedAt || parsePostOgPublishedAt(og.description))
      : null;
    const hasOg = Boolean(og.title || og.image || og.description);
    const needsBrowser = recentPosts.length === 0
      && counts.followers == null
      && !postMetrics
      && !hasOg;
    const name = jsonProfile.name || cleanProfileName(og.title, parsed.handle) || parsed.handle || parsed.provider;
    const postMedia = selfPost?.media?.length
      ? selfPost.media
      : (og.image ? [{ type: (selfPost?.format === 'reel' || parsed.canonicalUrl.includes('/reel/')) ? 'video' : 'image', url: og.image }] : []);
    const card = {
      ...emptyCard(parsed, 'open_graph', limitationsForPublicCard({
        counts,
        recentPosts,
        loginWall,
        needsBrowser,
        hasOg,
        hasPostMetrics: Boolean(postMetrics),
      })),
      author: {
        name,
        handle: parsed.handle || null,
        avatarUrl,
      },
      body: parsed.kind === 'post'
        ? (selfPost?.body || jsonProfile.biography || decodeEntities(og.description) || null)
        : (jsonProfile.biography || decodeEntities(og.description) || null),
      media: parsed.kind === 'post' ? postMedia : (og.image ? [{ type: 'image', url: og.image }] : []),
      metrics: parsed.kind === 'post' ? postMetrics : null,
      publishedAt: parsed.kind === 'post' ? postPublishedAt : null,
      format: parsed.kind === 'post'
        ? (selfPost?.format || (parsed.canonicalUrl.includes('/reel/') ? 'reel' : 'post'))
        : 'profile',
      followers: parsed.kind === 'profile' ? counts.followers : null,
      following: parsed.kind === 'profile' ? counts.following : null,
      postsCount: parsed.kind === 'profile' ? counts.postsCount : null,
      recentPosts,
      metricsEnriched: parsed.provider === 'instagram',
    };
    cacheSet(deps.database, card);
    return { success: true, source: 'social_public', card };
  } catch (err) {
    const card = emptyCard(parsed, 'open_graph', ['requires_browser', 'metrics_unavailable']);
    return { success: true, source: 'social_public', card, warning: err.message };
  }
}

module.exports = {
  resolvePublicSocial,
  parseSocialUrl,
  SNAPSHOT_TTL_MS,
  limitationsForPublicCard,
  isHollowPublicCard,
  isStaleMetricsCard,
  applyPublicPostEnrichment,
};
