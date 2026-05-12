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
      return { success: false, error: error instanceof Error ? error.message : String(error) };
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

      // Get all valid file paths from database (resources + resource_images / thumbnails)
      const resourcePaths = queries.getAllInternalPaths.all().map((r) => r.internal_path);
      const imagePaths = (queries.getResourceImageInternalPaths?.all?.() ?? []).map((r) => r.internal_path);
      const internalPaths = [...resourcePaths, ...imagePaths];

      // Get current avatar path from settings
      const avatarSetting = queries.getSetting.get('user_avatar_path');
      const currentAvatarPath = avatarSetting?.value || null;

      // Clean up orphaned files including avatars
      const result = fileStorage.cleanupOrphanedFiles(internalPaths, currentAvatarPath);

      console.log(`[Storage] Cleanup: deleted ${result.deleted} orphaned files, freed ${result.freedBytes} bytes`);

      return { success: true, data: result };
    } catch (error) {
      console.error('[Storage] Error during cleanup:', error);
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

    try {
      return { success: true, data: fileStorage.getStorageDir() };
    } catch (error) {
      console.error('[Storage] Error getting path:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

module.exports = { register };
