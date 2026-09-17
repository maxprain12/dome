'use strict';

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, digits) => {
      const code = Number(digits);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function parseCompactNumber(raw) {
  const text = String(raw || '').replace(/,/g, '').trim();
  const match = text.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = (match[2] || '').toLowerCase();
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'b' ? 1_000_000_000 : 1;
  return Math.round(value * multiplier);
}

function parseProfileCounts(description) {
  const text = decodeEntities(description);
  const followers = text.match(/([\d.,]+[kmb]?)\s*followers/i);
  const following = text.match(/([\d.,]+[kmb]?)\s*following/i);
  const posts = text.match(/([\d.,]+[kmb]?)\s*posts/i);
  return {
    followers: followers ? parseCompactNumber(followers[1]) : null,
    following: following ? parseCompactNumber(following[1]) : null,
    postsCount: posts ? parseCompactNumber(posts[1]) : null,
  };
}

function cleanProfileName(title, handle) {
  let name = decodeEntities(title)
    .replace(/\s*[•·|].*$/, '')
    .replace(/\s*\(@[^)]+\)\s*/g, ' ')
    .replace(/\s+on Instagram$/i, '')
    .replace(/\s+on X$/i, '')
    .replace(/\s+\|\s*LinkedIn$/i, '')
    .trim();
  if (!name || /^instagram$/i.test(name)) return handle || name;
  return name;
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value && typeof value === 'object' && typeof value.count === 'number') return value.count;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function captionText(node) {
  if (typeof node?.caption === 'string') return node.caption;
  if (typeof node?.caption?.text === 'string') return node.caption.text;
  const edges = node?.edge_media_to_caption?.edges;
  if (Array.isArray(edges) && typeof edges[0]?.node?.text === 'string') return edges[0].node.text;
  if (typeof node?.legacy?.full_text === 'string') return node.legacy.full_text;
  return null;
}

const IG_SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function mediaIdToShortcode(raw) {
  const digits = String(raw || '').replace(/^POLARIS_/i, '').split('_')[0];
  if (!/^\d{10,}$/.test(digits)) return null;
  let value = BigInt(digits);
  if (value === 0n) return 'A';
  let code = '';
  while (value > 0n) {
    code = IG_SHORTCODE_ALPHABET[Number(value % 64n)] + code;
    value /= 64n;
  }
  return code;
}

function mediaUrl(node) {
  return firstString(
    node?.display_url,
    node?.display_uri,
    node?.thumbnail_src,
    node?.image_versions2?.candidates?.[0]?.url,
    node?.video_versions?.[0]?.url,
    node?.ogImage,
  );
}

function instagramFormat(node, isVideo) {
  const typeName = String(node?.__typename || '');
  const product = String(node?.product_type || '').toLowerCase();
  const mediaType = node?.media_type;
  if (typeName.includes('Carousel') || mediaType === 8 || product.includes('carousel')) {
    return 'carousel';
  }
  if (typeName.includes('Video') || mediaType === 2 || product === 'clips' || isVideo) {
    return 'reel';
  }
  return 'post';
}

function instagramPostCode(node) {
  const existing = firstString(node.code, node.shortcode, node.shortCode);
  if (existing) return /^[A-Za-z0-9_-]{5,15}$/.test(existing) ? existing : null;
  if (!node.product_type) return null;
  return mediaIdToShortcode(node.pk);
}

