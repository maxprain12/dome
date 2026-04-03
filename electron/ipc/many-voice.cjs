/* eslint-disable no-console */
const manyVoiceOverlay = require('../many-voice-overlay.cjs');

/**
 * @param {Object} params
 * @param {Electron.IpcMain} params.ipcMain
 * @param {import('../window-manager.cjs')} params.windowManager
 */
function register({ ipcMain, windowManager }) {
  ipcMain.handle('many-voice:toggle-overlay-from-ui', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      manyVoiceOverlay.showAndFocus(windowManager);
      const win = manyVoiceOverlay.getVoiceTargetWindow(windowManager);
      if (win && !win.isDestroyed()) {
        win.webContents.send('many-voice-assistant:toggle');
      }
      return { success: true };
    } catch (err) {
      console.error('[ManyVoice] toggle-overlay-from-ui:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('many-voice:relay-send', async (event, payload) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      return { success: false, error: 'Empty text' };
    }
    const mainWin = windowManager.get('main');
    if (!mainWin || mainWin.isDestroyed()) {
      return { success: false, error: 'Main window not available' };
    }
    mainWin.webContents.send('many-voice:relay-to-main', {
      text,
      autoSpeak: Boolean(payload?.autoSpeak),
      /** Solo abre el panel si el cliente lo pide explícitamente (voz suele usar false). */
      openPanel: payload?.openPanel === true,
      voiceLanguage: typeof payload?.voiceLanguage === 'string' ? payload.voiceLanguage : 'es',
    });
    return { success: true };
  });

  ipcMain.handle('many-voice:push-state-to-overlay', async (event, payload) => {
    const mainWin = windowManager.get('main');
    if (!mainWin || mainWin.isDestroyed() || mainWin.webContents.id !== event.sender.id) {
      return { success: false, error: 'Not main window' };
    }
    const ov = windowManager.get(manyVoiceOverlay.MANY_VOICE_OVERLAY_ID);
    if (ov && !ov.isDestroyed()) {
      ov.webContents.send('many-voice:hud-state', {
        status: payload?.status,
        ttsError: payload?.ttsError ?? null,
        currentSentence: payload?.currentSentence ?? null,
      });
    }
    return { success: true };
  });

  ipcMain.handle('many-voice:overlay-mounted', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const mainWin = windowManager.get('main');
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('many-voice:request-state-push');
    }
    return { success: true };
  });

  ipcMain.handle('many-voice:overlay-set-visible', async (event, { visible }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const ov = windowManager.get(manyVoiceOverlay.MANY_VOICE_OVERLAY_ID);
    if (!ov || ov.isDestroyed()) {
      return { success: false, error: 'Overlay missing' };
    }
    if (visible) {
      manyVoiceOverlay.reposition(ov);
      ov.show();
    } else {
      ov.hide();
    }
    return { success: true };
  });

  ipcMain.handle('many-voice:open-many-panel', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const mainWin = windowManager.get('main');
    if (mainWin && !mainWin.isDestroyed()) {
      if (!mainWin.isVisible()) mainWin.show();
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
      mainWin.webContents.send('many-voice:open-panel-request');
    }
    return { success: true };
  });

  ipcMain.handle('many-voice:dismiss-tts-error', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const mainWin = windowManager.get('main');
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('many-voice:dismiss-tts-error');
    }
    return { success: true };
  });

  ipcMain.handle('many-voice:overlay-resize', async (event, { height }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const ov = windowManager.get(manyVoiceOverlay.MANY_VOICE_OVERLAY_ID);
    if (!ov || ov.isDestroyed()) return { success: false, error: 'Overlay missing' };
    const h = Math.max(60, Math.min(300, Math.round(Number(height))));
    const bounds = ov.getBounds();
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay();
    const { x: dx, y: dy, width: dw, height: dh } = display.workArea;
    const posX = Math.round(dx + (dw - bounds.width) / 2);
    const posY = Math.round(dy + dh - h - 24);
    ov.setBounds({ x: posX, y: posY, width: bounds.width, height: h });
    return { success: true };
  });
}

module.exports = { register };
