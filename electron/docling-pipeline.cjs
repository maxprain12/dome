/* eslint-disable no-console */
/**
 * Docling conversion pipeline — shared logic for converting a resource via dome-provider.
 * Used by docling IPC handler and resource-indexer for automatic PDF → markdown when provider=dome.
 */

const fs = require('fs');
const crypto = require('crypto');
const doclingClient = require('./docling-client.cjs');

const SUPPORTED_TYPES = ['pdf', 'document', 'ppt', 'excel'];

/**
 * Convert resource via Docling and update DB with markdown + images.
 * Does NOT trigger PageIndex — caller should do that after.
 *
 * @param {string} resourceId
 * @param {{ database, fileStorage, windowManager }} deps
 * @param {{ onProgress?: (status, progress) => void }} options
 * @returns {Promise<{ success: true; markdown: string; imageCount: number } | { success: false; error: string; code?: string }>}
 */
async function convertAndUpdateResource(resourceId, deps, { onProgress } = {}) {
  const { database, fileStorage, windowManager } = deps || {};
  if (!database || !fileStorage) {
    return { success: false, error: 'Missing database or fileStorage' };
  }

  const queries = database.getQueries();
  const resource = queries.getResourceById?.get(resourceId);
  if (!resource) {
    return { success: false, error: 'Resource not found' };
  }
  if (!SUPPORTED_TYPES.includes(resource.type)) {
    return { success: false, error: `Docling not supported for type: ${resource.type}` };
  }

  const fullPath = resource.internal_path ? fileStorage.getFullPath(resource.internal_path) : null;
  if (!fullPath || !fs.existsSync(fullPath)) {
    return { success: false, error: 'Resource file not found on disk' };
  }

  const filename = resource.original_filename || `${resource.title || resourceId}.pdf`;

  let result;
  try {
    const fileBuffer = fs.readFileSync(fullPath);
    // onProgress is forwarded to the client so it can emit during the polling loop
    result = await doclingClient.convertDocument(fileBuffer, filename, database, { onProgress });
  } catch (err) {
    console.error('[Docling Pipeline] Conversion failed:', err.message);
    return { success: false, error: err.message, code: err.code };
  }

  if (result.status === 'failure') {
    return { success: false, error: result.error || 'Docling conversion failed' };
  }

  onProgress?.('storing_images', 50);

  try {
    queries.deleteResourceImages.run(resourceId);
  } catch {
    // Non-fatal
  }

  const storedImages = [];
  for (const img of result.images || []) {
    try {
      const ext = img.mimeType === 'image/jpeg' ? '.jpg' : '.png';
      const imgFilename = `docling-${resourceId}-${img.index}${ext}`;
      const imgBuffer = Buffer.from(img.base64Data, 'base64');
      const stored = await fileStorage.importFromBuffer(imgBuffer, imgFilename, 'image');
      const imgId = crypto.randomUUID();
      queries.insertResourceImage.run(
        imgId,
        resourceId,
        stored.internalPath,
        img.mimeType,
        img.index,
        img.pageNo ?? null,
        img.caption ?? null,
        Date.now(),
      );
      storedImages.push({ id: imgId, index: img.index, pageNo: img.pageNo });
    } catch (imgErr) {
      console.warn(`[Docling Pipeline] Failed to store image ${img.index}:`, imgErr.message);
    }
  }

  onProgress?.('updating_resource', 65);

  const existingMeta = (() => {
    try { return JSON.parse(resource.metadata || '{}'); } catch { return {}; }
  })();
  const updatedMeta = JSON.stringify({
    ...existingMeta,
    docling: {
      converted_at: Date.now(),
      image_count: storedImages.length,
      processing_time_ms: result.processingTimeMs,
    },
  });

  queries.updateResource.run(resource.title, result.markdown, updatedMeta, Date.now(), resourceId);

  return {
    success: true,
    markdown: result.markdown,
    imageCount: storedImages.length,
  };
}

/**
 * Check if Docling conversion should run for this PDF before indexing.
 * True when: provider=dome, session connected, resource is PDF.
 * Siempre ejecutamos Docling cuando el provider es Dome (IA avanzada: extracción de
 * imágenes + markdown completo para PageIndex), incluso si ya hay contenido previo.
 */
async function shouldRunDoclingForPdf(resource, database) {
  if (!resource || resource.type !== 'pdf') return false;
  const queries = database?.getQueries?.();
  if (!queries) return false;
  const provider = (queries.getSetting.get('ai_provider')?.value || 'openai').toLowerCase();
  if (provider !== 'dome') return false;
  const domeOauth = require('./dome-oauth.cjs');
  const session = await domeOauth.getOrRefreshSession(database);
  return !!(session?.connected && session?.accessToken);
}

module.exports = {
  convertAndUpdateResource,
  shouldRunDoclingForPdf,
};
