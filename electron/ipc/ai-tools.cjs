/* eslint-disable no-console */

const documentGenerator = require('../document-generator.cjs');

const TOOL_TRACE = process.env.NODE_ENV === 'development' || process.env.DEBUG_AI_TOOLS === '1';

function toolNameFromChannel(channel) {
  const prefix = 'ai:tools:';
  return channel.startsWith(prefix) ? channel.slice(prefix.length) : channel;
}

function broadcastToolAnalytics(windowManager, channel, success) {
  if (windowManager && typeof windowManager.broadcast === 'function') {
    windowManager.broadcast('analytics:event', {
      event: 'ai_tool_invoked',
      properties: { tool_name: toolNameFromChannel(channel), success },
    });
  }
}

function toolTrace(channel, params, result, err) {
  if (!TOOL_TRACE) return;
  const sanitize = (obj, maxLen = 120) => {
    if (obj == null) return obj;
    if (typeof obj === 'string') return obj.length > maxLen ? obj.slice(0, maxLen) + '...' : obj;
    if (Array.isArray(obj)) return obj.slice(0, 3).map((x) => sanitize(x, 60));
    if (typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (['content', 'snippet', 'embedding'].includes(k)) continue;
        out[k] = sanitize(v, 80);
      }
      return out;
    }
    return obj;
  };
  if (err) {
    console.log(`[AI:Tools] ${channel} ERROR`, { params: sanitize(params), error: err.message });
  } else {
    const summary = result?.success === false ? { success: false, error: result.error } : { success: true, count: result?.count ?? result?.resources?.length ?? result?.resource ? 1 : '?' };
    console.log(`[AI:Tools] ${channel}`, { params: sanitize(params), result: summary });
  }
}

