/* eslint-disable no-console */
function register({ ipcMain, windowManager, database, fileStorage, ollamaService }) {
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

    return { success: true, data: service.getStatus() };
  });

  ipcMain.handle('whatsapp:start', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    return await service.start();
  });

  ipcMain.handle('whatsapp:stop', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    return await service.stop();
  });

  ipcMain.handle('whatsapp:logout', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    // Hacer logout y limpiar sesión (requiere nuevo QR)
    await service.logout();
    return service.clearSession();
  });

  ipcMain.handle('whatsapp:send', async (event, { phoneNumber, text }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    return await service.sendMessage(phoneNumber, text);
  });

  ipcMain.handle('whatsapp:allowlist:get', (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: true, data: [] };
    }

    return { success: true, data: service.getAllowlist() };
  });

  ipcMain.handle('whatsapp:allowlist:add', (event, phoneNumber) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    service.addToAllowlist(phoneNumber);
    return { success: true };
  });

  ipcMain.handle('whatsapp:allowlist:remove', (event, phoneNumber) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const service = getWhatsappService();
    if (!service) {
      return { success: false, error: 'WhatsApp service not available' };
    }

    service.removeFromAllowlist(phoneNumber);
    return { success: true };
  });
}

module.exports = { register };
