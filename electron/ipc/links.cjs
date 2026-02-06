/* eslint-disable no-console */
function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('db:links:create', (event, link) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.createLink.run(
        link.id,
        link.source_id,
        link.target_id,
        link.link_type,
        link.weight || 1.0,
        link.metadata ? JSON.stringify(link.metadata) : null,
        link.created_at
      );
      return { success: true, data: link };
    } catch (error) {
      console.error('[DB] Error creating link:', error);
      return { success: false, error: error.message };
    }
  });

  // Get links by source
  ipcMain.handle('db:links:getBySource', (event, sourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const links = queries.getLinksBySource.all(sourceId);
      return { success: true, data: links };
    } catch (error) {
      console.error('[DB] Error getting links by source:', error);
      return { success: false, error: error.message };
    }
  });

  // Get links by target
  ipcMain.handle('db:links:getByTarget', (event, targetId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const links = queries.getLinksByTarget.all(targetId);
      return { success: true, data: links };
    } catch (error) {
      console.error('[DB] Error getting links by target:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete link
  ipcMain.handle('db:links:delete', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.deleteLink.run(id);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting link:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
