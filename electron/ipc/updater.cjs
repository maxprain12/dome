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
      return result;
    } catch (error) {
      console.error('[IPC] Error in updater:check:', error.message);
      throw error;
    }
  });

  ipcMain.handle('updater:download', async (event) => {
    try {
      validateSender(event, windowManager);
      return await updateService.downloadUpdate();
    } catch (error) {
      console.error('[IPC] Error in updater:download:', error.message);
      throw error;
    }
  });

  ipcMain.handle('updater:install', async (event) => {
    try {
      validateSender(event, windowManager);
      updateService.quitAndInstall();
      return { ok: true };
    } catch (error) {
      console.error('[IPC] Error in updater:install:', error.message);
      throw error;
    }
  });
}

module.exports = { register };
