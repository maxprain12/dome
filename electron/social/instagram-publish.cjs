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

function parseMediaUploadResponse(data) {
  if (!data || typeof data !== 'object' || typeof data.storagePath !== 'string' || !data.storagePath) {
    throw new Error('media_upload_missing_storage_path');
  }
  return {
    storagePath: data.storagePath,
    publicUrl: pickHttpsUrl(data.publicUrl) || pickHttpsUrl(data.url) || pickHttpsUrl(data.cdnUrl),
  };
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
  mapSocialMediaUploadError,
  isPrivateOrLocalHostname,
  assertInstagramReachableUrl,
  planInstagramPublish,
  toPublicPublishItems,
};
