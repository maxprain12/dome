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
        windowManager.broadcast('resource:updated', result.resource);
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
}

module.exports = { register };
