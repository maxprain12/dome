'use strict';

/**
 * Canonical URL parser for Instagram / X / LinkedIn profile and post links.
 * Pure: no network, no DB. Used by the public resolver and reference capture.
 */

const SKIP_HANDLES = new Set([
  'home', 'search', 'explore', 'reels', 'stories', 'p', 'reel', 'i', 'intent',
  'hashtag', 'share', 'login', 'signup', 'about', 'jobs', 'feed', 'mynetwork',
  'messaging', 'notifications', 'company', 'school', 'in', 'settings',
  'features', 'pricing', 'orgs', 'topics', 'collections', 'marketplace',
  'sponsors', 'directory', 'help', 'privacy', 'tos',
]);

/**
 * @typedef {'instagram' | 'x' | 'linkedin'} SocialPublicProvider
 * @typedef {'profile' | 'post'} SocialPublicKind
 * @typedef {{
 *   provider: SocialPublicProvider,
 *   kind: SocialPublicKind,
 *   canonicalUrl: string,
 *   externalId: string,
 *   handle?: string,
 * }} ParsedSocialUrl
 */

function stripWww(host) {
  return String(host || '').replace(/^www\./i, '').toLowerCase();
}

function firstPathParts(pathname) {
  return String(pathname || '').split('/').filter(Boolean).map((part) => part.split('?')[0]);
}

function hostProvider(host) {
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
    return 'x';
  }
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  return null;
}

function parseInstagram(parsed) {
  const parts = firstPathParts(parsed.pathname);
  if (parts[0] === 'p' || parts[0] === 'reel' || parts[0] === 'reels') {
    const id = parts[1];
    if (!id) return null;
    const kindPath = parts[0] === 'p' ? 'p' : 'reel';
    return {
      provider: 'instagram',
      kind: 'post',
      externalId: id,
      canonicalUrl: `https://www.instagram.com/${kindPath}/${id}/`,
    };
  }
  if (parts.length === 1 && parts[0] && !SKIP_HANDLES.has(parts[0].toLowerCase())) {
    const handle = parts[0].replace(/^@/, '');
    return {
      provider: 'instagram',
      kind: 'profile',
      handle,
      externalId: handle.toLowerCase(),
      canonicalUrl: `https://www.instagram.com/${handle}/`,
    };
  }
  return null;
}

function parseX(parsed) {
  const parts = firstPathParts(parsed.pathname);
  const statusIdx = parts.findIndex((part) => part === 'status');
  if (statusIdx >= 0 && parts[statusIdx + 1]) {
    const tweetId = parts[statusIdx + 1];
    const handle = statusIdx > 0 ? parts[0].replace(/^@/, '') : 'i';
    return {
      provider: 'x',
      kind: 'post',
      externalId: tweetId,
      handle: handle === 'i' ? undefined : handle,
      canonicalUrl: `https://x.com/${handle}/status/${tweetId}`,
    };
  }
  if (parts.length === 1 && parts[0] && !SKIP_HANDLES.has(parts[0].toLowerCase())) {
    const handle = parts[0].replace(/^@/, '');
    return {
      provider: 'x',
      kind: 'profile',
      handle,
      externalId: handle.toLowerCase(),
      canonicalUrl: `https://x.com/${handle}`,
    };
  }
  return null;
}

function parseLinkedIn(parsed) {
  const parts = firstPathParts(parsed.pathname);
  if (parts[0] === 'in' && parts[1] && parts.length === 2) {
    const handle = parts[1];
    return {
      provider: 'linkedin',
      kind: 'profile',
      handle,
      externalId: handle.toLowerCase(),
      canonicalUrl: `https://www.linkedin.com/in/${handle}/`,
    };
  }
  if (parts[0] === 'company' && parts[1] && parts.length <= 3) {
    const handle = parts[1];
    return {
      provider: 'linkedin',
      kind: 'profile',
      handle,
      externalId: handle.toLowerCase(),
      canonicalUrl: `https://www.linkedin.com/company/${handle}/`,
    };
  }
  const postsIdx = parts.findIndex((part) => part === 'posts' || part === 'activity' || part === 'feed');
  if (postsIdx >= 0 && parts[postsIdx + 1]) {
    const id = parts[postsIdx + 1];
    return {
      provider: 'linkedin',
      kind: 'post',
      externalId: id,
      canonicalUrl: parsed.href.split('?')[0],
    };
  }
  if (parts[0] === 'pulse' && parts[1]) {
    return {
      provider: 'linkedin',
      kind: 'post',
      externalId: parts[1],
      canonicalUrl: parsed.href.split('?')[0],
    };
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {ParsedSocialUrl | null}
 */
function parseSocialUrl(raw) {
  let parsed;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = stripWww(parsed.hostname);
  const provider = hostProvider(host);
  if (provider === 'instagram') return parseInstagram(parsed);
  if (provider === 'x') return parseX(parsed);
  if (provider === 'linkedin') return parseLinkedIn(parsed);
  return null;
}

module.exports = { parseSocialUrl, SKIP_HANDLES };
