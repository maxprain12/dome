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
        needsOnboarding: true,
      };
    }
  });

  // Check onboarding status
  ipcMain.handle('init:check-onboarding', (event) => {
    try {
      validateSender(event, windowManager);
      return {
        success: true,
        needsOnboarding: initModule.checkOnboardingStatus(),
      };
    } catch (error) {
      console.error('[INIT] Error checking onboarding:', error);
      return {
        success: false,
        error: error.message,
        needsOnboarding: true,
      };
    }
  });

  // Get initialization status
  ipcMain.handle('init:get-status', (event) => {
    try {
      validateSender(event, windowManager);
      return {
        success: true,
        isInitialized: initModule.isInitialized(),
      };
    } catch (error) {
      console.error('[IPC] Error in init:get-status:', error.message);
      throw error;
    }
  });
}

module.exports = { register };
