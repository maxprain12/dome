'use strict';

const { assertPublicUrl, fetchPublicWithTimeout } = require('../services/web/url-guard.cjs');
const { DEFAULT_USER_AGENT } = require('../services/web/http-utils.cjs');
const { extractProfileAvatarFromHtml } = require('./social-public-html.cjs');

const MAX_AVATAR_BYTES = 400_000;

function isCachedAvatarUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function preferredImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  if (isCachedAvatarUrl(url)) return url;
  return url.replace(/_normal\.(jpe?g|png|webp)(\?|$)/i, '_400x400.$1$2');
}

function refererFor(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('instagram') || host.includes('cdninstagram') || host.includes('fbcdn')) {
      return 'https://www.instagram.com/';
    }
    if (host.includes('twimg') || host.includes('twitter') || host === 'x.com' || host.endsWith('.x.com')) {
      return 'https://x.com/';
    }
    if (host.includes('licdn') || host.includes('linkedin')) {
      return 'https://www.linkedin.com/';
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function publicProfilePageUrl(provider, handle) {
  const slug = String(handle || '').replace(/^@/, '').trim();
  if (!slug) return null;
  if (provider === 'instagram') return `https://www.instagram.com/${encodeURIComponent(slug)}/`;
  if (provider === 'x') return `https://x.com/${encodeURIComponent(slug)}`;
  return null;
}

async function downloadAvatarDataUrl(remoteUrl) {
  const url = preferredImageUrl(remoteUrl);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  await assertPublicUrl(url);
  const headers = {
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'User-Agent': DEFAULT_USER_AGENT,
  };
  const referer = refererFor(url);
  if (referer) headers.Referer = referer;
  const response = await fetchPublicWithTimeout(url, { headers }, 8000);
  if (!response.ok) return null;
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/') || contentType.includes('svg')) return null;
  const buf = Buffer.from(await response.arrayBuffer());
  if (!buf.length || buf.length > MAX_AVATAR_BYTES) return null;
  return `data:${contentType};base64,${buf.toString('base64')}`;
}

async function resolvePublicAvatarUrl(provider, handle) {
  const page = publicProfilePageUrl(provider, handle);
  if (!page) return null;
  await assertPublicUrl(page);
  const response = await fetchPublicWithTimeout(page, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': DEFAULT_USER_AGENT,
    },
  }, 8000);
  if (!response.ok) return null;
  return extractProfileAvatarFromHtml(await response.text());
}

async function persistSocialAvatar({ remoteUrl, provider, handle, currentUrl } = {}) {
  if (isCachedAvatarUrl(currentUrl)) return currentUrl;

  async function tryDownload(url) {
    const next = preferredImageUrl(url);
    if (!next) return null;
    if (isCachedAvatarUrl(next)) return next;
    try {
      return await downloadAvatarDataUrl(next);
    } catch (err) {
      console.warn('[Social] avatar download failed:', err.message);
      return null;
    }
  }

  const fromRemote = await tryDownload(remoteUrl);
  if (fromRemote) return fromRemote;
  try {
    const publicUrl = await resolvePublicAvatarUrl(provider, handle);
    const fromPublic = await tryDownload(publicUrl);
    if (fromPublic) return fromPublic;
  } catch (err) {
    console.warn('[Social] public avatar lookup failed:', err.message);
  }
  return currentUrl || preferredImageUrl(remoteUrl) || null;
}

module.exports = {
  isCachedAvatarUrl,
  preferredImageUrl,
  publicProfilePageUrl,
  persistSocialAvatar,
  downloadAvatarDataUrl,
  resolvePublicAvatarUrl,
};
