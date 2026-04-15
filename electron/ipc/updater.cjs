/* eslint-disable no-console */
/**
 * IPC handlers for auto-updater
 */

const updateService = require('../update-service.cjs');

function register({ ipcMain, windowManager, validateSender }) {
  ipcMain.handle('updater:check', async (event) => {
    try {
      validateSender(event, windowManager);
      const result = await updateService.checkForUpdates();
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Error in updater:check:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater:download', async (event) => {
    try {
      validateSender(event, windowManager);
      const result = await updateService.downloadUpdate();
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Error in updater:download:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater:install', async (event) => {
    try {
      validateSender(event, windowManager);
      updateService.quitAndInstall();
      return { success: true, data: { ok: true } };
    } catch (error) {
      console.error('[IPC] Error in updater:install:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater:skip', async (event, version) => {
    try {
      validateSender(event, windowManager);
      if (typeof version !== 'string' || !version.trim()) {
        return { success: false, error: 'invalid_version' };
      }
      updateService.skipVersion(version.trim());
      return { success: true, data: { ok: true } };
    } catch (error) {
      console.error('[IPC] Error in updater:skip:', error.message);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
