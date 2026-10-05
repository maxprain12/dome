/* eslint-disable no-console */
function register({ ipcMain, windowManager, initModule, validateSender }) {
  ipcMain.handle('init:initialize', async (event) => {
    try {
      validateSender(event, windowManager);
      return await initModule.initializeApp();
    } catch (error) {
      console.error('[INIT] Error initializing app:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get initialization status
  ipcMain.handle('init:get-status', (event) => {
    try {
      validateSender(event, windowManager);
      return {
        success: true,
        data: {
          isInitialized: initModule.isInitialized(),
        },
      };
    } catch (error) {
      console.error('[IPC] Error in init:get-status:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  });
}

module.exports = { register };
