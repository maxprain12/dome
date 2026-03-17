/* eslint-disable no-console */
const domeOauth = require('../dome-oauth.cjs');

function register({ ipcMain, windowManager, database }) {
  ipcMain.handle('domeauth:startOAuthFlow', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await domeOauth.startOAuthFlow(database);
      return result;
    } catch (error) {
      console.error('[DomeAuth] OAuth flow failed:', error);
      return { success: false, error: error?.message || 'OAuth flow failed' };
    }
  });

  ipcMain.handle('domeauth:getSession', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, connected: false, error: 'Unauthorized' };
    }

    try {
      const session = domeOauth.getSession(database);
      return { success: true, ...session };
    } catch (error) {
      return { success: false, connected: false, error: error?.message || 'Failed to read session' };
    }
  });

  ipcMain.handle('domeauth:openDashboard', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      domeOauth.openDashboard();
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || 'Failed to open dashboard' };
    }
  });

  ipcMain.handle('domeauth:disconnect', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      domeOauth.disconnect(database);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || 'Failed to disconnect' };
    }
  });
}

module.exports = { register };
