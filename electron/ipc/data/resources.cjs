/* eslint-disable no-console */
const crypto = require('crypto');
const semanticIndexScheduler = require('../../storage/semantic-index-scheduler.cjs');
const autoMetadata = require('../../ai/auto-metadata.cjs');
const vaultStore = require('../../storage/vault-store.cjs');
const { ensureFolderChainOnDisk } = require('../../storage/vault-sync.cjs');

/**
 * Generate a unique ID for resources
 */
function generateId() {
  return crypto.randomUUID();
}

const { extractInWorker } = require('../../workers/document-extract-service.cjs');

async function extractDocumentTextOffMain(fullPath, mimeType, documentExtractor) {
  try {
    return await extractInWorker('documentText', fullPath, undefined, mimeType);
  } catch (err) {
    console.warn('[Resources] document extract worker fallback:', err?.message || err);
    return documentExtractor.extractDocumentText(fullPath, mimeType);
  }
}

// Text files that import as editable vault notes (same pipeline as creating a
// document in the vault) instead of opaque 'document' files no viewer can open.
const NOTE_IMPORT_EXTS = new Set(['.md', '.markdown', '.txt']);
// Above this size the file goes through the regular vault file import — the
// note editor is not meant for multi-megabyte documents.
const NOTE_IMPORT_MAX_BYTES = 1024 * 1024;

