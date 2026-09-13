'use strict';

/**
 * Instagram native publish/import helpers (location, people tags, collaborators,
 * original audio name). Licensed music from the in-app library is not available
 * on Instagram Login.
 */

const MEDIA_FIELDS_BASE =
  'id,caption,timestamp,permalink,like_count,comments_count,media_type,media_product_type,media_url,thumbnail_url,username,children{id,media_type,media_url,thumbnail_url}';
const MEDIA_FIELDS_EXTRA = ',location,alt_text,media_audio_type';

/**
 * @param {unknown} err
 */
function isUnknownFieldError(err) {
  const text = err instanceof Error ? err.message : String(err || '');
  return /nonexisting field|unknown field|#100/i.test(text);
}

/**
 * @param {unknown} raw
 * @returns {{ id: string, name: string } | undefined}
 */
function normalizeLocation(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) return undefined;
  const id = row.id != null ? String(row.id) : '';
  return { id, name };
}

/**
 * @param {unknown} raw
 * @returns {Array<{ username: string, x?: number, y?: number }>}
 */
function normalizeUserTags(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  /** @type {Array<{ username: string, x?: number, y?: number }>} */
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const username = String(item.username || item.name || '')
      .replace(/^@/, '')
      .trim();
    if (!username) continue;
    /** @type {{ username: string, x?: number, y?: number }} */
    const tag = { username };
    const x = Number(item.x);
    const y = Number(item.y);
    if (Number.isFinite(x)) tag.x = Math.min(1, Math.max(0, x));
    if (Number.isFinite(y)) tag.y = Math.min(1, Math.max(0, y));
    out.push(tag);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeCollaborators(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  const names = [];
  for (const item of list) {
    const username =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? String(item.username || '')
          : '';
    const cleaned = username.replace(/^@/, '').trim();
    if (cleaned && !names.includes(cleaned)) names.push(cleaned);
  }
  return names.slice(0, 3);
}

/**
 * @param {unknown} value
 * @returns {'MUSIC' | 'ORIGINAL_SOUND' | undefined}
 */
function normalizeAudioType(value) {
  if (value === 'MUSIC' || value === 'ORIGINAL_SOUND') return value;
  return undefined;
}

/**
 * Native IG fields extracted from a Graph media object (best-effort).
 * @param {Record<string, unknown>} post
 */
function nativeSourceFromGraph(post) {
  const location = normalizeLocation(post.location);
  const userTags = normalizeUserTags(post.user_tags || post.tags);
  const collaborators = normalizeCollaborators(post.collaborators);
  const audioName = typeof post.audio_name === 'string' && post.audio_name.trim() ? post.audio_name.trim() : undefined;
  const audioType = normalizeAudioType(post.media_audio_type);
  /** @type {Record<string, unknown>} */
  const source = {};
  if (location) source.location = location;
  if (userTags.length) source.userTags = userTags;
  if (collaborators.length) source.collaborators = collaborators;
  if (audioName) source.audioName = audioName;
  if (audioType) source.audioType = audioType;
  return source;
}

/**
 * Sanitize composer/import source before persistence.
 * @param {unknown} raw
 */
function sanitizePostSource(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const location = normalizeLocation(row.location);
  const userTags = normalizeUserTags(row.userTags);
  const collaborators = normalizeCollaborators(row.collaborators);
  const audioName = typeof row.audioName === 'string' && row.audioName.trim() ? row.audioName.trim() : undefined;
  const audioType = normalizeAudioType(row.audioType);
  /** @type {Record<string, unknown>} */
  const source = { ...row };
  if (location) source.location = location;
  else delete source.location;
  if (userTags.length) source.userTags = userTags;
  else delete source.userTags;
  if (collaborators.length) source.collaborators = collaborators;
  else delete source.collaborators;
  if (audioName) source.audioName = audioName;
  else delete source.audioName;
  if (audioType) source.audioType = audioType;
  else delete source.audioType;
  return source;
}

/**
 * Add Content Publishing params Meta accepts on POST /{ig-user-id}/media.
 * @param {Record<string, unknown>} containerParams
 * @param {unknown} source
 * @param {{ isVideo?: boolean }} [opts]
 */
function applyNativePublishParams(containerParams, source, opts = {}) {
  const native = sanitizePostSource(source) || {};
  const carouselItem = Boolean(opts.isCarouselItem);
  const locationId = native.location && typeof native.location === 'object' ? native.location.id : '';
  if (locationId && !carouselItem) containerParams.location_id = String(locationId);
  const tags = Array.isArray(native.userTags) ? native.userTags : [];
  const allowTags = !opts.isCarouselParent && (!carouselItem || !opts.isVideo);
  if (tags.length && allowTags) {
    containerParams.user_tags = JSON.stringify(
      tags.map((tag) => {
        const username = String(tag.username || '').replace(/^@/, '');
        if (opts.isVideo) return { username };
        return { username, x: Number.isFinite(tag.x) ? tag.x : 0.5, y: Number.isFinite(tag.y) ? tag.y : 0.5 };
      }),
    );
  }
  const collaborators = Array.isArray(native.collaborators) ? native.collaborators : [];
  if (collaborators.length && !carouselItem) {
    containerParams.collaborators = JSON.stringify(collaborators.slice(0, 3));
  }
  if (opts.isVideo && !carouselItem && typeof native.audioName === 'string' && native.audioName) {
    containerParams.audio_name = native.audioName;
  }
  return containerParams;
}

/**
 * @param {string} query
 * @returns {string | null} Facebook Page id or vanity path
 */
function parseFacebookPlaceQuery(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return null;
  if (/^\d{5,}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return null;
    const pages = url.pathname.match(/\/pages\/[^/]+\/(\d+)/);
    if (pages) return pages[1];
    const idParam = url.searchParams.get('id');
    if (idParam && /^\d+$/.test(idParam)) return idParam;
    const vanity = url.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    if (vanity && vanity !== 'pages' && vanity !== 'profile.php') return vanity;
  } catch {
    /* not a URL */
  }
  return null;
}

/**
 * @param {unknown} data
 * @returns {Array<{ id: string, name: string }>}
 */
function mapLocationSearchResults(data) {
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  /** @type {Array<{ id: string, name: string }>} */
  const out = [];
  for (const row of rows) {
    const location = normalizeLocation(row);
    if (!location?.id || !location.name) continue;
    out.push(location);
  }
  return out;
}

module.exports = {
  MEDIA_FIELDS_BASE,
  MEDIA_FIELDS_EXTRA,
  isUnknownFieldError,
  normalizeLocation,
  normalizeUserTags,
  normalizeCollaborators,
  nativeSourceFromGraph,
  sanitizePostSource,
  applyNativePublishParams,
  parseFacebookPlaceQuery,
  mapLocationSearchResults,
};
