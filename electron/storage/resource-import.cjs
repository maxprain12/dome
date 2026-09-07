/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vaultStore = require('./vault-store.cjs');
const { ensureFolderChainOnDisk } = require('./vault-sync.cjs');
const NOTE_IMPORT_EXTS = new Set(['.md', '.markdown', '.txt']);
const NOTE_IMPORT_MAX_BYTES = 1024 * 1024;

/** The only library importer. All entry points supply the same resource model. */
function createResourceImporter(deps) {
  const {
    database,
    fileStorage = require('./file-storage.cjs'),
    thumbnail = require('../documents/thumbnail.cjs'),
    documentExtractor = require('../documents/document-extractor.cjs'),
    windowManager = { broadcast() {} },
    semanticIndexScheduler = require('./semantic-index-scheduler.cjs'),
    autoMetadata = require('../ai/auto-metadata.cjs'),
    extractInWorker = require('../workers/document-extract-service.cjs').extractInWorker,
  } = deps;
  semanticIndexScheduler.init(database);
  const generateId = () => crypto.randomUUID();
  async function extractDocumentTextOffMain(fullPath, mimeType) {
    try { return await extractInWorker('documentText', fullPath, undefined, mimeType); }
    catch { return documentExtractor.extractDocumentText(fullPath, mimeType); }
  }
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
      null, // vault_path: created below
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

  /** Validate that file, project and (optional) folder are usable. Returns an error result or null. */
  function validateImportInputs(filePath, projectId, folderId) {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    const queries = database.getQueries();
    const project = queries.getProjectById.get(projectId);
    if (!project) return { success: false, error: 'Project not found' };
    if (folderId) {
      const folder = queries.getResourceById.get(folderId);
      if (!folder || folder.type !== 'folder' || folder.project_id !== projectId) {
        return { success: false, error: 'Invalid destination folder' };
      }
    }
    return null;
  }

  /** Parse notebook / url initial content from the source file. */
  function parseInitialContent(filePath, effectiveType) {
    if (effectiveType === 'notebook') {
      const notebook = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!notebook || !Array.isArray(notebook.cells)) {
        return { content: null, error: 'Invalid notebook file' };
      }
      return { content: JSON.stringify(notebook), error: null };
    }
    if (effectiveType === 'url') {
      const content = vaultStore.parseUrlFile(fs.readFileSync(filePath, 'utf8'));
      if (!content) return { content: null, error: 'Invalid URL file' };
      return { content, error: null };
    }
    return { content: null, error: null };
  }

  /** Run thumbnail + metadata + text extraction for an imported file. */
  async function enrichImportedResource({ fullPath, effectiveType, mimeType, originalName, initialContent }) {
    const thumbnailData = await thumbnail.generateThumbnail(fullPath, effectiveType, mimeType)
      .catch((error) => {
        console.warn('[Resource] Thumbnail generation failed:', error.message);
        return null;
      });

    let metadata = null;
    if (effectiveType === 'video') {
      try {
        metadata = await thumbnail.extractVideoMetadata(fullPath);
      } catch (metadataError) {
        console.warn('[Resource] Video metadata extraction failed:', metadataError.message);
      }
    }

    let contentText = initialContent;
    if (effectiveType === 'document' || effectiveType === 'excel' || effectiveType === 'ppt') {
      try {
        contentText = await extractDocumentTextOffMain(fullPath, mimeType);
      } catch (extractError) {
        console.warn('[Resource] Text extraction failed, continuing without content:', extractError.message);
      }
    }

    // Extract text from PDFs on import (so resource_get has content without on-demand extraction)
    const isPdf = effectiveType === 'pdf' || (mimeType || '').includes('pdf') || (originalName || '').toLowerCase().endsWith('.pdf');
    if (isPdf && !contentText) {
      try {
        contentText = await documentExtractor.extractTextFromPDF(fullPath, 50000);
      } catch (extractError) {
        console.warn('[Resource] PDF text extraction failed:', extractError.message);
      }
    }

    return { thumbnailData, metadata, contentText };
  }

  /**
   * Vault-native single-file import shared by `resource:import` and
   * `resource:importMultiple` (the import buttons). Markdown/plain text
   * becomes a note; everything else is referenced in the project vault.
   */
  async function importFileAsResource(filePath, { projectId = 'default', type, title, folderId = null }) {
    const validationError = validateImportInputs(filePath, projectId, folderId);
    if (validationError) return validationError;

    ensureFolderChainOnDisk(folderId, { database, fileStorage });
    const ext = path.extname(filePath).toLowerCase();
    if (NOTE_IMPORT_EXTS.has(ext) && fs.statSync(filePath).size <= NOTE_IMPORT_MAX_BYTES) {
      const resource = importTextFileAsNote(filePath, { projectId, title, folderId });
      return { success: true, data: resource, thumbnailDataUrl: null };
    }
    const effectiveType = fileStorage.classifyFileType(ext, type);
    const { content: initialContent, error: parseError } = parseInitialContent(filePath, effectiveType);
    if (parseError) return { success: false, error: parseError };
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

    try {
      queries.createResourceWithFile.run(
        resourceId, projectId, effectiveType, resourceTitle, initialContent,
        importResult.vaultPath, importResult.mimeType, importResult.size,
        importResult.contentHash, null, originalName, null, now, now,
        folderId, importResult.contentHash,
      );
    } catch (error) {
      vaultStore.markSelfWrite(importResult.absPath, null);
      fs.unlinkSync(importResult.absPath);
      throw error;
    }

    const { thumbnailData, metadata, contentText } = await enrichImportedResource({
      fullPath: importResult.absPath,
      effectiveType,
      mimeType: importResult.mimeType,
      originalName,
      initialContent,
    });

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


  async function importContent({ title, content, content_base64, mime_type, filename, type, project_id, folder_id }) {
    if (typeof title !== 'string' || !title.trim()) return { success: false, error: 'title is required' };
    if (typeof content !== 'string' && typeof content_base64 !== 'string') {
      return { success: false, error: 'content or content_base64 is required' };
    }
    const extensions = {
      'application/pdf': '.pdf', 'text/plain': '.txt', 'text/markdown': '.md',
      'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
      'audio/mpeg': '.mp3', 'video/mp4': '.mp4', 'text/csv': '.csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    };
    const extension = extensions[mime_type] || (type === 'note' ? '.md' : typeof content_base64 === 'string' ? '.bin' : '.txt');
    const name = filename
      ? (path.extname(filename) ? filename : `${filename}${extension}`)
      : `${title}${extension}`;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dome-import-'));
    try {
      const tempPath = path.join(tempDir, vaultStore.sanitizeFilename(name));
      fs.writeFileSync(tempPath, typeof content_base64 === 'string' ? Buffer.from(content_base64, 'base64') : content);
      const result = await importFileAsResource(tempPath, {
        projectId: project_id || 'default', folderId: folder_id || null, title: title.trim(), type,
      });
      return result.success ? { success: true, resource: result.data } : result;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  return { importFile: importFileAsResource, importContent };
}
module.exports = { createResourceImporter };
