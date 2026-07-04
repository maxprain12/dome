'use strict';

/* eslint-disable no-console */

/**
 * Social media handling — resolves post media items (public URL, local file
 * path, or Dome vault resource) and uploads binaries natively per network:
 *
 * - LinkedIn: Assets API registerUpload → PUT binary → digitalmediaAsset URN.
 * - X: API v2 chunked upload (initialize → append ≤4MB chunks → finalize).
 * - Instagram: NO binary upload on the Instagram-Login variant (see note at
 *   the bottom) — photos and videos need a public https URL.
 */

const fs = require('fs');
const path = require('path');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v']);

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
};

function mediaKindForExt(ext) {
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

/**
 * Resolve a post media item into a concrete source.
 * Accepts: { url } (public https), { path } (local file from the picker),
 * { resourceId } (Dome vault image/video resource).
 * @returns {{ kind: 'url', url: string, mediaKind: string } |
 *           { kind: 'file', path: string, mime: string, size: number, mediaKind: string }}
 */
function resolveMediaItem(database, fileStorage, item) {
  if (!item || typeof item !== 'object') throw new Error('Invalid media item');

  if (typeof item.url === 'string' && /^https:\/\//.test(item.url)) {
    return {
      kind: 'url',
      url: item.url,
      mediaKind: item.type === 'video' || item.type === 'reel' ? 'video' : 'image',
    };
  }

  let filePath = null;
  if (typeof item.resourceId === 'string' && item.resourceId) {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(item.resourceId);
    if (!resource) throw new Error(`Media resource not found: ${item.resourceId}`);
    if (resource.type !== 'image' && resource.type !== 'video') {
      throw new Error(`Resource "${resource.title}" is not an image/video (type: ${resource.type})`);
    }
    const vaultStore = require('../storage/vault-store.cjs');
    filePath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
    if (!filePath) throw new Error(`Resource "${resource.title}" has no file in the vault`);
  } else if (typeof item.path === 'string' && item.path) {
    filePath = item.path;
  } else {
    throw new Error('Media item needs url, path or resourceId');
  }

  if (!fs.existsSync(filePath)) throw new Error(`Media file not found: ${filePath}`);
  const ext = path.extname(filePath).toLowerCase();
  const mediaKind = mediaKindForExt(ext);
  if (!mediaKind) throw new Error(`Unsupported media format: ${ext} (use jpg/png/gif/webp or mp4/mov)`);
  const size = fs.statSync(filePath).size;
  return { kind: 'file', path: filePath, mime: MIME_BY_EXT[ext], size, mediaKind };
}

function resolveMediaItems(database, fileStorage, items) {
  return (Array.isArray(items) ? items : []).map((item) => resolveMediaItem(database, fileStorage, item));
}

// ── LinkedIn — Assets API binary upload ─────────────────────────────────────

async function uploadLinkedInImage(accessToken, personUrn, source) {
  if (source.mediaKind !== 'image') {
    throw new Error('LinkedIn local upload supports images only for now — use an image file');
  }
  if (source.size > 8 * 1024 * 1024) throw new Error('LinkedIn images must be under 8MB');

  const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: personUrn,
        serviceRelationships: [
          { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
        ],
      },
    }),
  });
  if (!registerRes.ok) {
    throw new Error(`LinkedIn registerUpload failed: ${registerRes.status} ${(await registerRes.text()).slice(0, 300)}`);
  }
  const registerData = await registerRes.json();
  const uploadUrl =
    registerData?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = registerData?.value?.asset;
  if (!uploadUrl || !asset) throw new Error('LinkedIn registerUpload: missing uploadUrl/asset in response');

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': source.mime },
    body: fs.readFileSync(source.path),
  });
  if (!putRes.ok && putRes.status !== 201) {
    throw new Error(`LinkedIn binary upload failed: ${putRes.status} ${(await putRes.text()).slice(0, 300)}`);
  }
  return asset; // urn:li:digitalmediaAsset:…
}

// ── X — API v2 chunked upload ────────────────────────────────────────────────

const X_CHUNK_SIZE = 4 * 1024 * 1024;

async function xUploadRequest(accessToken, url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
    body: options.body,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(`X media upload ${res.status}: ${data?.detail || data?.title || text.slice(0, 300)}`);
  }
  return data;
}

async function uploadXMedia(accessToken, source) {
  const limits = { image: 5 * 1024 * 1024, video: 512 * 1024 * 1024 };
  if (source.size > limits[source.mediaKind]) {
    throw new Error(`X ${source.mediaKind} too large (${Math.round(source.size / 1024 / 1024)}MB)`);
  }
  const category = source.mediaKind === 'video' ? 'tweet_video' : source.mime === 'image/gif' ? 'tweet_gif' : 'tweet_image';

  const init = await xUploadRequest(accessToken, 'https://api.x.com/2/media/upload/initialize', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: source.mime, total_bytes: source.size, media_category: category }),
  });
  const mediaId = init?.data?.id || init?.data?.media_id || init?.media_id_string;
  if (!mediaId) throw new Error('X media initialize: no media id in response');

  const buffer = fs.readFileSync(source.path);
  for (let offset = 0, segment = 0; offset < buffer.length; offset += X_CHUNK_SIZE, segment += 1) {
    const chunk = buffer.subarray(offset, Math.min(offset + X_CHUNK_SIZE, buffer.length));
    const form = new FormData();
    form.append('segment_index', String(segment));
    form.append('media', new Blob([chunk], { type: 'application/octet-stream' }), 'chunk');
    await xUploadRequest(accessToken, `https://api.x.com/2/media/upload/${mediaId}/append`, { body: form });
  }

  const finalize = await xUploadRequest(accessToken, `https://api.x.com/2/media/upload/${mediaId}/finalize`, {});
  let processing = finalize?.data?.processing_info;
  const deadline = Date.now() + 5 * 60 * 1000;
  while (processing && processing.state !== 'succeeded') {
    if (processing.state === 'failed') {
      throw new Error(`X media processing failed: ${processing?.error?.message || 'unknown error'}`);
    }
    if (Date.now() > deadline) throw new Error('X media processing timed out');
    await new Promise((r) => setTimeout(r, (processing.check_after_secs || 2) * 1000));
    const status = await xUploadRequest(
      accessToken,
      `https://api.x.com/2/media/upload?media_id=${encodeURIComponent(mediaId)}&command=STATUS`,
      { method: 'GET' }
    );
    processing = status?.data?.processing_info || null;
  }
  return String(mediaId);
}

// NOTE — Instagram has NO binary upload path on the "Instagram API with
// Instagram Login" variant we use (graph.instagram.com): resumable uploads
// (rupload.facebook.com) are exclusive to "Facebook Login for Business" apps.
// Both photos AND videos need a public https URL until the ephemeral URL
// bridge (dome-provider) exists. The instagram provider enforces this with a
// clear error before any network call.

module.exports = {
  resolveMediaItem,
  resolveMediaItems,
  uploadLinkedInImage,
  uploadXMedia,
  IMAGE_EXTS,
  VIDEO_EXTS,
};
