/* eslint-disable no-console */
const hubTrayState = require('../hub-tray-state.cjs');
const transcriptionMainHub = require('../transcription-main-hub.cjs');

/**
 * @param {Object} params
 * @param {Electron.IpcMain} params.ipcMain
 * @param {import('../window-manager.cjs')} params.windowManager
 */
function register({ ipcMain, windowManager }) {
  /**
   * Main-window hub reports recording phase for tray tooltip + AppShell mic indicator.
   * @param {{ phase?: string, mode?: string, seconds?: number, captureKind?: string }} payload
   */
  ipcMain.handle('transcription-overlay:set-state', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (!transcriptionMainHub.senderIsMainWebContents(windowManager, event.sender.id)) {
      return { success: false, error: 'Only main window may report hub state' };
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
      console.error('[TranscriptionHub] set-state:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription-overlay:toggle-from-ui', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      transcriptionMainHub.sendToggleRecordingToMain(windowManager);
      return { success: true };
    } catch (err) {
      console.error('[TranscriptionHub] toggle-from-ui:', err);
      return { success: false, error: err.message };
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
    const mainWin = transcriptionMainHub.getMainWindow(windowManager);
    if (!mainWin) {
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
      console.error('[TranscriptionHub] open-note-in-main:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
