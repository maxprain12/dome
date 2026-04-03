/* eslint-disable no-console */
const browserContextService = require('../browser-context-service.cjs');

function register({ ipcMain, windowManager }) {
  ipcMain.handle('browser:get-active-tab-macos', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const result = await browserContextService.getActiveBrowserTabMacOS();
      return result;
    } catch (err) {
      console.error('[BrowserContext IPC]', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
