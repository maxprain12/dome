/* eslint-disable no-console */
/**
 * PageIndex IPC Handlers - Main Process
 *
 * Native JS implementation — no Python subprocess.
 * Uses doc-indexer.cjs for tree building and search.
 *
 * Channels:
 *   pageindex:index            - Index a resource (PDF or note)
 *   pageindex:search           - Reasoning-based search across indexed documents
 *   pageindex:status           - Overall stats (total indexed, etc.)
 *   pageindex:resource-status  - Status of a specific resource (processing/done/error)
 *   pageindex:delete           - Remove index for a resource
 *   pageindex:reindex          - Re-index all PDF resources (batch)
 *   pageindex:start            - No-op (kept for backwards compat, no service to start)
 */

const docIndexer = require('../doc-indexer.cjs');

/**
 * @param {Object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {Object} deps.windowManager
 * @param {Object} deps.database
 * @param {Object} deps.fileStorage
 * @param {Function} deps.validateSender
 */
function register({ ipcMain, windowManager, database, fileStorage, validateSender }) {

  // ---------------------------------------------------------------------------
  // pageindex:start — no-op (kept for backwards compat)
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:start', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    return { success: true, message: 'Native JS indexer — no service to start' };
  });

  // ---------------------------------------------------------------------------
  // pageindex:status — overall stats
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:status', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const db = database.getDB ? database.getDB() : null;
      const stats = queries.getPageIndexStats.get();
      const indexed = stats?.total_indexed ?? 0;
      let total_indexable = 0;
      if (db) {
        const row = db.prepare(`SELECT COUNT(*) as c FROM resources WHERE type IN ('pdf','note')`).get();
        total_indexable = row?.c ?? 0;
      }
      return {
        success: true,
        running: true,
        provider: 'native-js',
        indexed_documents: indexed,
        total_indexable,
        unindexed: Math.max(0, total_indexable - indexed),
        last_indexed_at: stats?.last_indexed_at ?? null,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:resource-status — state of a specific resource
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:resource-status', (event, { resourceId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!resourceId || typeof resourceId !== 'string') {
      return { success: false, error: 'Invalid resourceId' };
    }

    try {
      const queries = database.getQueries();

      // 1. Check in-memory state first (most up-to-date for active processing)
      const memState = docIndexer.getState(resourceId);
      if (memState) {
        return { success: true, resourceId, ...memState };
      }

      // 2. Check resource_page_index (done state)
      const indexed = queries.getPageIndex.get(resourceId);
      if (indexed) {
        return {
          success: true,
          resourceId,
          status: indexed.status || 'done',
          progress: indexed.progress ?? 100,
          step: 'Listo para IA',
          indexed_at: indexed.indexed_at,
          model_used: indexed.model_used,
          error: indexed.error_message || null,
        };
      }

      // 3. Check status table (pending/error before first tree)
      const statusRow = queries.getPageIndexStatus?.get(resourceId);
      if (statusRow) {
        return {
          success: true,
          resourceId,
          status: statusRow.status,
          progress: statusRow.progress ?? 0,
          step: statusRow.status === 'error' ? 'Error al indexar' : 'Pendiente…',
          error: statusRow.error_message || null,
        };
      }

      // 4. Not indexed at all
      return {
        success: true,
        resourceId,
        status: 'none',
        progress: 0,
        step: 'Sin indexar',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:index — generate tree for a resource (PDF or note)
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:index', async (event, { resourceId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!resourceId || typeof resourceId !== 'string' || resourceId.length > 200) {
      return { success: false, error: 'Invalid resourceId' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) return { success: false, error: 'Resource not found' };

      const indexerDeps = { database, windowManager };
      const settingRow = queries.getSetting.get('ai_model');
      const modelUsed = settingRow?.value || 'unknown';

      let result;

      if (resource.type === 'pdf') {
        const internalPath = resource.internal_path;
        if (!internalPath) return { success: false, error: 'Resource has no file path' };
        const fullPath = fileStorage.getFullPath(internalPath);
        if (!fullPath || !require('fs').existsSync(fullPath)) {
          return { success: false, error: `PDF file not found at: ${fullPath}` };
        }
        result = await docIndexer.indexPDF(resourceId, fullPath, indexerDeps);

      } else if (resource.type === 'note') {
        const { tiptapToMarkdown } = require('../resource-indexer.cjs');
        const markdown = tiptapToMarkdown(resource.content || '');
        result = await docIndexer.indexMarkdown(resourceId, markdown, resource.title || '', indexerDeps);

      } else {
        return { success: false, error: `Unsupported type: ${resource.type}` };
      }

      if (result.success && result.tree_json) {
        queries.upsertPageIndex.run(resourceId, result.tree_json, Date.now(), modelUsed);
        queries.deletePageIndexStatus?.run(resourceId);
        return { success: true, resourceId };
      }

      return { success: false, error: result.error || 'Indexing failed' };

    } catch (err) {
      console.error('[PageIndex IPC] index error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:search — reasoning-based retrieval
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:search', async (event, { query, resourceIds, topK = 5 } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!query || typeof query !== 'string') return { success: false, error: 'query is required' };
    if (query.length > 2000) return { success: false, error: 'query too long (max 2000)' };

    try {
      const queries = database.getQueries();

      let trees = [];
      if (Array.isArray(resourceIds) && resourceIds.length > 0) {
        trees = queries.getPageIndexByIds.all(JSON.stringify(resourceIds));
      } else {
        trees = queries.getAllPageIndexedIds.all()
          .map(row => queries.getPageIndex.get(row.resource_id))
          .filter(Boolean);
      }

      if (trees.length === 0) {
        return { success: true, query, method: 'pageindex', count: 0, results: [], message: 'No indexed documents found.' };
      }

      const treePayload = trees.map(t => ({ resource_id: t.resource_id, tree_json: t.tree_json }));
      const searchResult = await docIndexer.search(query, treePayload, topK, database);

      if (!searchResult.success) return { success: false, error: searchResult.error || 'Search failed' };

      const enriched = searchResult.results.map(r => {
        const resource = queries.getResourceById.get(r.resource_id);
        return {
          resource_id: r.resource_id,
          title: resource?.title || r.resource_id,
          type: resource?.type || 'pdf',
          project_id: resource?.project_id,
          pages: r.pages,
          text: r.text,
          node_title: r.node_title,
          score: r.score,
        };
      });

      return { success: true, query, method: 'pageindex', count: enriched.length, results: enriched };

    } catch (err) {
      console.error('[PageIndex IPC] search error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:delete
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:delete', (event, { resourceId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!resourceId || typeof resourceId !== 'string') {
      return { success: false, error: 'Invalid resourceId' };
    }
    try {
      const queries = database.getQueries();
      queries.deletePageIndex.run(resourceId);
      queries.deletePageIndexStatus?.run(resourceId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:index-missing — index only resources without an existing entry
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:index-missing', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const db = database.getDB ? database.getDB() : null;
      if (!db) return { success: false, error: 'Database not available' };

      const queries = database.getQueries();
      const resources = db.prepare(
        `SELECT r.id, r.type, r.internal_path, r.content, r.title
         FROM resources r
         LEFT JOIN resource_page_index pi ON r.id = pi.resource_id
         WHERE r.type IN ('pdf','note') AND pi.resource_id IS NULL`
      ).all();

      const total = resources.length;
      let indexed = 0;
      let failed = 0;

      const sendProgress = (current, res, status) => {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('pageindex:progress', {
            current,
            total,
            resourceId: res?.id,
            title: res?.title || res?.id,
            status,
          });
        }
      };

      sendProgress(0, null, 'starting');

      for (let i = 0; i < resources.length; i++) {
        const res = resources[i];
        const indexerDeps = { database, windowManager, title: res.title || '' };
        const settingRow = queries.getSetting.get('ai_model');
        const modelUsed = settingRow?.value || 'unknown';

        sendProgress(i, res, 'indexing');

        try {
          let result;
          if (res.type === 'pdf') {
            if (!res.internal_path) { failed++; sendProgress(i + 1, res, 'skipped'); continue; }
            const fullPath = fileStorage.getFullPath(res.internal_path);
            if (!fullPath || !require('fs').existsSync(fullPath)) { failed++; sendProgress(i + 1, res, 'skipped'); continue; }
            result = await docIndexer.indexPDF(res.id, fullPath, indexerDeps);
          } else if (res.type === 'note') {
            if (!res.content) { failed++; sendProgress(i + 1, res, 'skipped'); continue; }
            const { tiptapToMarkdown } = require('../resource-indexer.cjs');
            const markdown = tiptapToMarkdown(res.content);
            if (!markdown.trim()) { failed++; sendProgress(i + 1, res, 'skipped'); continue; }
            result = await docIndexer.indexMarkdown(res.id, markdown, res.title || '', indexerDeps);
          }

          if (result?.success && result.tree_json) {
            queries.upsertPageIndex.run(res.id, result.tree_json, Date.now(), modelUsed);
            queries.deletePageIndexStatus?.run(res.id);
            indexed++;
            sendProgress(i + 1, res, 'done');
          } else {
            failed++;
            sendProgress(i + 1, res, 'error');
          }
        } catch (err) {
          console.error(`[PageIndex IPC] index-missing error for ${res.id}:`, err.message);
          failed++;
          sendProgress(i + 1, res, 'error');
        }
      }

      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('pageindex:progress', { current: total, total, status: 'finished', indexed, failed });
      }

      return { success: true, indexed, failed, total };
    } catch (err) {
      console.error('[PageIndex IPC] index-missing error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:reindex — re-index all PDF + note resources
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:reindex', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const db = database.getDB ? database.getDB() : null;
      if (!db) return { success: false, error: 'Database not available' };

      const queries = database.getQueries();
      const resources = db.prepare(
        `SELECT id, type, internal_path, content, title FROM resources WHERE type IN ('pdf','note')`
      ).all();

      let indexed = 0;
      let failed = 0;

      for (const res of resources) {
        const indexerDeps = { database, windowManager };
        const settingRow = queries.getSetting.get('ai_model');
        const modelUsed = settingRow?.value || 'unknown';
        let result;

        try {
          if (res.type === 'pdf') {
            if (!res.internal_path) { failed++; continue; }
            const fullPath = fileStorage.getFullPath(res.internal_path);
            if (!fullPath || !require('fs').existsSync(fullPath)) { failed++; continue; }
            result = await docIndexer.indexPDF(res.id, fullPath, indexerDeps);
          } else if (res.type === 'note') {
            if (!res.content) { failed++; continue; }
            result = await docIndexer.indexMarkdown(res.id, res.content, res.title || '', indexerDeps);
          }

          if (result?.success && result.tree_json) {
            queries.upsertPageIndex.run(res.id, result.tree_json, Date.now(), modelUsed);
            queries.deletePageIndexStatus?.run(res.id);
            indexed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      return { success: true, indexed, failed, total: resources.length };
    } catch (err) {
      console.error('[PageIndex IPC] reindex error:', err.message);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