function asPublicPost(node, provider) {
  if (!node || typeof node !== 'object') return null;
  const code = provider === 'instagram' ? instagramPostCode(node) : firstString(node.code, node.shortcode, node.shortCode);
  const tweetId = firstString(node.rest_id, node.id_str);
  if (code && !/^[A-Za-z0-9_-]{5,15}$/.test(code)) return null;
  if (tweetId && !/^\d{5,20}$/.test(tweetId)) return null;
  if (!code && !(provider === 'x' && tweetId)) return null;
  const likes = firstNumber(
    node.like_count,
    node.edge_media_preview_like,
    node.edge_liked_by,
    node.legacy?.favorite_count,
  );
  const comments = firstNumber(
    node.comment_count,
    node.edge_media_to_comment,
    node.legacy?.reply_count,
  );
  const views = firstNumber(
    node.play_count,
    node.ig_play_count,
    node.video_view_count,
    node.view_count,
    node.views,
    node.legacy?.view_count,
  );
  const isVideo = Boolean(node.is_video || node.media_type === 2 || node.video_versions);
  const format = provider === 'instagram' ? instagramFormat(node, isVideo) : (isVideo ? 'reel' : 'post');
  const handle = firstString(node.owner?.username, node.user?.username, node.core?.screen_name);
  const name = firstString(node.owner?.full_name, node.user?.full_name, node.core?.name, handle);
  const url = provider === 'instagram' && code
    ? `https://www.instagram.com/${format === 'reel' ? 'reel' : 'p'}/${code}/`
    : provider === 'x' && (tweetId || code) && handle
      ? `https://x.com/${handle}/status/${tweetId || code}`
      : null;
  if (!url) return null;
  if (!captionText(node) && likes == null && views == null && !mediaUrl(node)) return null;
  const metrics = {};
  if (likes != null) metrics.likes = likes;
  if (comments != null) metrics.comments = comments;
  if (views != null) metrics.impressions = views;
  const hasMetrics = Object.keys(metrics).length > 0;
  const image = mediaUrl(node);
  return {
    provider,
    kind: 'post',
    url,
    externalId: code || tweetId,
    author: {
      name: name || handle || provider,
      handle: handle || null,
      avatarUrl: firstString(node.owner?.profile_pic_url, node.user?.profile_pic_url) || null,
    },
    body: captionText(node),
    media: image ? [{ type: isVideo || format === 'reel' ? 'video' : 'image', url: image }] : [],
    metrics: hasMetrics ? metrics : null,
    format,
    publishedAt: typeof node.taken_at === 'number'
      ? node.taken_at * (node.taken_at < 1e12 ? 1000 : 1)
      : typeof node.taken_at_timestamp === 'number'
        ? node.taken_at_timestamp * 1000
        : null,
    limitations: hasMetrics ? [] : ['metrics_unavailable'],
    fetchMethod: 'open_graph',
    fetchedAt: Date.now(),
  };
}

function walkPosts(node, provider, acc, seen) {
  if (!node || acc.length >= 12) return;
  if (typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  const post = asPublicPost(node, provider);
  if (post && !acc.some((item) => item.url === post.url)) acc.push(post);
  if (Array.isArray(node)) {
    for (const item of node) walkPosts(item, provider, acc, seen);
    return;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkPosts(value, provider, acc, seen);
  }
}

function extractJsonScripts(html) {
  const blocks = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match = re.exec(html);
  while (match) {
    const body = match[1].trim();
    if (body.startsWith('{') || body.startsWith('[')) blocks.push(body);
    else {
      const assigned = body.match(/=\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*;?\s*$/);
      if (assigned) blocks.push(assigned[1]);
    }
    match = re.exec(html);
  }
  return blocks.sort((a, b) => b.length - a.length);
}

function extractPublicPostsFromHtml(html, provider) {
  const posts = [];
  const seen = new WeakSet();
  for (const block of extractJsonScripts(html)) {
    if (block.length > 2_000_000) continue;
    try {
      walkPosts(JSON.parse(block), provider, posts, seen);
    } catch {
      /* ignore malformed page JSON */
    }
    if (posts.length >= 12) break;
  }
  return posts.slice(0, 12);
}

function looksLikeProfileNode(node) {
  return Boolean(
    node.username
    || node.full_name
    || node.biography
    || typeof node.follower_count === 'number'
    || node.profile_pic_url_hd
    || node.profile_pic_url
    || node.profile_image_url_https
    || node.profile_image_url,
  );
}

function walkProfileStats(node, acc, seen) {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  if (looksLikeProfileNode(node)) {
    const followers = firstNumber(node.follower_count, node.edge_followed_by);
    const following = firstNumber(node.following_count, node.edge_follow);
    const postsCount = firstNumber(node.media_count, node.edge_owner_to_timeline_media);
    if (acc.followers == null && followers != null) acc.followers = followers;
    if (acc.following == null && following != null) acc.following = following;
    if (acc.postsCount == null && postsCount != null) acc.postsCount = postsCount;
    if (!acc.name) acc.name = firstString(node.full_name);
    if (!acc.biography) acc.biography = firstString(node.biography);
    if (!acc.avatarUrl) {
      const pic = firstString(
        node.profile_pic_url_hd,
        node.profile_pic_url,
        node.profile_image_url_https,
        node.profile_image_url,
      );
      if (pic && /^https?:\/\//i.test(pic)) acc.avatarUrl = pic;
    }
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walkProfileStats(item, acc, seen);
      if (acc.followers != null && acc.avatarUrl && acc.biography) return;
    }
    return;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkProfileStats(value, acc, seen);
    if (acc.followers != null && acc.avatarUrl && acc.biography) return;
  }
}

function extractPublicProfileFromHtml(html) {
  const acc = {
    followers: null,
    following: null,
    postsCount: null,
    name: null,
    biography: null,
    avatarUrl: null,
  };
  const seen = new WeakSet();
  for (const block of extractJsonScripts(html)) {
    if (block.length > 2_000_000) continue;
    try {
      walkProfileStats(JSON.parse(block), acc, seen);
    } catch {
      /* ignore malformed page JSON */
    }
    if (acc.followers != null && (acc.avatarUrl || acc.biography)) break;
  }
  if (!acc.avatarUrl) acc.avatarUrl = extractOpenGraph(html).image || null;
  return acc;
}

function extractProfileAvatarFromHtml(html) {
  return extractPublicProfileFromHtml(html).avatarUrl;
}

function metaTag(html, key) {
  const property = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const contentFirst = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    'i',
  );
  return decodeEntities(html.match(property)?.[1] || html.match(contentFirst)?.[1] || '');
}

