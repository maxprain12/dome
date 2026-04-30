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

  ipcMain.handle('domeauth:getSession', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, connected: false, error: 'Unauthorized' };
    }

    try {
      const session = await domeOauth.getOrRefreshSession(database);
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

  ipcMain.handle('domeauth:disconnect', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      await domeOauth.disconnect(database);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.message || 'Failed to disconnect' };
    }
  });

  ipcMain.handle('domeauth:getQuota', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const session = await domeOauth.getOrRefreshSession(database);
      if (!session.connected || !session.accessToken) {
        return { success: false, error: 'Not connected' };
      }
      const response = await domeOauth.fetchWithDomeAuth(
        database,
        `${domeOauth.getDomeProviderBaseUrl()}/api/v1/me/quota`,
      );
      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `Quota request failed: ${response.status} ${text}` };
      }
      const data = await response.json();
      return { success: true, ...data };
    } catch (error) {
      return { success: false, error: error?.message || 'Failed to get quota' };
    }
  });
}

module.exports = { register };
