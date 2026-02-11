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
}

module.exports = { register };
