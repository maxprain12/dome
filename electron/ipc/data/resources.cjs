/* eslint-disable no-console */
const semanticIndexScheduler = require('../../storage/semantic-index-scheduler.cjs');
const autoMetadata = require('../../ai/auto-metadata.cjs');
const vaultStore = require('../../storage/vault-store.cjs');

const { extractInWorker } = require('../../workers/document-extract-service.cjs');

async function extractDocumentTextOffMain(fullPath, mimeType, documentExtractor) {
  try {
    return await extractInWorker('documentText', fullPath, undefined, mimeType);
  } catch (err) {
    console.warn('[Resources] document extract worker fallback:', err?.message || err);
    return documentExtractor.extractDocumentText(fullPath, mimeType);
  }
}

function register({ ipcMain, fs, path, windowManager, database, fileStorage, thumbnail, documentExtractor, documentGenerator, docxConverter, initModule, ollamaService, sanitizePath }) {
  semanticIndexScheduler.init(database);

  const importer = require('../../storage/resource-import.cjs').createResourceImporter({
    database, fileStorage, thumbnail, documentExtractor, windowManager,
    semanticIndexScheduler, autoMetadata, extractInWorker,
  });
  const importFileAsResource = importer.importFile;

  /**
   * Import a file: reference it in the project vault and create the resource
   */
  ipcMain.handle('resource:import', async (event, { filePath, projectId, type, title, folderId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      return await importFileAsResource(filePath, { projectId, type, title, folderId });
    } catch (error) {
      console.error('[Resource] Error importing file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Schedule indexing for a resource (called when workspace opens for URL articles
   * with scraped_content - embeddings generated later like note-type resources)
   */
  ipcMain.handle('resource:scheduleIndex', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!resourceId || typeof resourceId !== 'string') {
        return { success: false, error: 'resourceId required' };
      }

      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      if (semanticIndexScheduler.shouldIndex(resource)) {
        semanticIndexScheduler.scheduleSemanticReindex(resourceId);
      }

      return { success: true };
    } catch (error) {
      console.error('[Resource] Error scheduling index:', error);
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

    // Same vault-native pipeline as `resource:import` (markdown/plain text →
    // editable note; other files referenced in the project vault). The legacy
    // internal-storage copy left imports invisible to the vault (issue: "md
    // imports corrupt documents").
    for (const filePath of filePaths) {
      try {
        const result = await importFileAsResource(filePath, { projectId, type });
        if (result.success) {
          results.push({ success: true, data: result.data });
        } else {
          errors.push({ filePath, error: result.error, duplicate: result.duplicate });
        }
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

      // Resolve the canonical file in the project vault.
      const fullPath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
      if (fullPath && fs.existsSync(fullPath)) {
        return { success: true, data: fullPath };
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
  /**
   * Read raw file bytes for renderer-side Blob URLs (avoids file:// loads from http/app origins).
   */
  ipcMain.handle('resource:readFileBuffer', (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      let mimeType = resource.file_mime_type && String(resource.file_mime_type).trim()
        ? String(resource.file_mime_type).trim()
        : null;

      const fullPath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
      if (!fullPath || !fs.existsSync(fullPath)) {
        return { success: false, error: 'File not found' };
      }
      const buffer = fs.readFileSync(fullPath);
      if (!mimeType) {
        const ext = path.extname(fullPath || resource.original_filename || resource.title || '').toLowerCase();
        mimeType = fileStorage.getMimeType(ext);
      }

      return {
        success: true,
        data: buffer,
        mimeType: mimeType || 'application/octet-stream',
      };
    } catch (error) {
      console.error('[Resource] Error reading file buffer:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('resource:readFile', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      const isPptx =
        resource.type === 'ppt' ||
        (resource.file_mime_type || '').includes('presentationml') ||
        (resource.original_filename || resource.title || '').toLowerCase().endsWith('.pptx');

      // Resolve via the vault (vault_path) with legacy fallback.
      const fullPath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
      if (fullPath && fs.existsSync(fullPath)) {
        let buffer = fs.readFileSync(fullPath);
        if (isPptx) {
          try {
            const { normalizePptxBuffer } = require('../../documents/pptx-normalize.cjs');
            const normalized = await normalizePptxBuffer(buffer);
            if (!normalized.equals(buffer)) {
              fs.writeFileSync(fullPath, normalized);
            }
            buffer = normalized;
          } catch (normErr) {
            console.warn('[Resource] PPTX normalize failed (non-fatal):', normErr?.message);
          }
        }
        const ext = path.extname(fullPath).toLowerCase();
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
   * Extract one image per slide from a PPTX resource (LibreOffice + pdf2image).
   */
  ipcMain.handle('resource:extractPptImages', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!documentGenerator) {
      return { success: false, error: 'Document generator not available' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      const fullPath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
      if (!fullPath) {
        return { success: false, error: 'No resource file path' };
      }
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: 'File not found on disk' };
      }

      const result = await documentGenerator.extractPptImages(fullPath);
      return result;
    } catch (error) {
      console.error('[Resource] Error extracting PPT images:', error);
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

      const fullPath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
      if (!fullPath) {
        return { success: false, error: 'No resource file path' };
      }
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
   * Write Excel content from base64 (for editor saves).
   * Overwrites the resource file and updates content for search.
   */
  ipcMain.handle('resource:writeExcelContent', async (event, { resourceId, data }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!resourceId || typeof data !== 'string') {
        return { success: false, error: 'resourceId and data (base64) required' };
      }

      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      const fullPath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
      if (!fullPath) {
        return { success: false, error: 'No resource file path' };
      }
      const buffer = Buffer.from(data, 'base64');
      vaultStore.writeResourceFile(resource, buffer, { database, fileStorage });

      let contentText = null;
      try {
        contentText = await extractDocumentTextOffMain(fullPath, resource.file_mime_type, documentExtractor);
      } catch (e) {
        console.warn('[Resource] Excel text extraction failed:', e?.message);
      }

      const now = Date.now();
      queries.updateResource.run(
        resource.title,
        contentText ?? resource.content,
        resource.metadata,
        now,
        resourceId
      );

      windowManager.broadcast('resource:updated', {
        id: resourceId,
        updates: { content: contentText ?? resource.content, updated_at: now },
      });

      return { success: true };
    } catch (error) {
      console.error('[Resource] Error writing Excel content:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Save DOCX from HTML (create or overwrite)
   * For document resources: converts HTML to DOCX, saves to file storage, updates content for search.
   */
  ipcMain.handle('resource:saveDocxFromHtml', async (event, { resourceId, html }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      if (!resourceId || typeof html !== 'string') {
        return { success: false, error: 'resourceId and html required' };
      }

      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      if (resource.type !== 'document') {
        return { success: false, error: 'Resource must be type document' };
      }

      const filename = (resource.original_filename || resource.title || 'document').toLowerCase();
      const mime = resource.file_mime_type || '';
      const resourcePath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
      const isDocx = resourcePath?.toLowerCase().endsWith('.docx') ||
        filename.endsWith('.docx') || filename.endsWith('.doc') ||
        mime.includes('wordprocessingml') || mime.includes('msword');

      if (!isDocx && resourcePath) {
        return { success: false, error: 'Resource is not a DOCX document' };
      }

      const buffer = await docxConverter.htmlToDocxBuffer(html);
      if (!buffer) {
        return { success: false, error: 'Failed to convert HTML to DOCX' };
      }

      const now = Date.now();
      const fullPath = vaultStore.writeResourceFile(resource, buffer, {
        database, fileStorage, filename: `${resource.title || 'document'}.docx`,
      });

      let contentText = null;
      try {
        contentText = await documentExtractor.extractDocxText(fullPath, 50000);
      } catch (e) {
        console.warn('[Resource] DOCX text extraction failed:', e?.message);
      }

      queries.updateResource.run(
        resource.title,
        contentText || resource.content || '',
        resource.metadata,
        now,
        resourceId
      );

      const updated = queries.getResourceById.get(resourceId);
      windowManager.broadcast('resource:updated', { id: resourceId, updates: updated });

      return { success: true, data: updated };
    } catch (error) {
      console.error('[Resource] Error saving DOCX:', error);
      return { success: false, error: error?.message || 'Failed to save DOCX' };
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

      const sourcePath = vaultStore.getResourceFilePath(resource, queries, fileStorage);

      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return { success: false, error: 'Source file not found' };
      }

      // Sanitize destination path to prevent path traversal
      if (!destinationPath || typeof destinationPath !== 'string') {
        return { success: false, error: 'destinationPath is required and must be a string' };
      }
      // allowExternal: export destination picked via the native save dialog (granted)
      const safeDest = sanitizePath(destinationPath, true);

      // Ensure destination directory exists
      const destDir = path.dirname(safeDest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy file
      fs.copyFileSync(sourcePath, safeDest);

      return { success: true, data: safeDest };
    } catch (error) {
      console.error('[Resource] Error exporting file:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Duplicate a resource (Finder-style). Folders duplicate recursively; the
   * on-disk vault mirror is copied along with the SQLite rows.
   */
  ipcMain.handle('resource:duplicate', (event, resourceId, options) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const { duplicateResourceTree } = require('../../storage/resource-duplicate.cjs');
      const suffix = typeof options?.suffix === 'string' && options.suffix.trim()
        ? options.suffix.trim().slice(0, 24)
        : 'copy';
      return duplicateResourceTree(resourceId, { database, fileStorage, windowManager }, { suffix });
    } catch (error) {
      console.error('[Resource] Error duplicating resource:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Open a project's vault root in the OS file manager (Finder/Explorer).
   */
  ipcMain.handle('vault:openRoot', async (event, projectId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const { shell } = require('electron');
      const queries = database.getQueries();
      const root = vaultStore.getProjectVaultRoot(projectId || 'default', queries, fileStorage);
      if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
      await shell.openPath(root);
      return { success: true, data: root };
    } catch (error) {
      console.error('[Resource] Error opening vault root:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete resource (cascading folder subtrees) and its files — unified
   * pipeline in electron/storage/resource-delete.cjs.
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

      const { deleteResourcesCascade } = require('../../storage/resource-delete.cjs');
      deleteResourcesCascade([resourceId], { database, fileStorage, windowManager });

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

      const fullPath = vaultStore.getResourceFilePath(resource, queries, fileStorage);
      if (!fullPath) {
        return { success: false, error: 'No resource file path' };
      }
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

  /**
   * Import file content directly (for AI agents using MCP servers).
   * Accepts either text content or base64-encoded binary content, writes to
   * a temporary file, then uses the same vault importer as the file picker.
   */
  ipcMain.handle('resource:importFromContent', async (event, args) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try { return await importer.importContent(args); }
    catch (error) { return { success: false, error: error.message }; }
  });

}

module.exports = { register };
