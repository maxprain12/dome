/* eslint-disable no-console */

const TOOL_TRACE = process.env.NODE_ENV === 'development' || process.env.DEBUG_AI_TOOLS === '1';

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
      return result;
    } catch (error) {
      toolTrace('resourceSearch', { query, options }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('resourceGet', { resourceId, options }, null, error);
      console.error('[AI Tools] resourceGet error:', error);
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
      return result;
    } catch (error) {
      toolTrace('resourceList', { options }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('resourceSemanticSearch', { query, options }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('projectList', {}, null, error);
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
      return result;
    } catch (error) {
      toolTrace('projectGet', { projectId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('interactionList', { resourceId, options }, null, error);
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
      return { success: true, resources };
    } catch (error) {
      toolTrace('getRecentResources', { limit }, null, error);
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
      return { success: true, project };
    } catch (error) {
      toolTrace('getCurrentProject', {}, null, error);
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
      return result;
    } catch (error) {
      toolTrace('getLibraryOverview', { options }, null, error);
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
      if (result.success && result.resource) {
        windowManager.broadcast('resource:created', result.resource);
      }
      return result;
    } catch (error) {
      toolTrace('resourceCreate', { type: data?.type }, null, error);
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
      if (result.success && result.deck) {
        windowManager.broadcast('flashcard:deckCreated', result.deck);
      }
      if (result.success && result.studioOutput) {
        windowManager.broadcast('studio:outputCreated', result.studioOutput);
      }
      return result;
    } catch (error) {
      toolTrace('flashcardCreate', { title: data?.title }, null, error);
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
      if (result.success && result.deleted) {
        windowManager.broadcast('resource:deleted', { id: resourceId });
      }
      return result;
    } catch (error) {
      toolTrace('resourceDelete', { resourceId }, null, error);
      console.error('[AI Tools] resourceDelete error:', error);
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
      return result;
    } catch (error) {
      toolTrace('excelGet', { resourceId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('excelGetFilePath', { resourceId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('excelSetCell', { resourceId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('excelSetRange', { resourceId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('excelAddRow', { resourceId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('excelAddSheet', { resourceId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('excelCreate', { title }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('excelExport', { resourceId }, null, error);
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

      // Fire-and-forget: run in background, return immediately so the agent can move on
      aiToolsHandler.pptCreate(projectId, title, spec || {}, opts).then((result) => {
        toolTrace('pptCreate', { title }, result);
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
      return result;
    } catch (error) {
      toolTrace('pptGetFilePath', { resourceId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('pptGetSlides', { resourceId }, null, error);
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
      return result;
    } catch (error) {
      toolTrace('pptExport', { resourceId }, null, error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
