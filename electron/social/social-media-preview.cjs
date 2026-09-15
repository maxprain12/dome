'use strict';

/**
 * Resolve a still for Social drafts/scheduled posts: local file, vault, or
 * signed Dome Provider URL. Used by `social:media:preview`.
 */
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');
const { IMAGE_EXTS, VIDEO_EXTS } = require('./social-media.cjs');
const thumbnail = require('../documents/thumbnail.cjs');
const vaultStore = require('../storage/vault-store.cjs');

function looksLikeStoragePath(value) {
  if (typeof value !== 'string') return false;
  const clean = value.replace(/^\/+/, '');
  return clean.startsWith('social-media/') && !clean.includes('..') && !clean.includes('\\');
}

function resolveVaultPath(database, fileStorage, resourceId) {
  const queries = database.getQueries();
  const resource = queries.getResourceById.get(resourceId);
  if (!resource) return null;
  return vaultStore.getResourceFilePath(resource, queries, fileStorage);
}

async function previewFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { dataUrl: null, kind: null };
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) {
    const dataUrl = await thumbnail.generateImageThumbnail(filePath);
    return { dataUrl: dataUrl || null, kind: dataUrl ? 'image' : null };
  }
  if (VIDEO_EXTS.has(ext)) {
    const dataUrl = await thumbnail.generateThumbnail(filePath, 'video', 'video/mp4');
    return { dataUrl: dataUrl || null, kind: dataUrl ? 'video' : null };
  }
  return { dataUrl: null, kind: null };
}

/**
 * @param {object} deps
 * @param {object} deps.database
 * @param {object} deps.fileStorage
 * @param {(storagePath: string) => Promise<{ publicUrl?: string | null }>} [deps.signMediaUrl]
 * @param {{ path?: string, resourceId?: string, storagePath?: string }} input
 * @returns {Promise<{ dataUrl: string | null, kind: 'image' | 'video' | 'remote' | null }>}
 */
async function previewSocialMedia(deps, input) {
  let filePath = typeof input.path === 'string' && input.path ? input.path : null;
  if (!filePath && input.resourceId) {
    try {
      filePath = resolveVaultPath(deps.database, deps.fileStorage, input.resourceId);
    } catch {
      filePath = null;
    }
  }

  const fromFile = await previewFromFile(filePath);
  if (fromFile.dataUrl) return fromFile;

  const storagePath = looksLikeStoragePath(input.storagePath) ? input.storagePath.replace(/^\/+/, '') : null;
  if (storagePath && typeof deps.signMediaUrl === 'function') {
    try {
      const signed = await deps.signMediaUrl(storagePath);
      if (signed?.publicUrl) return { dataUrl: signed.publicUrl, kind: 'remote' };
    } catch (err) {
      console.warn('[Social] media preview sign failed:', err instanceof Error ? err.message : err);
    }
  }

  return { dataUrl: null, kind: null };
}

module.exports = {
  looksLikeStoragePath,
  previewFromFile,
  previewSocialMedia,
};
