/* eslint-disable no-console */
const transcriptionOverlay = require('../transcription-overlay.cjs');
const hubTrayState = require('../hub-tray-state.cjs');

/**
 * @param {Object} params
 * @param {Electron.IpcMain} params.ipcMain
 * @param {import('../window-manager.cjs')} params.windowManager
 */
function register({ ipcMain, windowManager }) {
  /**
   * Overlay reports recording phase so main can broadcast to all windows (e.g. AppShell mic indicator).
   * @param {{ phase?: string, mode?: string, seconds?: number, captureKind?: string }} payload
   */
  ipcMain.handle('transcription-overlay:set-state', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const ov = windowManager.get(transcriptionOverlay.TRANSCRIPTION_OVERLAY_ID);
    if (!ov || ov.isDestroyed() || ov.webContents.id !== event.sender.id) {
      return { success: false, error: 'Only transcription overlay may report state' };
    }
    const safe =
      payload != null && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : {};
    try {
      windowManager.broadcast('transcription:state', safe);
      hubTrayState.update({
        phase: typeof safe.phase === 'string' ? safe.phase : undefined,
        mode: typeof safe.mode === 'string' ? safe.mode : undefined,
        seconds: safe.seconds,
        hubVisible: safe.hubVisible,
        captureKind: typeof safe.captureKind === 'string' ? safe.captureKind : undefined,
        canPause: safe.canPause,
      });
      return { success: true };
    } catch (err) {
      console.error('[TranscriptionOverlay] set-state:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription-overlay:toggle-from-ui', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      transcriptionOverlay.showAndFocus(windowManager);
      const ov = windowManager.get(transcriptionOverlay.TRANSCRIPTION_OVERLAY_ID);
      if (ov && !ov.isDestroyed()) {
        ov.webContents.send('transcription:toggle-recording');
      }
      return { success: true };
    } catch (err) {
      console.error('[TranscriptionOverlay] toggle-from-ui:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription-overlay:overlay-set-visible', async (event, { visible }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const ov = windowManager.get(transcriptionOverlay.TRANSCRIPTION_OVERLAY_ID);
    if (!ov || ov.isDestroyed()) {
      return { success: false, error: 'Overlay missing' };
    }
    try {
      if (visible) {
        transcriptionOverlay.reposition(ov);
        ov.show();
      } else {
        ov.hide();
      }
      return { success: true };
    } catch (error) {
      console.error('[TranscriptionOverlay] overlay-set-visible error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transcription-overlay:overlay-resize', async (event, { height }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const ov = windowManager.get(transcriptionOverlay.TRANSCRIPTION_OVERLAY_ID);
    if (!ov || ov.isDestroyed()) return { success: false, error: 'Overlay missing' };
    try {
      const h = Math.max(72, Math.min(780, Math.round(Number(height))));
      const bounds = ov.getBounds();
      const { screen } = require('electron');
      const display = screen.getPrimaryDisplay();
      const { x: dx, y: dy, width: dw, height: dh } = display.workArea;
      const posX = Math.round(dx + (dw - bounds.width) / 2);
      const posY = Math.round(dy + dh - h - 24);
      ov.setBounds({ x: posX, y: posY, width: bounds.width, height: h });
      return { success: true };
    } catch (error) {
      console.error('[TranscriptionOverlay] overlay-resize error:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transcription-overlay:open-note-in-main', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    const noteId = typeof payload.noteId === 'string' ? payload.noteId.trim() : '';
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!noteId) {
      return { success: false, error: 'noteId is required' };
    }
    const mainWin = windowManager.get('main');
    if (!mainWin || mainWin.isDestroyed()) {
      return { success: false, error: 'Main window not available' };
    }
    try {
      if (!mainWin.isVisible()) mainWin.show();
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
      mainWin.webContents.send('dome:open-resource-in-tab', {
        resourceId: noteId,
        resourceType: 'note',
        title: title || 'Nota',
      });
      return { success: true };
    } catch (err) {
      console.error('[TranscriptionOverlay] open-note-in-main:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
