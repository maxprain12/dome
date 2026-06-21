/**
 * Wrap ipcMain.handle to enforce sender validation on every channel.
 */
const EXEMPT_CHANNELS = new Set([
  // Internal/no-renderer channels can be added here if needed.
]);

function traceIpc(channel, phase, err) {
  try {
    const tracer = require('./crash-tracer.cjs');
    if (!tracer.isEnabled()) return;
    if (phase === 'error') {
      tracer.breadcrumb(`ipc:${channel}:error`, { error: err?.message || String(err) });
    } else {
      tracer.breadcrumb(`ipc:${channel}:${phase}`);
    }
  } catch {
    /* ignore */
  }
}

function createSecureIpcMain(ipcMain, windowManager, validateSender) {
  const originalHandle = ipcMain.handle.bind(ipcMain);

  return {
    ...ipcMain,
    handle(channel, listener) {
      if (EXEMPT_CHANNELS.has(channel)) {
        return originalHandle(channel, listener);
      }
      return originalHandle(channel, async (event, ...args) => {
        traceIpc(channel, 'start');
        const started = Date.now();
        try {
          validateSender(event, windowManager);
        } catch (err) {
          traceIpc(channel, 'error', err);
          const msg = err?.message || 'Unauthorized';
          if (msg.includes('Unauthorized')) {
            return { success: false, error: 'Unauthorized' };
          }
          throw err;
        }
        try {
          const result = await listener(event, ...args);
          traceIpc(channel, 'done', null);
          try {
            const tracer = require('./crash-tracer.cjs');
            if (tracer.isEnabled() && Date.now() - started > 500) {
              tracer.breadcrumb(`ipc:${channel}:slow`, { durationMs: Date.now() - started });
            }
          } catch {
            /* ignore */
          }
          return result;
        } catch (err) {
          traceIpc(channel, 'error', err);
          throw err;
        }
      });
    },
  };
}

module.exports = {
  createSecureIpcMain,
  EXEMPT_CHANNELS,
};
