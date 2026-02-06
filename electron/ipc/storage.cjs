/* eslint-disable no-console */
function register({ ipcMain, windowManager, database, fileStorage }) {
  ipcMain.handle('storage:getUsage', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const usage = fileStorage.getStorageUsage();
      return { success: true, data: usage };
    } catch (error) {
      console.error('[Storage] Error getting usage:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Clean up orphaned files (files not referenced in database)
   */
  ipcMain.handle('storage:cleanup', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();

      // Get all valid file paths from database
      const internalPaths = queries.getAllInternalPaths.all().map((r) => r.internal_path);

      // Get current avatar path from settings
      const avatarSetting = queries.getSetting.get('user_avatar_path');
      const currentAvatarPath = avatarSetting?.value || null;

      // Clean up orphaned files including avatars
      const result = fileStorage.cleanupOrphanedFiles(internalPaths, currentAvatarPath);

      console.log(`[Storage] Cleanup: deleted ${result.deleted} orphaned files, freed ${result.freedBytes} bytes`);

      return { success: true, data: result };
    } catch (error) {
      console.error('[Storage] Error during cleanup:', error);
      return { success: false, error: error.message };
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