function register({ ipcMain, windowManager, aiToolsHandler }) {
  /**
   * Resource search using full-text search
   */
  ipcMain.handle('ai:tools:resourceSearch', async (event, { query, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceSearch(query, options || {});
      toolTrace('resourceSearch', { query, options }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceSearch', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('resourceSearch', { query, options }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceSearch', false);
      console.error('[AI Tools] resourceSearch error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get resource by ID with full content
   */
  ipcMain.handle('ai:tools:resourceGet', async (event, { resourceId, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceGet(resourceId, options || {});
      toolTrace('resourceGet', { resourceId, options }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceGet', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('resourceGet', { resourceId, options }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceGet', false);
      console.error('[AI Tools] resourceGet error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get a specific section of an indexed PDF/note by node_id
   */
  ipcMain.handle('ai:tools:resourceGetSection', async (event, { resourceId, nodeId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceGetSection(resourceId, nodeId);
      toolTrace('resourceGetSection', { resourceId, nodeId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceGetSection', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('resourceGetSection', { resourceId, nodeId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceGetSection', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * List resources with optional filters
   */
  ipcMain.handle('ai:tools:resourceList', async (event, { options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceList(options || {});
      toolTrace('resourceList', { options }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceList', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('resourceList', { options }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceList', false);
      console.error('[AI Tools] resourceList error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Semantic search using embeddings
   */
  ipcMain.handle('ai:tools:resourceSemanticSearch', async (event, { query, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceSemanticSearch(query, options || {});
      toolTrace('resourceSemanticSearch', { query, options }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceSemanticSearch', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('resourceSemanticSearch', { query, options }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceSemanticSearch', false);
      console.error('[AI Tools] resourceSemanticSearch error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * List all projects
   */
  ipcMain.handle('ai:tools:projectList', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.projectList();
      toolTrace('projectList', {}, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:projectList', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('projectList', {}, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:projectList', false);
      console.error('[AI Tools] projectList error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get project by ID
   */
  ipcMain.handle('ai:tools:projectGet', async (event, { projectId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.projectGet(projectId);
      toolTrace('projectGet', { projectId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:projectGet', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('projectGet', { projectId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:projectGet', false);
      console.error('[AI Tools] projectGet error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * List interactions for a resource
   */
  ipcMain.handle('ai:tools:interactionList', async (event, { resourceId, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.interactionList(resourceId, options || {});
      toolTrace('interactionList', { resourceId, options }, { success: true, count: result?.length ?? 0 });
      broadcastToolAnalytics(windowManager, 'ai:tools:interactionList', true);
      return result;
    } catch (error) {
      toolTrace('interactionList', { resourceId, options }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:interactionList', false);
      console.error('[AI Tools] interactionList error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get recent resources for context
   */
  ipcMain.handle('ai:tools:getRecentResources', async (event, { limit }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const resources = await aiToolsHandler.getRecentResources(limit || 5);
      toolTrace('getRecentResources', { limit }, { success: true, count: resources?.length ?? 0 });
      broadcastToolAnalytics(windowManager, 'ai:tools:getRecentResources', true);
      return { success: true, resources };
    } catch (error) {
      toolTrace('getRecentResources', { limit }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:getRecentResources', false);
      console.error('[AI Tools] getRecentResources error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get current/default project
   */
  ipcMain.handle('ai:tools:getCurrentProject', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const project = await aiToolsHandler.getCurrentProject();
      toolTrace('getCurrentProject', {}, { success: true, hasProject: !!project });
      broadcastToolAnalytics(windowManager, 'ai:tools:getCurrentProject', true);
      return { success: true, project };
    } catch (error) {
      toolTrace('getCurrentProject', {}, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:getCurrentProject', false);
      console.error('[AI Tools] getCurrentProject error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:getLibraryOverview', async (event, { options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.getLibraryOverview(options || {});
      toolTrace('getLibraryOverview', { options }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:getLibraryOverview', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('getLibraryOverview', { options }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:getLibraryOverview', false);
      console.error('[AI Tools] getLibraryOverview error:', error);
      return { success: false, error: error.message };
    }
  });

  // AI Tools - Resource Actions (Create, Update, Delete)
  ipcMain.handle('ai:tools:resourceCreate', async (event, { data }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceCreate(data);
      toolTrace('resourceCreate', { type: data?.type, title: data?.title }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceCreate', result?.success !== false);
      if (result.success && result.resource) {
        windowManager.broadcast('resource:created', result.resource);
      }
      return result;
    } catch (error) {
      toolTrace('resourceCreate', { type: data?.type }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceCreate', false);
      console.error('[AI Tools] resourceCreate error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:resourceUpdate', async (event, { resourceId, updates }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceUpdate(resourceId, updates);
      toolTrace('resourceUpdate', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceUpdate', result?.success !== false);
      if (result.success && result.resource) {
        const r = result.resource;
        const broadcastUpdates = {
          title: r.title,
          updated_at: r.updated_at,
        };
        if (r.metadata != null) broadcastUpdates.metadata = r.metadata;
        if (updates.content !== undefined) broadcastUpdates.content = updates.content;
        windowManager.broadcast('resource:updated', { id: r.id, updates: broadcastUpdates });
      }
      return result;
    } catch (error) {
      toolTrace('resourceUpdate', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceUpdate', false);
      console.error('[AI Tools] resourceUpdate error:', error);
      return { success: false, error: error.message };
    }
  });

  // AI Tools - Flashcard Creation
  ipcMain.handle('ai:tools:flashcardCreate', async (event, { data }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.flashcardCreate(data);
      toolTrace('flashcardCreate', { title: data?.title, cardsCount: data?.cards?.length }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:flashcardCreate', result?.success !== false);
      if (result.success && result.deck) {
        windowManager.broadcast('flashcard:deckCreated', result.deck);
      }
      if (result.success && result.studioOutput) {
        windowManager.broadcast('studio:outputCreated', result.studioOutput);
      }
      return result;
    } catch (error) {
      toolTrace('flashcardCreate', { title: data?.title }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:flashcardCreate', false);
      console.error('[AI Tools] flashcardCreate error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:resourceDelete', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceDelete(resourceId);
      toolTrace('resourceDelete', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceDelete', result?.success !== false);
      if (result.success && result.deleted) {
        windowManager.broadcast('resource:deleted', { id: resourceId });
      }
      return result;
    } catch (error) {
      toolTrace('resourceDelete', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceDelete', false);
      console.error('[AI Tools] resourceDelete error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Import file content to Dome library (used by agents that read files via MCP servers)
   */
  ipcMain.handle('ai:tools:importFileToLibrary', async (event, args) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.importFileToLibrary(args || {});
      toolTrace('importFileToLibrary', { title: args?.title, mime_type: args?.mime_type }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:importFileToLibrary', result?.success !== false);
      if (result.success && result.resource) {
        windowManager.broadcast('resource:created', result.resource);
      }
      return result;
    } catch (error) {
      toolTrace('importFileToLibrary', { title: args?.title }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:importFileToLibrary', false);
      console.error('[AI Tools] importFileToLibrary error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:resourceMoveToFolder', async (event, { resourceId, folderId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceMoveToFolder(resourceId, folderId);
      toolTrace('resourceMoveToFolder', { resourceId, folderId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceMoveToFolder', result?.success !== false);
      if (result.success) {
        const now = Date.now();
        windowManager.broadcast('resource:updated', {
          id: resourceId,
          updates: { folder_id: folderId ?? null, updated_at: now },
        });
      }
      return result;
    } catch (error) {
      toolTrace('resourceMoveToFolder', { resourceId, folderId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:resourceMoveToFolder', false);
      console.error('[AI Tools] resourceMoveToFolder error:', error);
      return { success: false, error: error.message };
    }
  });

  // Excel tools
  ipcMain.handle('ai:tools:excelGet', async (event, { resourceId, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.excelGet(resourceId, options || {});
      toolTrace('excelGet', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelGet', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('excelGet', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelGet', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:excelGetFilePath', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.excelGetFilePath(resourceId);
      toolTrace('excelGetFilePath', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelGetFilePath', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('excelGetFilePath', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelGetFilePath', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:excelSetCell', async (event, { resourceId, sheetName, cell, value }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.excelSetCell(resourceId, sheetName, cell, value);
      toolTrace('excelSetCell', { resourceId, cell }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelSetCell', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('excelSetCell', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelSetCell', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:excelSetRange', async (event, { resourceId, sheetName, range, values }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.excelSetRange(resourceId, sheetName, range, values);
      toolTrace('excelSetRange', { resourceId, range }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelSetRange', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('excelSetRange', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelSetRange', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:excelAddRow', async (event, { resourceId, sheetName, values, afterRow }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.excelAddRow(resourceId, sheetName, values, afterRow);
      toolTrace('excelAddRow', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelAddRow', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('excelAddRow', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelAddRow', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:excelAddSheet', async (event, { resourceId, sheetName, data }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.excelAddSheet(resourceId, sheetName, data);
      toolTrace('excelAddSheet', { resourceId, sheetName }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelAddSheet', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('excelAddSheet', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelAddSheet', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:excelCreate', async (event, { projectId, title, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.excelCreate(projectId, title, options || {});
      toolTrace('excelCreate', { title }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelCreate', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('excelCreate', { title }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelCreate', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:excelExport', async (event, { resourceId, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.excelExport(resourceId, options || {});
      toolTrace('excelExport', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelExport', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('excelExport', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:excelExport', false);
      return { success: false, error: error.message };
    }
  });

  // PPT tools
  ipcMain.handle('ai:tools:pptCreate', async (event, { projectId, title, spec, script, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const opts = { ...(options || {}) };
      if (script || opts.script) opts.script = script || opts.script;
      const displayTitle = title || 'Sin título';

      if (opts.sync) {
        // Synchronous mode: await result immediately (for QA loop — Many can inspect slides right after)
        const result = await aiToolsHandler.pptCreate(projectId, title, spec || {}, opts);
        toolTrace('pptCreate', { title, sync: true }, result);
        broadcastToolAnalytics(windowManager, 'ai:tools:pptCreate', result?.success !== false);
        if (result.success && result.resource) {
          windowManager.broadcast('ppt:created', { resource: result.resource, title: displayTitle });
        } else {
          windowManager.broadcast('ppt:creation-failed', {
            title: displayTitle,
            error: result.error || 'Error desconocido',
          });
        }
        return result;
      }

      // Fire-and-forget: run in background, return immediately so the agent can move on
      aiToolsHandler.pptCreate(projectId, title, spec || {}, opts).then((result) => {
        toolTrace('pptCreate', { title }, result);
        broadcastToolAnalytics(windowManager, 'ai:tools:pptCreate', result?.success !== false);
        if (result.success && result.resource) {
          // resource:created is already broadcast inside pptCreate; add the PPT-specific notification
          windowManager.broadcast('ppt:created', { resource: result.resource, title: displayTitle });
        } else {
          windowManager.broadcast('ppt:creation-failed', {
            title: displayTitle,
            error: result.error || 'Error desconocido',
          });
        }
      }).catch((error) => {
        toolTrace('pptCreate', { title }, null, error);
        broadcastToolAnalytics(windowManager, 'ai:tools:pptCreate', false);
        windowManager.broadcast('ppt:creation-failed', {
          title: displayTitle,
          error: error.message || 'Error desconocido',
        });
      });

      return {
        success: true,
        status: 'generating',
        title: displayTitle,
        message: `La presentación "${displayTitle}" se está creando en segundo plano. Puedes seguir trabajando — recibirás una notificación cuando esté lista.`,
      };
    } catch (error) {
      toolTrace('pptCreate', { title }, null, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:pptGetFilePath', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.pptGetFilePath(resourceId);
      toolTrace('pptGetFilePath', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pptGetFilePath', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('pptGetFilePath', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pptGetFilePath', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:pptGetSlides', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.pptGetSlides(resourceId);
      toolTrace('pptGetSlides', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pptGetSlides', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('pptGetSlides', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pptGetSlides', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:pptExport', async (event, { resourceId, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.pptExport(resourceId, options || {});
      toolTrace('pptExport', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pptExport', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('pptExport', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pptExport', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:pptGetSlideImages', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const pathResult = await aiToolsHandler.pptGetFilePath(resourceId);
      if (!pathResult.success || !pathResult.file_path) {
        return { success: false, error: pathResult.error || 'Failed to get file path' };
      }
      const result = await documentGenerator.extractPptImages(pathResult.file_path);
      toolTrace('pptGetSlideImages', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pptGetSlideImages', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('pptGetSlideImages', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pptGetSlideImages', false);
      return { success: false, error: error.message };
    }
  });

  // ─── Calendar tools ───────────────────────────────────────────────────────

  ipcMain.handle('ai:tools:calendarListEvents', async (event, args) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const result = await aiToolsHandler.calendarListEvents(args || {});
      toolTrace('calendarListEvents', args, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarListEvents', result?.success !== false);
      return result;
    } catch (error) {
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarListEvents', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:calendarGetUpcoming', async (event, args) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const result = await aiToolsHandler.calendarGetUpcoming(args || {});
      toolTrace('calendarGetUpcoming', args, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarGetUpcoming', result?.success !== false);
      return result;
    } catch (error) {
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarGetUpcoming', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:calendarCreateEvent', async (event, data) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const result = await aiToolsHandler.calendarCreateEvent(data || {});
      toolTrace('calendarCreateEvent', data, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarCreateEvent', result?.success !== false);
      return result;
    } catch (error) {
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarCreateEvent', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:calendarUpdateEvent', async (event, data) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const result = await aiToolsHandler.calendarUpdateEvent(data || {});
      toolTrace('calendarUpdateEvent', data, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarUpdateEvent', result?.success !== false);
      return result;
    } catch (error) {
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarUpdateEvent', false);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:calendarDeleteEvent', async (event, data) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const result = await aiToolsHandler.calendarDeleteEvent(data || {});
      toolTrace('calendarDeleteEvent', data, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarDeleteEvent', result?.success !== false);
      return result;
    } catch (error) {
      broadcastToolAnalytics(windowManager, 'ai:tools:calendarDeleteEvent', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get hierarchical outline/table of contents for an indexed document
   */
  ipcMain.handle('ai:tools:getDocumentStructure', async (event, { resource_id }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.getDocumentStructure({ resource_id });
      toolTrace('getDocumentStructure', { resource_id }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:getDocumentStructure', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('getDocumentStructure', { resource_id }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:getDocumentStructure', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * Create a semantic link between two resources
   */
  ipcMain.handle('ai:tools:linkResources', async (event, args) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.linkResources(args || {});
      toolTrace('linkResources', args, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:linkResources', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('linkResources', args, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:linkResources', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get all resources linked to/from a given resource
   */
  ipcMain.handle('ai:tools:getRelatedResources', async (event, args) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await aiToolsHandler.getRelatedResources(args || {});
      toolTrace('getRelatedResources', args, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:getRelatedResources', result?.success !== false);
      return result;
    } catch (error) {
      toolTrace('getRelatedResources', args, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:getRelatedResources', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * Extract text content from a PDF
   */
  ipcMain.handle('ai:tools:pdfExtractText', async (event, { resourceId, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const pdfExtractor = require('../pdf-extractor.cjs');
      const database = require('../database.cjs').default.getDatabase();
      
      const filePathResult = await pdfExtractor.getPdfFilePathFromResource(resourceId, database);
      if (!filePathResult.success) {
        return filePathResult;
      }
      
      const result = await pdfExtractor.extractPdfText(filePathResult.filePath, options || {});
      toolTrace('pdfExtractText', { resourceId, options }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfExtractText', result?.success !== false);
      return { ...result, title: filePathResult.title };
    } catch (error) {
      toolTrace('pdfExtractText', { resourceId, options }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfExtractText', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get PDF metadata (title, author, page count, etc.)
   */
  ipcMain.handle('ai:tools:pdfGetMetadata', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const pdfExtractor = require('../pdf-extractor.cjs');
      const database = require('../database.cjs').default.getDatabase();
      
      const filePathResult = await pdfExtractor.getPdfFilePathFromResource(resourceId, database);
      if (!filePathResult.success) {
        return filePathResult;
      }
      
      const result = await pdfExtractor.getPdfMetadata(filePathResult.filePath);
      toolTrace('pdfGetMetadata', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfGetMetadata', result?.success !== false);
      return { ...result, title: filePathResult.title };
    } catch (error) {
      toolTrace('pdfGetMetadata', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfGetMetadata', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get PDF structure (headings per page)
   */
  ipcMain.handle('ai:tools:pdfGetStructure', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const pdfExtractor = require('../pdf-extractor.cjs');
      const database = require('../database.cjs').default.getDatabase();
      
      const filePathResult = await pdfExtractor.getPdfFilePathFromResource(resourceId, database);
      if (!filePathResult.success) {
        return filePathResult;
      }
      
      const result = await pdfExtractor.extractPdfStructure(filePathResult.filePath);
      toolTrace('pdfGetStructure', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfGetStructure', result?.success !== false);
      return { ...result, title: filePathResult.title };
    } catch (error) {
      toolTrace('pdfGetStructure', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfGetStructure', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * Summarize PDF content
   */
  ipcMain.handle('ai:tools:pdfSummarize', async (event, { resourceId, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const pdfExtractor = require('../pdf-extractor.cjs');
      const database = require('../database.cjs').default.getDatabase();
      
      const filePathResult = await pdfExtractor.getPdfFilePathFromResource(resourceId, database);
      if (!filePathResult.success) {
        return filePathResult;
      }
      
      const result = await pdfExtractor.summarizePdf(filePathResult.filePath, options || {});
      toolTrace('pdfSummarize', { resourceId, options }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfSummarize', result?.success !== false);
      return { ...result, title: filePathResult.title };
    } catch (error) {
      toolTrace('pdfSummarize', { resourceId, options }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfSummarize', false);
      return { success: false, error: error.message };
    }
  });

  /**
   * Extract tables from PDF
   */
  ipcMain.handle('ai:tools:pdfExtractTables', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const pdfExtractor = require('../pdf-extractor.cjs');
      const database = require('../database.cjs').default.getDatabase();
      
      const filePathResult = await pdfExtractor.getPdfFilePathFromResource(resourceId, database);
      if (!filePathResult.success) {
        return filePathResult;
      }
      
      const result = await pdfExtractor.extractPdfTables(filePathResult.filePath);
      toolTrace('pdfExtractTables', { resourceId }, result);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfExtractTables', result?.success !== false);
      return { ...result, title: filePathResult.title };
    } catch (error) {
      toolTrace('pdfExtractTables', { resourceId }, null, error);
      broadcastToolAnalytics(windowManager, 'ai:tools:pdfExtractTables', false);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
