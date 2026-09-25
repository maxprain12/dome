/* eslint-disable no-console */
/**
 * Global shortcut to toggle transcription. Sends `transcription:toggle-recording`
 * to the main window; the renderer's TranscriptionPill listens via the
 * `onToggleRecording` API exposed in preload.cjs.
 */
const { globalShortcut } = require('electron');

let registeredAccelerator = null;

/**
 * Global shortcut is opt-in via `transcription_global_shortcut_enabled`.
 * Legacy: if the flag row is missing but a non-empty accelerator is stored, register (migration).
 */
function isShortcutRegistrationEnabled(database) {
  try {
    const queries = database.getQueries();
    const enabledRow = queries.getSetting.get('transcription_global_shortcut_enabled');
    const accelRow = queries.getSetting.get('transcription_global_shortcut');
    const accel = accelRow?.value && String(accelRow.value).trim();
    const v = enabledRow?.value != null ? String(enabledRow.value).trim().toLowerCase() : '';
    if (v === '0' || v === 'false' || v === 'off') return false;
    if (v === '1' || v === 'true' || v === 'on') return Boolean(accel);
    return Boolean(accel);
  } catch {
    return false;
  }
}

function focusMain(windowManager) {
  const mainWin = windowManager.get('main');
  if (!mainWin || mainWin.isDestroyed()) return null;
  try {
    if (!mainWin.isVisible()) mainWin.show();
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  } catch { /* ignore */ }
  return mainWin;
}

function sendToggleToMain(windowManager) {
  const mainWin = focusMain(windowManager);
  if (!mainWin) return;
  try {
    mainWin.webContents.send('transcription:toggle-recording');
  } catch (e) {
    console.warn('[TranscriptionShortcut] toggle-recording:', e?.message);
  }
}

/**
 * @param {Object} database
 * @param {Object} windowManager
 */
function registerFromDatabase(database, windowManager) {
  unregisterAll();
  try {
    if (!isShortcutRegistrationEnabled(database)) return;
    const row = database.getQueries().getSetting.get('transcription_global_shortcut');
    const accel = row?.value && String(row.value).trim();
    if (!accel) return;

    const ok = globalShortcut.register(accel, () => sendToggleToMain(windowManager));
    if (ok) {
      registeredAccelerator = accel;
    } else {
      console.warn('[TranscriptionShortcut] register returned false:', accel);
    }
  } catch (err) {
    console.warn('[TranscriptionShortcut] register error:', err?.message);
  }
}

function unregisterAll() {
  if (registeredAccelerator) {
    try { globalShortcut.unregister(registeredAccelerator); } catch { /* ignore */ }
    registeredAccelerator = null;
  }
}

module.exports = {
  registerFromDatabase,
  unregisterAll,
  sendToggleToMain,
};
