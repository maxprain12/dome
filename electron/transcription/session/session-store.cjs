'use strict';

/**
 * In-memory mirror of active `transcription_sessions` rows + the
 * `transcription:state` broadcast. One active session at a time.
 *
 * @typedef {Object} ActiveSession
 * @property {string} id
 * @property {string} projectId
 * @property {string|null} folderId
 * @property {Array<'mic'|'system'>} sources
 * @property {boolean} livePreview
 * @property {'realtime'|'chunks'|null} liveEngine
 * @property {boolean} saveAudio
 * @property {string} sessionDir
 * @property {'recording'|'paused'|'transcribing'|'error'} phase
 * @property {number} startedAt
 * @property {number} pausedElapsedMs
 * @property {number|null} pausedAt
 * @property {string} partialText
 * @property {string|null} notice   non-fatal warning code (e.g. realtime fell back to chunks)
 * @property {string|null} error    error code when phase === 'error'
 * @property {NodeJS.Timeout|null} ticker
 * @property {NodeJS.Timeout|null} broadcastTimer
 * @property {object|null} live     realtime transcriber handle
 * @property {boolean} chunkSttBusy
 */

/** @type {Map<string, ActiveSession>} */
const sessions = new Map();
let windowManager = null;

const IDLE_STATE = Object.freeze({
  sessionId: null,
  phase: 'idle',
  sources: [],
  seconds: 0,
  livePreview: false,
  liveEngine: null,
  partialText: '',
  notice: null,
  error: null,
});

function setWindowManager(wm) {
  windowManager = wm;
}

function getWindowManager() {
  return windowManager;
}

function elapsedSeconds(s) {
  const end = s.phase === 'paused' && s.pausedAt ? s.pausedAt : Date.now();
  return Math.max(0, Math.floor((end - s.startedAt - s.pausedElapsedMs) / 1000));
}

function stateOf(s) {
  if (!s) return { ...IDLE_STATE };
  return {
    sessionId: s.id,
    phase: s.phase,
    sources: s.sources,
    seconds: elapsedSeconds(s),
    livePreview: s.livePreview,
    liveEngine: s.liveEngine,
    partialText: s.partialText,
    notice: s.notice,
    error: s.error,
  };
}

function broadcastState(s) {
  windowManager?.broadcast('transcription:state', stateOf(s));
}

function broadcastIdle() {
  windowManager?.broadcast('transcription:state', { ...IDLE_STATE });
}

/** Coalesce rapid live-text updates (realtime deltas) into ~8 broadcasts/s. */
function scheduleBroadcast(s) {
  if (s.broadcastTimer) return;
  s.broadcastTimer = setTimeout(() => {
    s.broadcastTimer = null;
    if (sessions.get(s.id) === s) broadcastState(s);
  }, 120);
}

function startTicker(s) {
  if (s.ticker) return;
  s.ticker = setInterval(() => {
    if (s.phase === 'recording') broadcastState(s);
  }, 1000);
}

function stopTimers(s) {
  if (s.ticker) clearInterval(s.ticker);
  if (s.broadcastTimer) clearTimeout(s.broadcastTimer);
  s.ticker = null;
  s.broadcastTimer = null;
}

function getActiveState() {
  const list = Array.from(sessions.values());
  return stateOf(list.at(-1) ?? null);
}

module.exports = {
  sessions,
  setWindowManager,
  getWindowManager,
  broadcastState,
  broadcastIdle,
  scheduleBroadcast,
  startTicker,
  stopTimers,
  getActiveState,
};
