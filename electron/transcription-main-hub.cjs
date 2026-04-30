/* eslint-disable no-console */
/**
 * Focus main window + expand embedded transcription hub dock (renderer listens on transcription:expand-hub-dock).
 */

/**
 * @param {import('./window-manager.cjs')} windowManager
 * @returns {import('electron').BrowserWindow | null}
 */
function getMainWindow(windowManager) {
  const w = windowManager.get('main');
  return w && !w.isDestroyed() ? w : null;
}

/**
 * @param {import('./window-manager.cjs')} windowManager
 * @returns {boolean}
 */
function focusMainExpandHubDock(windowManager) {
  const mainWin = getMainWindow(windowManager);
  if (!mainWin) return false;
  try {
    if (!mainWin.isVisible()) mainWin.show();
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
    windowManager.send('main', 'transcription:expand-hub-dock', {});
    return true;
  } catch (e) {
    console.warn('[TranscriptionMainHub] focusMainExpandHubDock:', e?.message);
    return false;
  }
}

/**
 * @param {import('./window-manager.cjs')} windowManager
 */
function sendToggleRecordingToMain(windowManager) {
  const mainWin = getMainWindow(windowManager);
  if (!focusMainExpandHubDock(windowManager) || !mainWin) return;
  try {
    mainWin.webContents.send('transcription:toggle-recording');
  } catch (e) {
    console.warn('[TranscriptionMainHub] toggle-recording:', e?.message);
  }
}

/**
 * @param {import('./window-manager.cjs')} windowManager
 * @param {string} action
 */
function sendTrayActionToMain(windowManager, action) {
  const mainWin = getMainWindow(windowManager);
  if (!focusMainExpandHubDock(windowManager) || !mainWin) return;
  try {
    mainWin.webContents.send('transcription:tray-action', { action });
  } catch (e) {
    console.warn('[TranscriptionMainHub] tray-action:', e?.message);
  }
}

/**
 * @param {import('./window-manager.cjs')} windowManager
 * @param {number} senderWebContentsId
 */
function senderIsMainWebContents(windowManager, senderWebContentsId) {
  const mainWin = getMainWindow(windowManager);
  return !!(mainWin && mainWin.webContents.id === senderWebContentsId);
}

module.exports = {
  getMainWindow,
  focusMainExpandHubDock,
  sendToggleRecordingToMain,
  sendTrayActionToMain,
  senderIsMainWebContents,
};
