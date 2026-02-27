/* eslint-disable no-console */
/**
 * PageIndex IPC Handlers - Main Process
 *
 * Exposes PageIndex reasoning-based RAG to the renderer via IPC.
 * Replaces the old vector:* IPC handlers that used LanceDB + embeddings.
 *
 * Channels:
 *   pageindex:index    - Index a PDF resource (generate hierarchical tree)
 *   pageindex:search   - Reasoning-based search across indexed documents
 *   pageindex:status   - Service health / status
 *   pageindex:delete   - Remove index for a resource
 *   pageindex:reindex  - Re-index all PDF resources (batch)
 *   pageindex:start    - Explicitly start the Python service
 */

/**
 * @param {Object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {Object} deps.windowManager
 * @param {Object} deps.database
 * @param {Object} deps.fileStorage
 * @param {Object} deps.pageIndexService - electron/pageindex-service.cjs
 * @param {Function} deps.validateSender
 */
function register({ ipcMain, windowManager, database, fileStorage, pageIndexService, validateSender }) {

  // ---------------------------------------------------------------------------
  // pageindex:start — explicitly start the service (also called on app start)
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:start', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      await pageIndexService.start(database);
      return { success: true };
    } catch (err) {
      console.error('[PageIndex IPC] start error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:status — health check
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:status', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const status = await pageIndexService.getStatus();
      const queries = database.getQueries();
      const stats = queries.getPageIndexStats.get();
      return {
        success: true,
        ...status,
        indexed_documents: stats?.total_indexed ?? 0,
        last_indexed_at: stats?.last_indexed_at ?? null,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:index — generate tree for a PDF resource
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

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      if (resource.type !== 'pdf') {
        return { success: false, error: `PageIndex only supports PDF resources (got: ${resource.type})` };
      }

      const internalPath = resource.internal_path;
      if (!internalPath) {
        return { success: false, error: 'Resource has no internal file path' };
      }

      const fullPath = fileStorage.getFullPath(internalPath);
      if (!fullPath || !require('fs').existsSync(fullPath)) {
        return { success: false, error: `PDF file not found at: ${fullPath}` };
      }

      // Ensure service is running
      if (!pageIndexService.isRunning()) {
        await pageIndexService.start(database);
      }

      console.log(`[PageIndex] Indexing resource ${resourceId}:`, fullPath);
      const result = await pageIndexService.indexPDF(resourceId, fullPath);

      if (!result.success) {
        return { success: false, error: result.error || 'Indexing failed' };
      }

      // Persist tree in SQLite
      const settingQuery = queries.getSetting.get('ai_model');
      const modelUsed = settingQuery?.value || 'unknown';

      queries.upsertPageIndex.run(resourceId, result.tree_json, Date.now(), modelUsed);

      console.log(`[PageIndex] Resource ${resourceId} indexed successfully`);
      return { success: true, resourceId };

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

    if (!query || typeof query !== 'string') {
      return { success: false, error: 'query is required' };
    }

    if (query.length > 2000) {
      return { success: false, error: 'query too long (max 2000 characters)' };
    }

    try {
      const queries = database.getQueries();

      // Fetch indexed trees
      let trees = [];
      if (Array.isArray(resourceIds) && resourceIds.length > 0) {
        const idsJson = JSON.stringify(resourceIds);
        trees = queries.getPageIndexByIds.all(idsJson);
      } else {
        // Search across all indexed documents
        trees = queries.getAllPageIndexedIds.all().map(row => {
          return queries.getPageIndex.get(row.resource_id);
        }).filter(Boolean);
      }

      if (trees.length === 0) {
        return {
          success: true,
          query,
          method: 'pageindex',
          count: 0,
          results: [],
          message: 'No indexed documents found. Index PDF resources first.',
        };
      }

      // Ensure service is running
      if (!pageIndexService.isRunning()) {
        await pageIndexService.start(database);
      }

      const treePayload = trees.map(t => ({
        resource_id: t.resource_id,
        tree_json: t.tree_json,
      }));

      const searchResult = await pageIndexService.search(query, treePayload, topK);

      if (!searchResult.success) {
        return { success: false, error: searchResult.error || 'Search failed' };
      }

      // Enrich results with resource metadata from SQLite
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

      return {
        success: true,
        query,
        method: 'pageindex',
        count: enriched.length,
        results: enriched,
      };

    } catch (err) {
      console.error('[PageIndex IPC] search error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:delete — remove index for a resource
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:delete', async (event, { resourceId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!resourceId || typeof resourceId !== 'string') {
      return { success: false, error: 'Invalid resourceId' };
    }

    try {
      const queries = database.getQueries();
      queries.deletePageIndex.run(resourceId);
      return { success: true };
    } catch (err) {
      console.error('[PageIndex IPC] delete error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // pageindex:reindex — re-index all PDF resources
  // ---------------------------------------------------------------------------
  ipcMain.handle('pageindex:reindex', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Ensure service is running first
      if (!pageIndexService.isRunning()) {
        await pageIndexService.start(database);
      }

      const queries = database.getQueries();

      // Get all PDF resources that have an internal file path
      const db = database.getDB ? database.getDB() : null;
      if (!db) return { success: false, error: 'Database not available' };

      const pdfs = db.prepare(`
        SELECT id, internal_path FROM resources
        WHERE type = 'pdf' AND internal_path IS NOT NULL
      `).all();

      let indexed = 0;
      let failed = 0;

      for (const pdf of pdfs) {
        const fullPath = fileStorage.getFullPath(pdf.internal_path);
        if (!fullPath || !require('fs').existsSync(fullPath)) {
          failed++;
          continue;
        }

        try {
          const result = await pageIndexService.indexPDF(pdf.id, fullPath);
          if (result.success && result.tree_json) {
            queries.upsertPageIndex.run(pdf.id, result.tree_json, Date.now(), null);
            indexed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      return { success: true, indexed, failed, total: pdfs.length };

    } catch (err) {
      console.error('[PageIndex IPC] reindex error:', err.message);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
