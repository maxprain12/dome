/* eslint-disable no-console */
'use strict';

const database = require('./database.cjs');
const cloudLlm = require('./services/cloud-llm.service.cjs');
const cloudLlmTasks = require('./services/cloud-llm-tasks.cjs');

/**
 * After resource create/import, suggest title/summary via cloud LLM (non-blocking).
 * @param {string} resourceId
 * @param {{ database: typeof import('./database.cjs'), fileStorage: typeof import('./file-storage.cjs'), windowManager: { broadcast: Function } }} deps
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

        const fs = require('fs');
        const { getIndexableText } = require('./services/resource-text.cjs');

        let imageDataUrl = null;
        let body = '';
        if (row.type === 'image' && row.internal_path) {
          const fullPath = fileStorage.getFullPath(row.internal_path);
          if (fullPath && fs.existsSync(fullPath)) {
            const mime = row.file_mime_type || 'image/png';
            imageDataUrl = `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
          }
        } else {
          const idx = getIndexableText(row, q);
          body = idx.text || String(row.content || '').slice(0, 8000);
        }

        if (!imageDataUrl && !body.trim()) return;

        const gen = (o) =>
          cloudLlm.generateText({
            ...o,
            getQueries: () => q,
            windowManager,
          });
        const meta = await cloudLlmTasks.runAutoMetadata(gen, body, imageDataUrl);
        if (!meta || typeof meta !== 'object') return;

        const newTitle = String(meta.title || '').trim();
        if (!newTitle) return;

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
