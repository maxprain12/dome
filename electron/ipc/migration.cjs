/* eslint-disable no-console */
const fs = require('fs');

function register({ ipcMain, windowManager, database, fileStorage, thumbnail }) {
  ipcMain.handle('migration:migrateResources', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const legacyResources = queries.getResourcesWithLegacyPath.all();

      if (legacyResources.length === 0) {
        return { success: true, data: { migrated: 0, failed: 0 } };
      }

      console.log(`[Migration] Found ${legacyResources.length} resources to migrate`);

      let migrated = 0;
      let failed = 0;
      const errors = [];

      for (const resource of legacyResources) {
        try {
          // Check if original file exists
          if (!fs.existsSync(resource.file_path)) {
            console.warn(`[Migration] File not found for ${resource.id}: ${resource.file_path}`);
            errors.push({ id: resource.id, error: 'File not found' });
            failed++;
            continue;
          }

          // Import to internal storage
          const importResult = await fileStorage.importFile(resource.file_path, resource.type);

          // Generate thumbnail
          const fullPath = fileStorage.getFullPath(importResult.internalPath);
          const thumbnailData = await thumbnail.generateThumbnail(
            fullPath,
            resource.type,
            importResult.mimeType
          );

          // Update resource
          queries.updateResourceFile.run(
            importResult.internalPath,
            importResult.mimeType,
            importResult.size,
            importResult.hash,
            thumbnailData,
            importResult.originalName,
            Date.now(),
            resource.id
          );

          console.log(`[Migration] Migrated: ${resource.title}`);
          migrated++;
        } catch (error) {
          console.error(`[Migration] Failed to migrate ${resource.id}:`, error);
          errors.push({ id: resource.id, error: error.message });
          failed++;
        }
      }

      return {
        success: true,
        data: {
          migrated,
          failed,
          errors: errors.length > 0 ? errors : undefined,
        },
      };
    } catch (error) {
      console.error('[Migration] Error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get migration status
   */
  ipcMain.handle('migration:getStatus', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const legacyResources = queries.getResourcesWithLegacyPath.all();

      return {
        success: true,
        data: {
          pendingMigrations: legacyResources.length,
          resources: legacyResources.map((r) => ({
            id: r.id,
            title: r.title,
            file_path: r.file_path,
          })),
        },
      };
    } catch (error) {
      console.error('[Migration] Error getting status:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
