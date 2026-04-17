/* eslint-disable no-console */
/**
 * Docling IPC handlers.
 *
 * Orchestrates cloud document conversion via dome-provider → Docling Serve:
 *   1. Reads the resource file from local storage
 *   2. Uploads to dome-provider (which proxies to Docling Serve)
 *   3. Stores extracted images in dome-files/images/ and resource_images table
 *   4. Updates the resource content with the clean Docling markdown
 *   5. Triggers PageIndex re-indexing using the new markdown
 *
 * IPC channels:
 *   docling:convert-resource  — full conversion pipeline
 *   docling:get-resource-images — list stored images for a resource
 *   docling:get-image-data   — read a stored image as base64 data URI
 */

const fs = require('fs');
const doclingPipeline = require('../docling-pipeline.cjs');

function register({ ipcMain, windowManager, database, fileStorage }) {
  // ------------------------------------------------------------------
  // docling:convert-resource
  // Convert an already-imported resource via Docling cloud service
  // ------------------------------------------------------------------
  ipcMain.handle('docling:convert-resource', async (event, { resourceId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!resourceId) {
      return { success: false, error: 'resourceId is required' };
    }

    const onProgress = (status, progress) => {
      windowManager.broadcast('docling:progress', { resourceId, status, progress });
    };

    let pipelineResult;
    try {
      pipelineResult = await doclingPipeline.convertAndUpdateResource(
        resourceId,
        { database, fileStorage, windowManager },
        { onProgress },
      );
    } catch (error) {
      console.error('[Docling IPC] convert-resource error:', error.message);
      windowManager.broadcast('docling:progress', {
        resourceId,
        status: 'error',
        progress: 0,
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    if (!pipelineResult.success) {
      windowManager.broadcast('docling:progress', {
        resourceId,
        status: 'error',
        progress: 0,
        error: pipelineResult.error,
        code: pipelineResult.code,
      });
      return { success: false, error: pipelineResult.error, code: pipelineResult.code };
    }

    windowManager.broadcast('docling:progress', { resourceId, status: 'indexing', progress: 75 });

    let nodeCount = 0;
    try {
      const pageIndexRuntime = require('../pageindex-python.cjs');
      const indexResult = await pageIndexRuntime.indexResource(resourceId, {
        database,
        windowManager,
        fileStorage,
      });
      nodeCount = Number(indexResult?.node_count || 0);
    } catch (indexErr) {
      console.warn('[Docling IPC] PageIndex failed after conversion:', indexErr.message);
    }

    windowManager.broadcast('docling:progress', { resourceId, status: 'done', progress: 100 });

    return {
      success: true,
      resourceId,
      markdownLength: pipelineResult.markdown.length,
      imageCount: pipelineResult.imageCount,
      nodeCount,
    };
  });

  // ------------------------------------------------------------------
  // docling:get-resource-images
  // Return all stored images for a resource
  // ------------------------------------------------------------------
  ipcMain.handle('docling:get-resource-images', (event, { resourceId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!resourceId) {
      return { success: false, error: 'resourceId is required' };
    }
    try {
      const queries = database.getQueries();
      const images = queries.getResourceImages.all(resourceId);
      return { success: true, images };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ------------------------------------------------------------------
  // docling:get-image-data
  // Read a stored image file and return it as a base64 data URI
  // ------------------------------------------------------------------
  ipcMain.handle('docling:get-image-data', (event, { imageId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!imageId) {
      return { success: false, error: 'imageId is required' };
    }
    try {
      const queries = database.getQueries();
      const img = queries.getResourceImageById.get(imageId);
      if (!img) {
        return { success: false, error: 'Image not found' };
      }
      const imgPath = fileStorage.getFullPath(img.internal_path);
      if (!fs.existsSync(imgPath)) {
        return { success: false, error: 'Image file not found on disk' };
      }
      const buffer = fs.readFileSync(imgPath);
      return {
        success: true,
        data: `data:${img.file_mime_type};base64,${buffer.toString('base64')}`,
        mimeType: img.file_mime_type,
        pageNo: img.page_no,
        caption: img.caption,
        imageIndex: img.image_index,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
