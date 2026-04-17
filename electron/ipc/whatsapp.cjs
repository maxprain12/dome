/* eslint-disable no-console */
function register({ ipcMain, windowManager, database, fileStorage, ollamaService, initModule, aiToolsHandler }) {
  // Lazy load WhatsApp service to avoid issues if Baileys is not installed
  let whatsappService = null;
  function getWhatsappService() {
    if (!whatsappService) {
      try {
        whatsappService = require('../whatsapp/service.cjs');
        whatsappService.init({
          database,
          fileStorage,
          windowManager,
          ollamaService,
          initModule,
          aiToolsHandler,
        });
      } catch (error) {
        console.error('[WhatsApp] Failed to load service:', error.message);
        return null;
      }
    }
    return whatsappService;
  }

  ipcMain.handle('whatsapp:status', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return {
        success: true,
        data: {
          isRunning: false,
          state: 'disconnected',
          qrCode: null,
          selfId: null,
          hasAuth: false,
          error: 'WhatsApp service not available. Install @whiskeysockets/baileys',
        },
      };
    }

    try {
      return { success: true, data: service.getStatus() };
    } catch (error) {
      console.error('[WhatsApp] status error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('whatsapp:start', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    try {
      return await service.start();
    } catch (error) {
      console.error('[WhatsApp] start error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('whatsapp:stop', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    try {
      return await service.stop();
    } catch (error) {
      console.error('[WhatsApp] stop error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('whatsapp:logout', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    try {
      await service.logout();
      return service.clearSession();
    } catch (error) {
      console.error('[WhatsApp] logout error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('whatsapp:send', async (event, { phoneNumber, text }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    try {
      return await service.sendMessage(phoneNumber, text);
    } catch (error) {
      console.error('[WhatsApp] send error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('whatsapp:allowlist:get', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: true, data: [] };
    }

    try {
      return { success: true, data: service.getAllowlist() };
    } catch (error) {
      console.error('[WhatsApp] allowlist:get error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('whatsapp:allowlist:add', (event, phoneNumber) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    try {
      service.addToAllowlist(phoneNumber);
      return { success: true };
    } catch (error) {
      console.error('[WhatsApp] allowlist:add error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('whatsapp:allowlist:remove', (event, phoneNumber) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    try {
      service.removeFromAllowlist(phoneNumber);
      return { success: true };
    } catch (error) {
      console.error('[WhatsApp] allowlist:remove error:', error.message);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
