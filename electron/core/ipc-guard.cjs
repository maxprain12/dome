/**
 * Wrap ipcMain.handle to enforce sender validation on every channel.
 */
const EXEMPT_CHANNELS = new Set([
  // Internal/no-renderer channels can be added here if needed.
]);

function createSecureIpcMain(ipcMain, windowManager, validateSender) {
  const originalHandle = ipcMain.handle.bind(ipcMain);

  return {
    ...ipcMain,
    handle(channel, listener) {
      if (EXEMPT_CHANNELS.has(channel)) {
        return originalHandle(channel, listener);
      }
      return originalHandle(channel, async (event, ...args) => {
        try {
          validateSender(event, windowManager);
        } catch (err) {
          const msg = err?.message || 'Unauthorized';
          if (msg.includes('Unauthorized')) {
            return { success: false, error: 'Unauthorized' };
          }
          throw err;
        }
        return listener(event, ...args);
      });
    },
  };
}

module.exports = {
  createSecureIpcMain,
  EXEMPT_CHANNELS,
};
