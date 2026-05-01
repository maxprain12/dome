/* eslint-disable no-console */
const callSessionEngine = require('../call-session-engine.cjs');

/**
 * @param {Object} params
 * @param {Electron.IpcMain} params.ipcMain
 * @param {import('../window-manager.cjs')} params.windowManager
 * @param {Object} params.database
 * @param {Object} params.fileStorage
 * @param {Object} params.aiToolsHandler
 * @param {Object} params.thumbnail
 * @param {Object} params.initModule
 * @param {Object} params.ollamaService
 */
function register({ ipcMain, windowManager, database, fileStorage, aiToolsHandler, thumbnail, initModule, ollamaService }) {
  const deps = { database, fileStorage, aiToolsHandler, windowManager, thumbnail, initModule, ollamaService };

  ipcMain.handle('calls:start', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const sessionId = callSessionEngine.startSession(deps, {
        projectId: payload.projectId,
        folderId: payload.folderId,
        callPlatform: payload.callPlatform,
        saveRecordingAsAudio: payload.saveRecordingAsAudio,
      });
      return { success: true, sessionId };
    } catch (err) {
      console.error('[calls:start]', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calls:append-chunk', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return await callSessionEngine.appendChunk(deps, {
        sessionId: payload.sessionId,
        track: payload.track,
        buffer: payload.buffer,
        seq: payload.seq,
        startMs: payload.startMs,
        extension: payload.extension,
      });
    } catch (err) {
      console.error('[calls:append-chunk]', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calls:get-live', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return callSessionEngine.getLive(payload.sessionId);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calls:pause', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return await callSessionEngine.setPaused(payload.sessionId, true);
    } catch (err) {
      console.error('[calls:pause]', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calls:resume', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return await callSessionEngine.setPaused(payload.sessionId, false);
    } catch (err) {
      console.error('[calls:resume]', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calls:stop', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return await callSessionEngine.stopSession(deps, payload.sessionId);
    } catch (err) {
      console.error('[calls:stop]', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calls:cancel', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return callSessionEngine.cancelSession(payload.sessionId);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('calls:regenerate-summary', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const noteId = typeof payload.noteId === 'string' ? payload.noteId.trim() : '';
      if (!noteId) return { success: false, error: 'noteId required' };
      return await callSessionEngine.regenerateSummaryForNote(deps, noteId);
    } catch (err) {
      console.error('[calls:regenerate-summary]', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
