'use strict';

/**
 * Transcription session engine (main process).
 *
 * One session model with pluggable sources (mic, system, both). WebM chunks
 * are persisted as they arrive so a crash never drops audio. Live text comes
 * from the engine picked by stt-engine (`realtime` PCM stream or `chunks`
 * re-transcription); the final transcript is produced on stop.
 *
 * Public API:
 *   startSession(deps, opts) -> { sessionId, liveEngine }
 *   appendChunk(deps, payload)          WebM chunk (archive + chunks engine)
 *   appendAudio(payload)                PCM16 frame (realtime engine)
 *   controlSession(deps, sessionId, action) -> { resourceId? }   pause|resume|cancel|stop
 *   finalizeSession(deps, sessionId)    also used by crash recovery
 *   getActiveState()
 */

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const config = require('../stt/stt-config.cjs');
const batchStt = require('../stt/batch-stt.cjs');
const sttEngine = require('../stt-engine.cjs');
const { TranscriptionError, toErrorCode } = require('../errors.cjs');
const store = require('./session-store.cjs');
const { concatFilesToMp3, safeUnlink } = require('./session-audio.cjs');
const { finalizeSession, safeRmdir } = require('./session-finalize.cjs');

const PARTIAL_PERSIST_MS = 3000;

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function ensureSessionsRoot() {
  const root = path.join(app.getPath('userData'), 'transcription-sessions');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function requireSession(sessionId) {
  const s = store.sessions.get(sessionId);
  if (!s) throw new TranscriptionError('session_not_found');
  return s;
}

function setLiveText(deps, session, text) {
  if (store.sessions.get(session.id) !== session || !text) return;
  session.partialText = text;
  const now = Date.now();
  if (now - (session.partialPersistedAt || 0) >= PARTIAL_PERSIST_MS) {
    session.partialPersistedAt = now;
    deps.database.getQueries().setTranscriptionPartial.run(text, now, session.id);
  }
  store.scheduleBroadcast(session);
}

// ─── Live engines ────────────────────────────────────────────────────────

function startRealtime(deps, session) {
  try {
    session.live = sttEngine.createLiveTranscriber(deps.database, {
      onText: (text) => setLiveText(deps, session, text),
      onError: (code, detail) => {
        console.warn('[TranscriptionSession] realtime:', detail || code);
        if (store.sessions.get(session.id) !== session) return;
        session.liveEngine = 'chunks';
        session.notice = code;
        store.broadcastState(session);
      },
    });
  } catch (err) {
    console.warn('[TranscriptionSession] realtime unavailable:', err?.message);
    session.live = null;
    session.liveEngine = 'chunks';
    session.notice = 'realtime_connection_failed';
  }
}

/** Chunks engine: re-transcribe everything recorded so far on this track (skips while busy). */
async function transcribeChunksBestEffort(deps, session, track) {
  if (session.chunkSttBusy) return;
  session.chunkSttBusy = true;
  const tempMp3 = path.join(session.sessionDir, `_partial-${track}.mp3`);
  try {
    const files = deps.database.getQueries().listSessionChunks.all(session.id)
      .filter((c) => c.track === track && c.file_path && fs.existsSync(c.file_path))
      .sort((a, b) => a.seq - b.seq)
      .map((c) => c.file_path);
    if (!files.length) return;
    await concatFilesToMp3(files, tempMp3);
    const out = await batchStt.transcribeFilePath(tempMp3, {
      database: deps.database,
      captureSources: session.sources,
    });
    setLiveText(deps, session, String(out.text || '').trim());
  } catch (err) {
    console.warn('[TranscriptionSession] partial STT failed:', err?.detail || err?.message);
  } finally {
    safeUnlink(tempMp3);
    session.chunkSttBusy = false;
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────

/**
 * @param {object} deps
 * @param {{ projectId?: string, folderId?: string|null, sources: Array<'mic'|'system'>, livePreview?: boolean, saveAudio?: boolean }} opts
 */
function startSession(deps, opts) {
  const sources = Array.isArray(opts?.sources) ? opts.sources.filter((s) => s === 'mic' || s === 'system') : [];
  if (sources.length === 0) throw new Error('sources is required (mic and/or system)');
  if (store.sessions.size > 0) throw new TranscriptionError('session_already_active');

  const provider = config.getTranscriptionSttProvider(deps.database);
  if (!config.getTranscriptionApiKey(deps.database, provider)) {
    throw new TranscriptionError(provider === 'groq' ? 'missing_groq_key' : 'missing_api_key');
  }

  const projectId = opts.projectId || 'default';
  const folderId = opts.folderId != null && opts.folderId !== '' ? String(opts.folderId) : null;
  const queries = deps.database.getQueries();
  if (!queries.getProjectById.get(projectId)) throw new Error('Project not found');

  const id = genId('ts');
  const sessionDir = path.join(ensureSessionsRoot(), id);
  fs.mkdirSync(sessionDir, { recursive: true });

  const now = Date.now();
  const livePreview = Boolean(opts.livePreview);
  queries.insertTranscriptionSession.run(
    id, projectId, folderId, 'recording', JSON.stringify(sources),
    livePreview ? 1 : 0, opts.saveAudio === false ? 0 : 1, sessionDir, now, now,
  );

  /** @type {import('./session-store.cjs').ActiveSession} */
  const session = {
    id,
    projectId,
    folderId,
    sources,
    livePreview,
    liveEngine: livePreview ? sttEngine.resolveLiveEngine(deps.database) : null,
    saveAudio: opts.saveAudio !== false,
    sessionDir,
    phase: 'recording',
    startedAt: now,
    pausedElapsedMs: 0,
    pausedAt: null,
    partialText: '',
    partialPersistedAt: 0,
    notice: null,
    error: null,
    ticker: null,
    broadcastTimer: null,
    live: null,
    chunkSttBusy: false,
  };
  store.sessions.set(id, session);
  if (session.liveEngine === 'realtime') startRealtime(deps, session);
  store.startTicker(session);
  store.broadcastState(session);

  return { sessionId: id, liveEngine: session.liveEngine };
}

/** Persist a WebM chunk; with the chunks engine, refresh live text. */
async function appendChunk(deps, payload) {
  const { sessionId, track, seq, startMs, buffer, extension } = payload || {};
  if (!sessionId || (track !== 'mic' && track !== 'system')) throw new Error('Invalid chunk payload');
  const session = requireSession(sessionId);
  // Late chunks after finalization started are dropped.
  if (session.phase === 'transcribing' || session.phase === 'error') return;

  const buf = Buffer.from(buffer instanceof ArrayBuffer ? buffer : (buffer.buffer || buffer));
  const ext = (extension || 'webm').replace(/^\./, '') || 'webm';
  const filePath = path.join(session.sessionDir, `${track}-${String(seq).padStart(6, '0')}.${ext}`);
  fs.writeFileSync(filePath, buf);
  deps.database.getQueries().insertTranscriptionChunk.run(
    sessionId, Number(seq), track, Number(startMs) || 0, null, filePath, null,
  );

  if (session.livePreview && session.liveEngine === 'chunks') {
    transcribeChunksBestEffort(deps, session, track).catch(() => undefined);
  }
}

/**
 * Forward a PCM16 24 kHz mono frame to the realtime transcriber.
 * @returns {boolean} false once realtime is no longer active, so the renderer stops streaming
 */
function appendAudio(payload) {
  const session = store.sessions.get(payload?.sessionId);
  if (!session?.live || session.liveEngine !== 'realtime') return false;
  if (session.phase === 'recording') session.live.appendPcm(payload.buffer);
  return true;
}

function pauseSession(deps, sessionId) {
  const s = requireSession(sessionId);
  if (s.phase !== 'recording') return;
  s.phase = 'paused';
  s.pausedAt = Date.now();
  deps.database.getQueries().updateTranscriptionSessionStatus.run('paused', Date.now(), null, sessionId);
  store.broadcastState(s);
}

function resumeSession(deps, sessionId) {
  const s = requireSession(sessionId);
  if (s.phase !== 'paused') return;
  if (s.pausedAt) s.pausedElapsedMs += Date.now() - s.pausedAt;
  s.pausedAt = null;
  s.phase = 'recording';
  deps.database.getQueries().updateTranscriptionSessionStatus.run('recording', Date.now(), null, sessionId);
  store.broadcastState(s);
}

async function closeLive(session) {
  const live = session?.live;
  if (!live) return '';
  session.live = null;
  try {
    return await live.close();
  } catch {
    return session.partialText;
  }
}

function cancelSession(deps, sessionId) {
  const queries = deps.database.getQueries();
  const s = store.sessions.get(sessionId);
  if (s) {
    store.stopTimers(s);
    closeLive(s).catch(() => undefined);
    store.sessions.delete(sessionId);
    safeRmdir(s.sessionDir);
  }
  try {
    queries.updateTranscriptionSessionStatus.run('cancelled', Date.now(), null, sessionId);
  } catch {
    /* row may be gone */
  }
  store.broadcastIdle();
}

async function stopSession(deps, sessionId) {
  const s = store.sessions.get(sessionId);
  try {
    const liveText = s ? (await closeLive(s)) || s.partialText : '';
    const result = await finalizeSession(deps, sessionId, { liveText });
    return { resourceId: result.resourceId };
  } catch (err) {
    const code = toErrorCode(err);
    console.error('[TranscriptionSession] stop failed:', err?.detail || err?.message);
    try {
      deps.database.getQueries().updateTranscriptionSessionStatus.run('error', Date.now(), code, sessionId);
    } catch {
      /* ignore */
    }
    if (s) {
      s.phase = 'error';
      s.error = code;
      store.stopTimers(s);
      store.broadcastState(s);
      store.sessions.delete(sessionId);
    } else {
      store.broadcastIdle();
    }
    throw err;
  }
}

async function controlSession(deps, sessionId, action) {
  switch (action) {
    case 'pause':
      pauseSession(deps, sessionId);
      return {};
    case 'resume':
      resumeSession(deps, sessionId);
      return {};
    case 'cancel':
      cancelSession(deps, sessionId);
      return {};
    case 'stop':
      return stopSession(deps, sessionId);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

module.exports = {
  setWindowManager: store.setWindowManager,
  getActiveState: store.getActiveState,
  startSession,
  appendChunk,
  appendAudio,
  controlSession,
  finalizeSession,
};
