/* eslint-disable no-console */
function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:tags:getByResource', (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getTagsByResource) {
        return { success: false, error: 'Tags not available', data: [] };
      }
      const tags = queries.getTagsByResource.all(resourceId);
      return { success: true, data: tags };
    } catch (error) {
      console.error('[DB] Error getting tags by resource:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:getAll', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getAllTagsWithCount) {
        return { success: false, error: 'Tags query not available', data: [] };
      }
      const tags = queries.getAllTagsWithCount.all();
      return { success: true, data: tags };
    } catch (error) {
      console.error('[DB] Error getting all tags:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('db:tags:getResources', (event, tagId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (!queries.getResourcesByTag) {
        return { success: false, error: 'Resources by tag query not available', data: [] };
      }
      const resources = queries.getResourcesByTag.all(tagId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting resources by tag:', error);
      return { success: false, error: error.message, data: [] };
    }
  });
}

module.exports = { register };
