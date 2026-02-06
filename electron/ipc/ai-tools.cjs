/* eslint-disable no-console */
function register({ ipcMain, windowManager, aiToolsHandler }) {
  /**
   * Resource search using full-text search
   */
  ipcMain.handle('ai:tools:resourceSearch', async (event, { query, options }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      return await aiToolsHandler.resourceSearch(query, options || {});
    } catch (error) {
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
      return await aiToolsHandler.resourceGet(resourceId, options || {});
    } catch (error) {
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
      return await aiToolsHandler.resourceList(options || {});
    } catch (error) {
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
      return await aiToolsHandler.resourceSemanticSearch(query, options || {});
    } catch (error) {
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
      return await aiToolsHandler.projectList();
    } catch (error) {
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
      return await aiToolsHandler.projectGet(projectId);
    } catch (error) {
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
      return await aiToolsHandler.interactionList(resourceId, options || {});
    } catch (error) {
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
      return { success: true, resources };
    } catch (error) {
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
      return { success: true, project };
    } catch (error) {
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
      if (result.success && result.resource) {
        windowManager.broadcast('resource:created', result.resource);
      }
      return result;
    } catch (error) {
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
      if (result.success && result.resource) {
        windowManager.broadcast('resource:updated', result.resource);
      }
      return result;
    } catch (error) {
      console.error('[AI Tools] resourceUpdate error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:tools:resourceDelete', async (event, { resourceId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await aiToolsHandler.resourceDelete(resourceId);
      if (result.success && result.deleted) {
        windowManager.broadcast('resource:deleted', { id: resourceId });
      }
      return result;
    } catch (error) {
      console.error('[AI Tools] resourceDelete error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
