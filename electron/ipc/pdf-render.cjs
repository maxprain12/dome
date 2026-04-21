/* eslint-disable no-console */
'use strict';

const fileStorage = require('../file-storage.cjs');
const pdfExtractor = require('../pdf-extractor.cjs');

/**
 * @param {Object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {Object} deps.windowManager
 * @param {Object} deps.database
 * @param {Function} deps.validateSender
 */
function register({ ipcMain, windowManager, database, validateSender }) {
  ipcMain.handle('pdf:render-page', async (event, payload = {}) => {
    try {
      validateSender(event, windowManager);
      const resourceId = typeof payload.resourceId === 'string' ? payload.resourceId : '';
      const pageNumber = Number(payload.pageNumber);
      if (!resourceId || !Number.isFinite(pageNumber) || pageNumber < 1) {
        return { success: false, error: 'resourceId and pageNumber (>=1) required' };
      }
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (!resource || resource.type !== 'pdf' || !resource.internal_path) {
        return { success: false, error: 'not a PDF resource' };
      }
      const fullPath = fileStorage.getFullPath(resource.internal_path);
      if (!fullPath) {
        return { success: false, error: 'file not found' };
      }
      const scale = Number(payload.scale) > 0 ? Number(payload.scale) : 1.25;
      const rend = await pdfExtractor.renderPdfPagePngDataUrl(fullPath, Math.floor(pageNumber), scale);
      if (!rend.success || !rend.dataUrl) {
        return { success: false, error: rend.error || 'render failed' };
      }
      return { success: true, dataUrl: rend.dataUrl };
    } catch (e) {
      console.error('[pdf-render]', e);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

module.exports = { register };