function register({ ipcMain, fs, path, windowManager, database, fileStorage, thumbnail, documentExtractor, documentGenerator, docxConverter, initModule, ollamaService, sanitizePath }) {
  semanticIndexScheduler.init(database);

  /**
   * Import a markdown / plain-text file as a vault NOTE: content into the DB
   * `content` column (markdown) + `.md` mirror via writeNoteMarkdown — exactly
   * what `db:resources:create` does for documents created inside the vault.
   */
  function importTextFileAsNote(filePath, { projectId, title, folderId }) {
    const queries = database.getQueries();
    const raw = fs.readFileSync(filePath, 'utf8');
    const markdown = vaultStore.stripFrontmatter(raw);

    const originalName = path.basename(filePath);
    const resourceTitle =
      (title && String(title).trim()) ||
      originalName.replace(/\.[^.]+$/, '').trim() ||
      'Untitled';

    const resourceId = generateId();
    const now = Date.now();
    queries.createResource.run(
      resourceId,
      projectId,
      'note',
      resourceTitle,
      markdown,
      null, // file_path
      folderId,
      null, // metadata
      now,
      now
    );
    const mirror = vaultStore.writeNoteMarkdown({ id: resourceId, markdown }, { database, fileStorage });
    if (!mirror.success) {
      queries.deleteResource.run(resourceId);
      throw new Error(mirror.error);
    }

    const resource = queries.getResourceById.get(resourceId);
    windowManager.broadcast('resource:created', resource);
    if (semanticIndexScheduler.shouldIndex(resource)) {
      semanticIndexScheduler.scheduleSemanticReindex(resourceId);
    }
    autoMetadata.scheduleCloudAutoMetadata(resourceId, { database, fileStorage, windowManager });
    return resource;
  }

  /**
   * Vault-native single-file import shared by `resource:import` and
   * `resource:importMultiple` (the import buttons). Markdown/plain text
   * becomes a note; everything else is referenced in the project vault.
   */
  async function importFileAsResource(filePath, { projectId, type, title, folderId = null }) {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    ensureFolderChainOnDisk(folderId, { database, fileStorage });
    const ext = path.extname(filePath).toLowerCase();
    if (NOTE_IMPORT_EXTS.has(ext) && fs.statSync(filePath).size <= NOTE_IMPORT_MAX_BYTES) {
      const resource = importTextFileAsNote(filePath, { projectId, title, folderId });
      return { success: true, data: resource, thumbnailDataUrl: null };
    }
    const effectiveType = fileStorage.classifyFileType(ext, type);
    const queries = database.getQueries();
    const resourceId = generateId();
    const originalName = path.basename(filePath);

    // Import the file INTO the project's vault (referenced in place — no
    // content-addressed copy). Vault duplicates are allowed.
    const importResult = vaultStore.importFileToVault(
      filePath,
      { id: resourceId, type: effectiveType, project_id: projectId, folder_id: folderId, title: title || originalName, original_filename: originalName },
      { database, fileStorage },
    );

    // Register the file before asynchronous enrichment so the watcher cannot
    // import it again while extraction is in progress.
    const now = Date.now();
    const resourceTitle = title || originalName || 'Untitled';

    queries.createResourceWithFile.run(
      resourceId,
      projectId,
      effectiveType,
      resourceTitle,
      null, // populated by extraction below
      null, // file_path (legacy, not used)
      null, // internal_path (legacy — vault-native uses vault_path)
      importResult.mimeType,
      importResult.size,
      importResult.contentHash,
      null, // populated by thumbnail generation below
      originalName,
      null, // populated by metadata extraction below
      now,
      now
    );
    database.getDB().prepare('UPDATE resources SET vault_path = ?, content_hash = ? WHERE id = ?')
      .run(importResult.vaultPath, importResult.contentHash, resourceId);

    if (folderId) queries.moveResourceToFolder.run(folderId, now, resourceId);

    // Generate thumbnail for supported types
    const fullPath = importResult.absPath;
    const thumbnailData = await thumbnail.generateThumbnail(
      fullPath,
      effectiveType,
      importResult.mimeType
    ).catch((error) => {
      console.warn('[Resource] Thumbnail generation failed:', error.message);
      return null;
    });

    // Extract video metadata if applicable
    let metadata = null;
    if (effectiveType === 'video') {
      try {
        metadata = await thumbnail.extractVideoMetadata(fullPath);
      } catch (metadataError) {
        console.warn('[Resource] Video metadata extraction failed:', metadataError.message);
      }
    }

    // Extract text content for document/excel/ppt types (for card preview and AI tools)
    let contentText = null;
    if (effectiveType === 'document' || effectiveType === 'excel' || effectiveType === 'ppt') {
      try {
        contentText = await extractDocumentTextOffMain(fullPath, importResult.mimeType, documentExtractor);
      } catch (extractError) {
        console.warn('[Resource] Text extraction failed, continuing without content:', extractError.message);
      }
    }
    // Extract text from PDFs on import (so resource_get has content without on-demand extraction)
    const isPdf = effectiveType === 'pdf' || (importResult.mimeType || '').includes('pdf') || (originalName || '').toLowerCase().endsWith('.pdf');
    if (isPdf && !contentText) {
      try {
        contentText = await documentExtractor.extractTextFromPDF(fullPath, 50000);
      } catch (extractError) {
        console.warn('[Resource] PDF text extraction failed:', extractError.message);
      }
    }

    queries.updateResource.run(resourceTitle, contentText, metadata ? JSON.stringify(metadata) : null, now, resourceId);
    queries.updateResourceThumbnail.run(thumbnailData, now, resourceId);

    // Get the created resource
    const resource = queries.getResourceById.get(resourceId);

    // Broadcast so Home and other windows update immediately
    windowManager.broadcast('resource:created', resource);

    if (semanticIndexScheduler.shouldIndex(resource)) {
      semanticIndexScheduler.scheduleSemanticReindex(resourceId);
    }

    autoMetadata.scheduleCloudAutoMetadata(resourceId, { database, fileStorage, windowManager });

    return {
      success: true,
      data: resource,
      thumbnailDataUrl: thumbnailData,
    };
  }

  /**
   * Import a file: reference it in the project vault and create the resource
   */
  ipcMain.handle('resource:import', async (event, { filePath, projectId, type, title }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      return await importFileAsResource(filePath, { projectId, type, title });
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

      // Resolve via the vault (vault_path) with legacy internal_path/file_path fallback.
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
      let fullPath;

      if (resourcePath) {
        fullPath = vaultStore.writeResourceFile(resource, buffer, { database, fileStorage });
      } else {
        const safeTitle = (resource.title || 'document').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
        const importResult = await fileStorage.importFromBuffer(buffer, `${safeTitle}.docx`, 'document');
        fullPath = fileStorage.getFullPath(importResult.internalPath);

        queries.updateResourceFile.run(
          importResult.internalPath,
          importResult.mimeType,
          importResult.size,
          importResult.hash,
          resource.thumbnail_data,
          importResult.originalName,
          now,
          resourceId
        );
      }

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
  ipcMain.handle('resource:importFromContent', async (event, {
    title,
    content,
    content_base64,
    mime_type,
    filename,
    type,
    project_id,
    folder_id,
  }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const os = require('os');

    let tempDir = null;
    try {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return { success: false, error: 'title is required' };
      }
      if (!content && !content_base64) {
        return { success: false, error: 'content or content_base64 is required' };
      }

      // Determine extension from filename or mime_type
      const ext = filename
        ? path.extname(filename).toLowerCase()
        : mime_type?.includes('pdf') ? '.pdf'
        : mime_type?.includes('docx') || mime_type?.includes('wordprocessingml') ? '.docx'
        : mime_type?.includes('plain') ? '.txt'
        : mime_type?.includes('markdown') ? '.md'
        : '.txt';

      // Write content to a temp file
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-import-'));
      const tempPath = path.join(tempDir, vaultStore.sanitizeFilename(filename || `${title}${ext}`));

      if (content_base64) {
        const buf = Buffer.from(content_base64, 'base64');
        fs.writeFileSync(tempPath, buf);
      } else {
        fs.writeFileSync(tempPath, content || '', 'utf8');
      }

      const result = await importFileAsResource(tempPath, {
        projectId: project_id || 'default',
        folderId: folder_id || null,
        title: title.trim(),
        type,
      });
      if (!result.success) return result;
      return { success: true, resource: result.data };
    } catch (error) {
      console.error('[Resource] importFromContent error:', error);
      return { success: false, error: error.message };
    } finally {
      if (tempDir) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore cleanup errors */ }
      }
    }
  });
}

module.exports = { register };
