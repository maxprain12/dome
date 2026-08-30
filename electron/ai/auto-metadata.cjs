/* eslint-disable no-console */
'use strict';

const database = require('../core/database.cjs');
const cloudLlm = require('../services/cloud-llm.service.cjs');
const cloudLlmTasks = require('../services/cloud-llm-tasks.cjs');

/**
 * Build a generateText adapter that injects queries + windowManager.
 * Kept at module scope so the inner closure stays shallow.
 * @param {ReturnType<import('../core/database.cjs').getQueries>} q
 * @param {{ broadcast: Function }} windowManager
 */
function makeGenerateText(q, windowManager) {
  return (o) =>
    cloudLlm.generateText({
      ...o,
      getQueries: () => q,
      windowManager,
    });
}

/**
 * Read an image resource from disk and return a data URL, or null when unavailable.
 * Kept at module scope to keep the caller's nesting depth low.
 * @param {{ file_mime_type?: string | null }} row
 * @param {ReturnType<import('../core/database.cjs').getQueries>} q
 * @param {typeof import('../storage/file-storage.cjs')} fileStorage
 * @returns {string | null}
 */
function loadImageDataUrl(row, q, fileStorage) {
  const fs = require('node:fs');
  const vaultStore = require('../storage/vault-store.cjs');
  const fullPath = vaultStore.getResourceFilePath(row, q, fileStorage);
  if (!fullPath || !fs.existsSync(fullPath)) return null;
  const mime = row.file_mime_type || 'image/png';
  return `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
}

/**
 * Persist the auto-generated title and metadata blob on the resource row.
 * Kept at module scope to keep the caller's nesting depth low.
 * @param {ReturnType<import('../core/database.cjs').getQueries>} q
 * @param {string} resourceId
 * @param {{ content: unknown, metadata?: string | null }} row
 * @param {{ title?: string, summary?: string | null, tags?: unknown }} meta
 * @param {string} newTitle
 */
function applyAutoMetadata(q, resourceId, row, meta, newTitle) {
  let metaObj = {};
  try {
    metaObj = JSON.parse(row.metadata || '{}');
  } catch {
    metaObj = {};
  }
  metaObj.dome_auto_metadata = {
    summary: meta.summary || null,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    at: Date.now(),
  };
  if (metaObj.dome_gemma_auto) delete metaObj.dome_gemma_auto;
  q.updateResource.run(
    newTitle,
    row.content,
    JSON.stringify(metaObj),
    Date.now(),
    resourceId,
  );
}

/**
 * After resource create/import, suggest title/summary via cloud LLM (non-blocking).
 * @param {string} resourceId
 * @param {{ database: typeof import('../core/database.cjs'), fileStorage: typeof import('../storage/file-storage.cjs'), windowManager: { broadcast: Function } }} deps
 */
function scheduleCloudAutoMetadata(resourceId, deps) {
  if (!resourceId || typeof resourceId !== 'string') return;
  const { database: db, fileStorage, windowManager } = deps;
  setImmediate(() => {
    void (async () => {
      try {
        if (!cloudLlm.isCloudLlmAvailable(() => db.getQueries())) return;

        const q = db.getQueries();
        const row = q.getResourceById.get(resourceId);
        if (!row) return;

        const title = String(row.title || '').trim();
        if (title && title.toLowerCase() !== 'untitled') return;

        const { getIndexableText } = require('../services/resource-text.cjs');

        let imageDataUrl = null;
        let body = '';
        if (row.type === 'image') {
          imageDataUrl = loadImageDataUrl(row, q, fileStorage);
        } else {
          const idx = getIndexableText(row, q);
          body = idx.text || String(row.content || '').slice(0, 8000);
        }

        if (!imageDataUrl && !body.trim()) return;

        const meta = await cloudLlmTasks.runAutoMetadata(
          makeGenerateText(q, windowManager),
          body,
          imageDataUrl,
        );
        if (!meta || typeof meta !== 'object') return;

        const newTitle = String(meta.title || '').trim();
        if (!newTitle) return;

        applyAutoMetadata(q, resourceId, row, meta, newTitle);

        try {
          windowManager.broadcast('resource:updated', { id: resourceId, title: newTitle });
        } catch {
          /* */
        }
      } catch (e) {
        console.warn('[auto-metadata]', e?.message || e);
      }
    })();
  });
}

module.exports = { scheduleCloudAutoMetadata, scheduleGemmaAutoMetadata: scheduleCloudAutoMetadata };
