/* eslint-disable no-console */
'use strict';

/**
 * Full library sync: Nomic chunk embeddings per resource (Gemma PDF transcription runs inside indexer).
 */

const { resetPipeline } = require('../services/embeddings.service.cjs');
const semanticIndexScheduler = require('../semantic-index-scheduler.cjs');

const INDEXABLE_TYPES = ['pdf', 'note', 'document', 'url', 'notebook', 'ppt', 'excel', 'image'];

/**
 * @param {Object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {Object} deps.windowManager
 * @param {Object} deps.database
 * @param {Object} deps.fileStorage
 * @param {Function} deps.validateSender
 */
function register({ ipcMain, windowManager, database, fileStorage, validateSender }) {
  ipcMain.handle('indexing:full-sync', async (event) => {
    try {
      validateSender(event, windowManager);
    } catch (err) {
      return { success: false, error: err.message || 'Unauthorized' };
    }

    const db = database.getDB?.();
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    semanticIndexScheduler.init(database);

    const resources = db
      .prepare(
        `SELECT id, type, title FROM resources
         WHERE type IN (${INDEXABLE_TYPES.map((t) => `'${t}'`).join(',')})
         ORDER BY updated_at DESC`,
      )
      .all();

    const total = resources.length;
    let embeddingFailed = 0;

    if (total === 0) {
      try {
        windowManager.broadcast('indexing:full-sync-progress', {
          phase: 'finished',
          resourceIndex: 0,
          resourcesTotal: 0,
          embeddingFailed: 0,
        });
      } catch {
        /* ignore */
      }
      return {
        success: true,
        totalResources: 0,
        embeddingFailed: 0,
      };
    }

    const broadcast = (payload) => {
      try {
        windowManager.broadcast('indexing:full-sync-progress', payload);
      } catch {
        /* ignore */
      }
    };

    broadcast({
      phase: 'starting',
      resourceIndex: 0,
      resourcesTotal: total,
      title: null,
    });

    resetPipeline();

    for (let i = 0; i < total; i++) {
      const res = resources[i];
      const title = res.title || res.id;

      broadcast({
        phase: 'embeddings',
        resourceIndex: i + 1,
        resourcesTotal: total,
        resourceId: res.id,
        title,
      });

      try {
        // Use queued indexResource (not indexResourceImmediate) so ONNX/embeddings never
        // overlap with semantic reindex, background jobs, or IPC single-resource index.
        const out = await semanticIndexScheduler.getIndexer().indexResource(res.id);
        if (out && out.ok === false && out.error) {
          embeddingFailed += 1;
        }
      } catch (e) {
        console.warn('[indexing:full-sync] embeddings', res.id, e?.message || e);
        embeddingFailed += 1;
      }
    }

    broadcast({
      phase: 'finished',
      resourceIndex: total,
      resourcesTotal: total,
      embeddingFailed,
    });

    return {
      success: true,
      totalResources: total,
      embeddingFailed,
    };
  });
}

module.exports = { register };
