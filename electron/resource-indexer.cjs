/* eslint-disable no-console */
/**
 * Resource Indexer - Main Process
 *
 * LanceDB/embedding-based indexing has been removed and replaced by PageIndex
 * (reasoning-based RAG via a Python FastAPI service).
 *
 * Full-text search continues to work via SQLite FTS5 triggers (automatic).
 * PDF indexing is triggered via IPC channel pageindex:index.
 *
 * This module is kept as a stub so that existing callers (resources IPC handler,
 * etc.) do not crash. The `scheduleIndexing` function is now a no-op for all
 * resource types except PDFs, where it triggers PageIndex indexing.
 */

const pending = new Map();
let debounceTimer = null;
const DEBOUNCE_MS = 2000;

/**
 * Check if a resource type should be indexed.
 * Only PDFs are indexed by PageIndex; other types use SQLite FTS5.
 */
function shouldIndex(resource) {
  if (!resource || !resource.type) return false;
  return resource.type === 'pdf';
}

/**
 * Schedule PageIndex indexing for a PDF resource with debounce.
 * @param {string} resourceId
 * @param {{ database: Object, fileStorage: Object, pageIndexService: Object }} deps
 */
function scheduleIndexing(resourceId, deps) {
  if (!resourceId || !deps) return;
  pending.set(resourceId, deps);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const ids = Array.from(pending.keys());
    pending.clear();

    setImmediate(() => {
      (async () => {
        for (const id of ids) {
          try {
            await indexResource(id, deps);
          } catch (err) {
            console.error(`[Indexer] Error indexing ${id}:`, err.message);
          }
        }
      })().catch((err) => console.error('[Indexer] Indexing loop error:', err));
    });
  }, DEBOUNCE_MS);
}

/**
 * Index a single PDF resource using PageIndex.
 * No-op for non-PDF types.
 */
async function indexResource(resourceId, deps) {
  try {
    const { database, fileStorage, pageIndexService } = deps || {};
    if (!database || !fileStorage) return;

    const queries = database.getQueries();
    if (!queries) return;

    const resource = queries.getResourceById?.get(resourceId);
    if (!resource || resource.type !== 'pdf') return;

    const internalPath = resource.internal_path;
    if (!internalPath) return;

    const fs = require('fs');
    const fullPath = fileStorage.getFullPath(internalPath);
    if (!fullPath || !fs.existsSync(fullPath)) {
      console.warn(`[Indexer] PDF file not found for resource ${resourceId}`);
      return;
    }

    if (!pageIndexService) {
      console.warn('[Indexer] PageIndex service not provided, skipping indexing');
      return;
    }

    if (!pageIndexService.isRunning()) {
      console.warn('[Indexer] PageIndex service not running, skipping indexing for', resourceId);
      return;
    }

    const result = await pageIndexService.indexPDF(resourceId, fullPath);
    if (result.success && result.tree_json) {
      const settingRow = queries.getSetting?.get('ai_model');
      const modelUsed = settingRow?.value || 'unknown';
      queries.upsertPageIndex.run(resourceId, result.tree_json, Date.now(), modelUsed);
      console.log(`[Indexer] PageIndex tree saved for resource ${resourceId}`);
    } else {
      console.warn(`[Indexer] PageIndex indexing failed for ${resourceId}:`, result.error);
    }
  } catch (err) {
    console.error('[Indexer] indexResource error:', err.message);
  }
}

/**
 * Delete PageIndex tree for a resource (call when resource is deleted).
 */
async function deleteEmbeddings(resourceId, deps) {
  try {
    if (!resourceId || !deps) return;
    const { database } = deps;
    if (!database) return;
    const queries = database.getQueries();
    if (!queries?.deletePageIndex) return;
    queries.deletePageIndex.run(resourceId);
    console.log(`[Indexer] PageIndex tree deleted for resource ${resourceId}`);
  } catch (err) {
    console.warn('[Indexer] deleteEmbeddings error:', err.message);
  }
}

/** @returns {boolean} */
function extractIndexableText() { return ''; }

module.exports = {
  shouldIndex,
  scheduleIndexing,
  deleteEmbeddings,
  extractIndexableText,
};
