/* eslint-disable no-console */
/**
 * Last-known transcription hub state (from overlay renderer via set-state IPC).
 * Used to build the system tray menu and tooltip.
 */

const DEFAULTS = {
  phase: 'idle',
  mode: 'dictation',
  seconds: 0,
  hubVisible: false,
  captureKind: 'microphone',
  canPause: false,
};

let state = { ...DEFAULTS };
/** @type {null | (() => void)} */
let refreshCallback = null;

module.exports = {
  /**
   * @param {Partial<typeof DEFAULTS>} partial
   */
  update(partial) {
    if (!partial || typeof partial !== 'object') return;
    const next = { ...state };
    if (partial.phase !== undefined) next.phase = String(partial.phase);
    if (partial.mode !== undefined) next.mode = String(partial.mode);
    if (partial.seconds !== undefined) next.seconds = Math.max(0, Number(partial.seconds) || 0);
    if (partial.hubVisible !== undefined) next.hubVisible = Boolean(partial.hubVisible);
    if (partial.captureKind !== undefined) next.captureKind = String(partial.captureKind);
    if (partial.canPause !== undefined) next.canPause = Boolean(partial.canPause);
    state = next;
    try {
      refreshCallback?.();
    } catch (e) {
      console.warn('[HubTrayState] refreshCallback:', e?.message);
    }
  },

  get() {
    return { ...state };
  },

  /** @param {null | (() => void)} fn */
  setRefreshCallback(fn) {
    refreshCallback = typeof fn === 'function' ? fn : null;
  },
};
