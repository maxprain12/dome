/* eslint-disable no-console */
const crypto = require('crypto');
const resourceIndexer = require('../resource-indexer.cjs');

/**
 * Generate a unique ID for resources
 */
function generateId() {
  return crypto.randomUUID();
}

function register({ ipcMain, fs, path, windowManager, database, fileStorage, thumbnail, documentExtractor, initModule, ollamaService }) {
  const indexerDeps = initModule && ollamaService ? { database, initModule, ollamaService } : null;
  /**
   * Import a file: copy to internal storage and create resource
   */
  ipcMain.handle('resource:import', async (event, { filePath, projectId, type, title }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      // Import file to internal storage
      const importResult = await fileStorage.importFile(filePath, type);

      // Check for duplicate by hash
      const queries = database.getQueries();
      const existingResource = queries.findByHash.get(importResult.hash);
      if (existingResource) {
        return {
          success: false,
          error: 'duplicate',
          duplicate: {
            id: existingResource.id,
            title: existingResource.title,
            projectId: existingResource.project_id,
          },
        };
      }

      // Generate thumbnail for supported types
      const fullPath = fileStorage.getFullPath(importResult.internalPath);
      const thumbnailData = await thumbnail.generateThumbnail(
        fullPath,
        type,
        importResult.mimeType
      );

      // Extract video metadata if applicable
      let metadata = null;
      if (type === 'video') {
        try {
          metadata = await thumbnail.extractVideoMetadata(fullPath);
          if (metadata) {
            console.log(`[Resource] Video metadata: ${metadata.duration}s, ${metadata.width}x${metadata.height}, ${metadata.codec}`);
          }
        } catch (metadataError) {
          console.warn('[Resource] Video metadata extraction failed:', metadataError.message);
        }
      }

      // Extract text content for document types (for card preview and AI tools)
      let contentText = null;
      if (type === 'document') {
        try {
          contentText = await documentExtractor.extractDocumentText(fullPath, importResult.mimeType);
        } catch (extractError) {
          console.warn('[Resource] Text extraction failed, continuing without content:', extractError.message);
        }
      }
      // Extract text from PDFs on import (so resource_get has content without on-demand extraction)
      const isPdf = type === 'pdf' || (importResult.mimeType || '').includes('pdf') || (importResult.originalName || '').toLowerCase().endsWith('.pdf');
      if (isPdf && !contentText) {
        try {
          contentText = await documentExtractor.extractTextFromPDF(fullPath, 50000);
          if (contentText) {
            console.log(`[Resource] PDF text extracted: ${contentText.length} chars`);
          }
        } catch (extractError) {
          console.warn('[Resource] PDF text extraction failed:', extractError.message);
        }
      }

      // Create resource in database
      const resourceId = generateId();
      const now = Date.now();
      const resourceTitle = title || importResult.originalName || 'Untitled';

      queries.createResourceWithFile.run(
        resourceId,
        projectId,
        type,
        resourceTitle,
        contentText, // content - extracted text for documents
        null, // file_path (legacy, not used)
        importResult.internalPath,
        importResult.mimeType,
        importResult.size,
        importResult.hash,
        thumbnailData,
        importResult.originalName,
        metadata ? JSON.stringify(metadata) : null, // metadata - JSON string for video info
        now,
        now
      );

      // Get the created resource
      const resource = queries.getResourceById.get(resourceId);

      // Broadcast so Home and other windows update immediately
      windowManager.broadcast('resource:created', resource);

      if (indexerDeps && resource && resourceIndexer.shouldIndex(resource)) {
        resourceIndexer.scheduleIndexing(resourceId, indexerDeps);
      }

      console.log(`[Resource] Imported: ${resourceTitle} (${importResult.internalPath})`);

      return {
        success: true,
        data: resource,
        thumbnailDataUrl: thumbnailData,
      };
    } catch (error) {
      console.error('[Resource] Error importing file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Import multiple files at once
   */
  ipcMain.handle('resource:importMultiple', async (event, { filePaths, projectId, type }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const results = [];
    const errors = [];

    for (const filePath of filePaths) {
      try {
        if (!fs.existsSync(filePath)) {
          errors.push({ filePath, error: 'File not found' });
          continue;
        }

        // Determine type from extension if not provided
        const ext = path.extname(filePath).toLowerCase();
        let fileType = type;
        if (!fileType) {
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
            fileType = 'image';
          } else if (ext === '.pdf') {
            fileType = 'pdf';
          } else if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
            fileType = 'video';
          } else if (['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(ext)) {
            fileType = 'audio';
          } else {
            fileType = 'document';
          }
        }

        const importResult = await fileStorage.importFile(filePath, fileType);

        // Check for duplicate
        const queries = database.getQueries();
        const existingResource = queries.findByHash.get(importResult.hash);
        if (existingResource) {
          errors.push({
            filePath,
            error: 'duplicate',
            duplicate: existingResource,
          });
          continue;
        }

        // Generate thumbnail
        const fullPath = fileStorage.getFullPath(importResult.internalPath);
        const thumbnailData = await thumbnail.generateThumbnail(
          fullPath,
          fileType,
          importResult.mimeType
        );

        // Extract text for documents and PDFs
        let contentText = null;
        if (fileType === 'document') {
          try {
            contentText = await documentExtractor.extractDocumentText(fullPath, importResult.mimeType);
          } catch (e) {
            console.warn('[Resource] Document extraction failed:', e.message);
          }
        }
        const isPdf = fileType === 'pdf' || (importResult.mimeType || '').includes('pdf') || (importResult.originalName || '').toLowerCase().endsWith('.pdf');
        if (isPdf && !contentText) {
          try {
            contentText = await documentExtractor.extractTextFromPDF(fullPath, 50000);
          } catch (e) {
            console.warn('[Resource] PDF extraction failed:', e.message);
          }
        }

        // Create resource
        const resourceId = generateId();
        const now = Date.now();

        queries.createResourceWithFile.run(
          resourceId,
          projectId,
          fileType,
          importResult.originalName,
          contentText,
          null,
          importResult.internalPath,
          importResult.mimeType,
          importResult.size,
          importResult.hash,
          thumbnailData,
          importResult.originalName,
          null,
          now,
          now
        );

        const resource = queries.getResourceById.get(resourceId);

        // Broadcast so Home and other windows update immediately
        windowManager.broadcast('resource:created', resource);

        if (indexerDeps && resource && resourceIndexer.shouldIndex(resource)) {
          resourceIndexer.scheduleIndexing(resourceId, indexerDeps);
        }

        results.push({ success: true, data: resource });
      } catch (error) {
        errors.push({ filePath, error: error.message });
      }
    }

    return {
      success: errors.length === 0,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

  /**
   * Get full path for a resource (to open in native app)
   */
  ipcMain.handle('resource:getFilePath', (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      // Prefer internal_path, fallback to legacy file_path
      if (resource.internal_path) {
        const fullPath = fileStorage.getFullPath(resource.internal_path);
        if (fileStorage.fileExists(resource.internal_path)) {
          return { success: true, data: fullPath };
        }
        return { success: false, error: 'Internal file not found' };
      }

      // Legacy: use file_path
      if (resource.file_path && fs.existsSync(resource.file_path)) {
        return { success: true, data: resource.file_path };
      }

      return { success: false, error: 'File not found' };
    } catch (error) {
      console.error('[Resource] Error getting file path:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Read file content as Base64 data URL
   */
  ipcMain.handle('resource:readFile', (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      // Prefer internal_path
      if (resource.internal_path) {
        const dataUrl = fileStorage.readFileAsDataUrl(resource.internal_path);
        if (dataUrl) {
          return { success: true, data: dataUrl };
        }
        return { success: false, error: 'Internal file not found' };
      }

      // Legacy: read from file_path
      if (resource.file_path && fs.existsSync(resource.file_path)) {
        const buffer = fs.readFileSync(resource.file_path);
        const ext = path.extname(resource.file_path).toLowerCase();
        const mimeType = fileStorage.getMimeType(ext);
        const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
        return { success: true, data: dataUrl };
      }

      return { success: false, error: 'File not found' };
    } catch (error) {
      console.error('[Resource] Error reading file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Read document content as base64 for renderer-side parsing (DOCX, XLSX, CSV)
   */
  ipcMain.handle('resource:readDocumentContent', (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      if (!resource.internal_path) {
        return { success: false, error: 'No internal file path' };
      }

      const fullPath = fileStorage.getFullPath(resource.internal_path);
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: 'File not found on disk' };
      }

      const buffer = fs.readFileSync(fullPath);
      const base64 = buffer.toString('base64');

      return {
        success: true,
        data: base64,
        mimeType: resource.file_mime_type,
        filename: resource.original_filename || resource.title,
      };
    } catch (error) {
      console.error('[Resource] Error reading document content:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Export resource to user-selected location
   */
  ipcMain.handle('resource:export', async (event, { resourceId, destinationPath }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      // Determine source path
      let sourcePath = null;
      if (resource.internal_path) {
        sourcePath = fileStorage.getFullPath(resource.internal_path);
      } else if (resource.file_path) {
        sourcePath = resource.file_path;
      }

      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { success: false, error: 'Source file not found' };
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy file
      fs.copyFileSync(sourcePath, destinationPath);

      console.log(`[Resource] Exported: ${resource.title} -> ${destinationPath}`);

      return { success: true, data: destinationPath };
    } catch (error) {
      console.error('[Resource] Error exporting file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete resource and its internal file
   */
  ipcMain.handle('resource:delete', (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      // Delete internal file if exists
      if (resource.internal_path) {
        fileStorage.deleteFile(resource.internal_path);
      }

      // Delete from database
      queries.deleteResource.run(resourceId);

      // Broadcast so Home and other windows update immediately
      windowManager.broadcast('resource:deleted', { id: resourceId });

      console.log(`[Resource] Deleted: ${resource.title}`);

      return { success: true };
    } catch (error) {
      console.error('[Resource] Error deleting resource:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Regenerate thumbnail for a resource
   */
  ipcMain.handle('resource:regenerateThumbnail', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      if (!resource.internal_path) {
        return { success: false, error: 'Resource has no internal file' };
      }

      const fullPath = fileStorage.getFullPath(resource.internal_path);
      const thumbnailData = await thumbnail.generateThumbnail(
        fullPath,
        resource.type,
        resource.file_mime_type
      );

      if (thumbnailData) {
        queries.updateResourceThumbnail.run(thumbnailData, Date.now(), resourceId);
        return { success: true, data: thumbnailData };
      }

      return { success: false, error: 'Failed to generate thumbnail' };
    } catch (error) {
      console.error('[Resource] Error regenerating thumbnail:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Set thumbnail from renderer (e.g. PDF first page rendered with pdf.js)
   */
  ipcMain.handle('resource:setThumbnail', async (event, resourceId, thumbnailDataUrl) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!resourceId || typeof thumbnailDataUrl !== 'string') {
      return { success: false, error: 'Invalid parameters' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      queries.updateResourceThumbnail.run(thumbnailDataUrl, Date.now(), resourceId);
      windowManager.broadcast('resource:updated', {
        id: resourceId,
        updates: { thumbnail_data: thumbnailDataUrl, updated_at: Date.now() },
      });
      return { success: true };
    } catch (error) {
      console.error('[Resource] Error setting thumbnail:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
