/* eslint-disable no-console */
function register({ ipcMain, windowManager, database, fileStorage }) {
  ipcMain.handle('storage:getUsage', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const usage = fileStorage.getStorageUsage(database);
      return { success: true, data: usage };
    } catch (error) {
      console.error('[Storage] Error getting usage:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  /**
   * Get storage directory path
   */
  ipcMain.handle('storage:getPath', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    return { success: true, data: fileStorage.getStorageDir() };
  });
}

module.exports = { register };
