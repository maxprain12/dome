/* eslint-disable no-console */
/**
 * Global shortcut for Many voice assistant (Electron globalShortcut only — toggle).
 * Low-level PTT via native key hooks was removed to avoid intrusive macOS permissions.
 */
const { globalShortcut } = require('electron');
const manyVoiceOverlay = require('./many-voice-overlay.cjs');

let registeredAccelerator = null;

/**
 * Many Voice global shortcut is opt-in via `many_voice_global_shortcut_enabled`.
 * Legacy: missing flag + non-empty accelerator → enabled (migration).
 */
function isShortcutRegistrationEnabled(database) {
  try {
    const queries = database.getQueries();
    const enabledRow = queries.getSetting.get('many_voice_global_shortcut_enabled');
    const accelRow = queries.getSetting.get('many_voice_global_shortcut');
    const accel = accelRow?.value && String(accelRow.value).trim();
    const v = enabledRow?.value != null ? String(enabledRow.value).trim().toLowerCase() : '';
    if (v === '0' || v === 'false' || v === 'off') return false;
    if (v === '1' || v === 'true' || v === 'on') return Boolean(accel);
    return Boolean(accel);
  } catch {
    return false;
  }
}

function sendToggleToMain(windowManager) {
  manyVoiceOverlay.showAndFocus(windowManager);
  const win =
    windowManager.get(manyVoiceOverlay.MANY_VOICE_OVERLAY_ID) || windowManager.get('main');
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('many-voice-assistant:toggle');
  } catch (err) {
    console.warn('[ManyVoice] toggle send failed:', err?.message);
  }
}

/**
 * @param {Object} database
 * @param {Object} windowManager
 * @returns {Promise<void>}
 */
async function registerFromDatabase(database, windowManager) {
  unregisterAll();
  try {
    if (!isShortcutRegistrationEnabled(database)) return;
    const row = database.getQueries().getSetting.get('many_voice_global_shortcut');
    const accel = row?.value && String(row.value).trim();
    if (!accel) return;

    const ok = globalShortcut.register(accel, () => sendToggleToMain(windowManager));
    if (ok) {
      registeredAccelerator = accel;
      console.log('[ManyVoice] Global shortcut (toggle) registered:', accel);
    } else {
      console.warn('[ManyVoice] Global shortcut registration returned false:', accel);
    }
  } catch (err) {
    console.warn('[ManyVoice] Global shortcut error:', err?.message);
  }
}

function unregisterAll() {
  if (registeredAccelerator) {
    try {
      globalShortcut.unregister(registeredAccelerator);
    } catch (_) {
      /* */
    }
  }
  registeredAccelerator = null;
}

module.exports = {
  registerFromDatabase,
  unregisterAll,
  sendToggleToMain,
};