function extractOpenGraph(html) {
  return {
    title: metaTag(html, 'og:title') || metaTag(html, 'twitter:title'),
    description: metaTag(html, 'og:description') || metaTag(html, 'description'),
    image: metaTag(html, 'og:image') || metaTag(html, 'twitter:image'),
  };
}

function mergePostMetrics(...parts) {
  const next = {};
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    for (const key of ['likes', 'comments', 'impressions', 'shares', 'saves']) {
      const value = part[key];
      if (typeof value === 'number' && Number.isFinite(value) && next[key] == null) {
        next[key] = value;
      }
    }
  }
  return Object.keys(next).length > 0 ? next : null;
}

/** Instagram post OG: "105 likes, 8 comments - handle on Sep 16, 2025: caption". Never treat profile follower copy as likes. */
function parsePostOgMetrics(description) {
  const text = decodeEntities(description).trim();
  if (!text) return null;
  const head = text.split(/\s+[-–]\s+/)[0] || text;
  if (/\bfollowers\b/i.test(head) && !/\blikes?\b/i.test(head)) return null;
  const likesMatch = head.match(/([\d.,]+[kmb]?)\s*likes?/i);
  const commentsMatch = head.match(/([\d.,]+[kmb]?)\s*comments?/i);
  const viewsMatch = text.match(/([\d.,]+[kmb]?)\s*(?:views|plays)/i);
  const metrics = {};
  if (likesMatch) {
    const likes = parseCompactNumber(likesMatch[1]);
    if (likes != null) metrics.likes = likes;
  }
  if (commentsMatch) {
    const comments = parseCompactNumber(commentsMatch[1]);
    if (comments != null) metrics.comments = comments;
  }
  if (viewsMatch) {
    const views = parseCompactNumber(viewsMatch[1]);
    if (views != null) metrics.impressions = views;
  }
  return Object.keys(metrics).length > 0 ? metrics : null;
}

function parsePostOgPublishedAt(description) {
  const text = decodeEntities(description);
  const match = text.match(/\bon\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/);
  if (!match) return null;
  const ts = Date.parse(match[1]);
  return Number.isFinite(ts) ? ts : null;
}

function applyMetricsToPost(post, extra, publishedAt) {
  const metrics = mergePostMetrics(post?.metrics, extra);
  const limitations = (Array.isArray(post?.limitations) ? post.limitations : [])
    .filter((item) => item !== 'metrics_unavailable');
  if (!metrics) limitations.push('metrics_unavailable');
  return {
    ...post,
    metrics,
    publishedAt: post?.publishedAt || publishedAt || null,
    limitations,
  };
}

module.exports = {
  decodeEntities,
  parseCompactNumber,
  parseProfileCounts,
  parsePostOgMetrics,
  parsePostOgPublishedAt,
  mergePostMetrics,
  applyMetricsToPost,
  cleanProfileName,
  mediaIdToShortcode,
  extractPublicPostsFromHtml,
  extractPublicProfileFromHtml,
  extractProfileAvatarFromHtml,
  extractOpenGraph,
};
