/* eslint-disable no-console */
/**
 * Global shortcut to toggle in-app voice recording / dictation.
 */
const { globalShortcut } = require('electron');
const transcriptionMainHub = require('./transcription-main-hub.cjs');

let registeredAccelerator = null;

/**
 * Global dictation shortcut is opt-in via `transcription_global_shortcut_enabled`.
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

function sendToggleToMain(windowManager) {
  transcriptionMainHub.sendToggleRecordingToMain(windowManager);
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
      console.warn('[Transcription] Global shortcut registration returned false:', accel);
    }
  } catch (err) {
    console.warn('[Transcription] Global shortcut error:', err?.message);
  }
}

function unregisterAll() {
  if (registeredAccelerator) {
    try {
      globalShortcut.unregister(registeredAccelerator);
    } catch (_) {
      /* */
    }
    registeredAccelerator = null;
  }
}

module.exports = {
  registerFromDatabase,
  unregisterAll,
  sendToggleToMain,
};
