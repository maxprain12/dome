/* eslint-disable no-console */
function register({ ipcMain, windowManager, authManager }) {
  ipcMain.handle('auth:profiles:list', (event, provider) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      return { success: true, data: authManager.listProfiles(provider) };
    } catch (error) {
      console.error('[Auth] profiles:list error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:profiles:create', (event, params) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const profileId = authManager.createAuthProfile(params);
      return { success: true, data: { profileId } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:profiles:delete', (event, profileId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      authManager.deleteAuthProfile(profileId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:resolve', (event, { provider, profileId }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = authManager.resolveApiKey({ provider, profileId });
      if (result) {
        return {
          success: true,
          data: {
            source: result.source,
            mode: result.mode,
            profileId: result.profileId,
            hasKey: true,
          },
        };
      }
      return { success: true, data: { hasKey: false } };
    } catch (error) {
      console.error('[Auth] resolve error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:validate', async (event, { provider, apiKey }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      return await authManager.validateApiKey(provider, apiKey);
    } catch (error) {
      console.error('[Auth] validate error:', error.message);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
