/* eslint-disable no-console */
const fs = require('fs');
const crypto = require('crypto');
const notesService = require('../notes-service.cjs');

function generateSlugId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

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
   * Migrate legacy resources(type='note') to notes domain
   */
  ipcMain.handle('migration:migrateNotesToDomain', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const legacyNotes = queries.getLegacyNoteResources.all();

      if (legacyNotes.length === 0) {
        return { success: true, data: { migrated: 0, failed: 0 } };
      }

      console.log(`[Migration] Found ${legacyNotes.length} legacy notes to migrate`);

      let migrated = 0;
      let failed = 0;
      const errors = [];

      for (const r of legacyNotes) {
        try {
          const position = notesService.nextPosition(queries, r.project_id || 'default', null);
          const slugId = generateSlugId();
          const textContent = (r.content || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/#{1,6}\s?/g, '')
            .slice(0, 50000);

          queries.createNote.run(
            r.id,
            slugId,
            r.project_id || 'default',
            null,
            r.title || 'Untitled',
            null,
            r.content || null,
            textContent,
            position,
            r.created_at || Date.now(),
            r.updated_at || Date.now(),
            null,
            null
          );

          console.log(`[Migration] Migrated note: ${r.title}`);
          migrated++;
        } catch (error) {
          console.error(`[Migration] Failed to migrate note ${r.id}:`, error);
          errors.push({ id: r.id, error: error.message });
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
      console.error('[Migration] Error migrating notes:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get notes migration status (legacy notes pending)
   */
  ipcMain.handle('migration:getNotesMigrationStatus', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const legacyNotes = queries.getLegacyNoteResources.all();

      return {
        success: true,
        data: {
          pendingMigrations: legacyNotes.length,
          notes: legacyNotes.map((r) => ({ id: r.id, title: r.title })),
        },
      };
    } catch (error) {
      console.error('[Migration] Error getting notes migration status:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get migration status (legacy file paths)
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
