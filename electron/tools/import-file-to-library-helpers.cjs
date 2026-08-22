/**
 * Helpers for importFileToLibrary (cognitive-complexity extraction).
 * Behavior must stay identical to the pre-refactor inline logic.
 */

/**
 * @param {string|undefined} filename
 * @param {string|undefined} mimeType
 * @param {{ extname: (p: string) => string }} pathMod
 * @returns {string}
 */
function resolveImportExtension(filename, mimeType, pathMod) {
  if (filename) return pathMod.extname(filename).toLowerCase();
  if (mimeType?.includes('pdf')) return '.pdf';
  if (mimeType?.includes('docx') || mimeType?.includes('wordprocessingml')) return '.docx';
  return '.txt';
}

/**
 * @param {string} ext
 * @param {string|undefined} mimeType
 * @returns {'pdf'|'document'|'note'}
 */
function resolveImportEffectiveType(ext, mimeType) {
  if (ext === '.pdf' || mimeType?.includes('pdf')) return 'pdf';
  if (
    ext === '.docx'
    || ext === '.doc'
    || mimeType?.includes('wordprocessingml')
    || mimeType?.includes('msword')
  ) {
    return 'document';
  }
  return 'note';
}

/**
 * @param {{ writeFileSync: Function }} fsMod
 * @param {string} tempPath
 * @param {string|undefined} content
 * @param {string|undefined} contentBase64
 */
function writeImportTempFile(fsMod, tempPath, content, contentBase64) {
  if (contentBase64) {
    fsMod.writeFileSync(tempPath, Buffer.from(contentBase64, 'base64'));
  } else {
    fsMod.writeFileSync(tempPath, content || '', 'utf8');
  }
}

/**
 * @param {object} params
 * @param {{ extractTextFromPDF: Function, extractDocxText: Function, extractDocumentText: Function }} params.documentExtractor
 * @param {string} params.fullPath
 * @param {'pdf'|'document'|'note'} params.effectiveType
 * @param {string} params.ext
 * @param {string|null|undefined} params.importMimeType
 * @param {string|undefined} params.content
 * @param {string|undefined} params.contentBase64
 * @returns {Promise<string|null>}
 */
async function extractImportedContentText({
  documentExtractor,
  fullPath,
  effectiveType,
  ext,
  importMimeType,
  content,
  contentBase64,
}) {
  let contentText = (!contentBase64 ? content : null) || null;
  try {
    if (effectiveType === 'pdf') {
      contentText = await documentExtractor.extractTextFromPDF(fullPath, 50000);
    } else if (effectiveType === 'document' && (ext === '.docx' || ext === '.doc')) {
      contentText = await documentExtractor.extractDocxText(fullPath, 50000);
    } else if (effectiveType === 'note') {
      contentText = await documentExtractor.extractDocumentText(fullPath, importMimeType);
    }
  } catch {
    /* keep original text content */
  }
  return contentText;
}

/**
 * @param {object} args
 * @param {string|undefined} args.title
 * @param {string|undefined} args.content
 * @param {string|undefined} args.content_base64
 * @returns {{ success: false, error: string }|null}
 */
function validateImportFileArgs({ title, content, content_base64 }) {
  if (!title || !title.trim()) {
    return { success: false, error: 'title is required' };
  }
  if (!content && !content_base64) {
    return { success: false, error: 'content or content_base64 is required' };
  }
  return null;
}

/**
 * @param {object} queries
 * @param {object} opts
 */
function createImportedResourceRecord(queries, {
  resourceId,
  projectId,
  effectiveType,
  title,
  contentText,
  importResult,
  mimeType,
  filename,
  now,
}) {
  queries.createResourceWithFile.run(
    resourceId,
    projectId,
    effectiveType,
    title.trim(),
    contentText,
    null,
    importResult.internalPath,
    importResult.mimeType || mimeType || null,
    importResult.size,
    importResult.hash,
    null,
    filename || importResult.originalName || null,
    null,
    now,
    now,
  );
}

/**
 * @param {object} queries
 * @param {string|undefined} folderId
 * @param {string} resourceId
 * @param {number} now
 */
function moveImportedResourceToFolder(queries, folderId, resourceId, now) {
  if (folderId && queries.moveResourceToFolder) {
    queries.moveResourceToFolder.run(folderId, now, resourceId);
  }
}

/**
 * @param {{ init: Function, shouldIndex: Function, scheduleSemanticReindex: Function }} scheduler
 * @param {object} database
 * @param {object|null|undefined} resource
 * @param {string} resourceId
 */
function scheduleImportedResourceIndex(scheduler, database, resource, resourceId) {
  scheduler.init(database);
  if (resource && scheduler.shouldIndex(resource)) {
    scheduler.scheduleSemanticReindex(resourceId);
  }
}

/**
 * @param {{ unlinkSync: Function }} fsMod
 * @param {string} tempPath
 */
function unlinkImportTempFile(fsMod, tempPath) {
  try {
    fsMod.unlinkSync(tempPath);
  } catch {
    /* ignore */
  }
}

module.exports = {
  resolveImportExtension,
  resolveImportEffectiveType,
  writeImportTempFile,
  extractImportedContentText,
  validateImportFileArgs,
  createImportedResourceRecord,
  moveImportedResourceToFolder,
  scheduleImportedResourceIndex,
  unlinkImportTempFile,
};
