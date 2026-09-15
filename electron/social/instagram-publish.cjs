'use strict';

/**
 * Instagram publish helpers — carousel planning and Dome Provider public URLs.
 * Graph (Instagram Login) cannot take binary uploads; Meta fetches https URLs.
 */

const IG_CAROUSEL_MAX = 10;

function pickHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https:\/\//i.test(trimmed) ? trimmed : null;
}

function pickNonEmptyString(data, keys) {
  for (const key of keys) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  }
  return null;
}

function parseMediaUploadResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('media_upload_missing_storage_path');
  }
  const storagePath = pickNonEmptyString(data, ['storagePath', 'storage_path']);
  if (!storagePath) {
    throw new Error('media_upload_missing_storage_path');
  }
  return {
    storagePath,
    publicUrl:
      pickHttpsUrl(data.publicUrl)
      || pickHttpsUrl(data.public_url)
      || pickHttpsUrl(data.url)
      || pickHttpsUrl(data.cdnUrl)
      || pickHttpsUrl(data.signedUrl)
      || pickHttpsUrl(data.signed_url),
  };
}

/**
 * Cloud sync only needs storagePath. A public https URL is best-effort
 * (deployed Dome Provider may still omit it); Instagram publish checks later.
 *
 * @param {{ storagePath: string, publicUrl: string | null }} parsed
 * @param {(storagePath: string) => Promise<{ storagePath: string, publicUrl: string | null }>} [sign]
 * @returns {Promise<{ storagePath: string, publicUrl: string | null }>}
 */
async function resolveUploadedMedia(parsed, sign) {
  if (parsed.publicUrl) return parsed;
  if (typeof sign !== 'function') {
    return { storagePath: parsed.storagePath, publicUrl: null };
  }
  try {
    const signed = await sign(parsed.storagePath);
    if (signed?.publicUrl) return signed;
  } catch {
    // GET /api/v1/social/media is not on the currently deployed provider.
  }
  return { storagePath: parsed.storagePath, publicUrl: null };
}

function mapSocialMediaUploadError(status, text) {
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }
  const code = parsed.error;
  if (status === 401 || code === 'unauthorized') {
    return 'Sign in to Dome (Settings → AI → Dome) to publish local Instagram photos.';
  }
  if (code === 'feature_not_in_plan' || (status === 403 && code !== 'insufficient_scope')) {
    return 'Your Dome plan does not include Social Cloud storage, which Instagram needs for local files.';
  }
  if (status === 402 || code === 'subscription_inactive') {
    return 'Dome subscription is inactive — reconnect Dome to publish local Instagram media.';
  }
  if (status === 503 || code === 'sync_unavailable') {
    return 'Dome Provider is unavailable. Check the connection and retry.';
  }
  const detail = typeof parsed.message === 'string' && parsed.message
    ? parsed.message
    : String(text || '').slice(0, 200);
  return `Could not upload media to Dome Provider (${status}): ${detail}`;
}

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host === '::1' || host === '[::1]' || host === '0.0.0.0') return true;
  if (host.endsWith('.local') || host.endsWith('.localhost')) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return true;
  return false;
}

function assertInstagramReachableUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Instagram needs a public https URL for media.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Instagram needs a public https URL for media.');
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error(
      'Instagram cannot download media from a local URL. Use production Dome Provider so Meta can fetch the file.',
    );
  }
}

function planInstagramPublish(items) {
  const list = Array.isArray(items) ? items.filter((item) => item && item.url) : [];
  if (!list.length) {
    throw new Error('Instagram posts require at least one media item.');
  }
  if (list.length > IG_CAROUSEL_MAX) {
    throw new Error(`Instagram carousels support at most ${IG_CAROUSEL_MAX} items.`);
  }
  if (list.length === 1) {
    return list[0].mediaKind === 'video'
      ? { mode: 'reel', items: list }
      : { mode: 'image', items: list };
  }
  return { mode: 'carousel', items: list };
}

/**
 * Turn resolved sources into public https URLs for Graph.
 * File sources are uploaded via `uploadFile`; identity on `post.media` is not mutated.
 *
 * @param {Array<{ kind: string, url?: string, path?: string, mime?: string, mediaKind: string }>} sources
 * @param {(filePath: string, mime?: string) => Promise<{ storagePath: string, publicUrl?: string | null }>} uploadFile
 */
async function toPublicPublishItems(sources, uploadFile) {
  const items = [];
  const storagePaths = [];
  for (const source of sources) {
    if (source.kind === 'url') {
      assertInstagramReachableUrl(source.url);
      items.push({ url: source.url, mediaKind: source.mediaKind });
      storagePaths.push(null);
      continue;
    }
    const uploaded = await uploadFile(source.path, source.mime);
    const publicUrl = uploaded?.publicUrl;
    if (!publicUrl) {
      throw new Error('Dome Provider did not return a public URL for the uploaded media.');
    }
    assertInstagramReachableUrl(publicUrl);
    items.push({ url: publicUrl, mediaKind: source.mediaKind });
    storagePaths.push(uploaded.storagePath || null);
  }
  return { items, storagePaths };
}

module.exports = {
  IG_CAROUSEL_MAX,
  pickHttpsUrl,
  parseMediaUploadResponse,
  resolveUploadedMedia,
  mapSocialMediaUploadError,
  isPrivateOrLocalHostname,
  assertInstagramReachableUrl,
  planInstagramPublish,
  toPublicPublishItems,
};
