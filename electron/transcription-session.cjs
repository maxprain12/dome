/* eslint-disable no-console */
/**
 * Transcription Session Engine — main process.
 *
 * Single unified pipeline that replaces the legacy
 * Dictation/Call/Streaming split. One session model with pluggable sources
 * (mic, system, both) and an optional live preview. Persists chunks to
 * SQLite as they're recorded so a crash never drops audio.
 *
 * Public API:
 *   startSession(deps, opts) -> { sessionId }
 *   appendChunk(deps, payload) -> { partialText? }
 *   controlSession(deps, sessionId, action) -> { resourceId? }   // pause|resume|cancel|stop
 *   getActive() -> { ... }
 *
 * deps shape: { database, fileStorage, windowManager, thumbnail, initModule, ollamaService }
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** NDJSON debug (duration pipeline) — safe to delete after diagnosis */
const AUDIO_DURATION_DEBUG_LOG = path.join(__dirname, '..', '.cursor', 'debug-audio-duration.log');
/** @param {Record<string, unknown>} payload */
function audioDurationDebugLog(payload) {
  try {
    fs.appendFileSync(
      AUDIO_DURATION_DEBUG_LOG,
      `${JSON.stringify({ t: Date.now(), ...payload })}\n`,
    );
  } catch { /* ignore */ }
}

const transcriptionService = require('./transcription-service.cjs');
const semanticIndexScheduler = require('./semantic-index-scheduler.cjs');

// ---------------------------------------------------------------------------
// In-memory state (volatile mirror of transcription_sessions rows)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ActiveSession
 * @property {string} id
 * @property {string} projectId
 * @property {string|null} folderId
 * @property {Array<'mic'|'system'>} sources
 * @property {boolean} livePreview
 * @property {boolean} saveAudio
 * @property {string} sessionDir
 * @property {'recording'|'paused'|'transcribing'|'error'} phase
 * @property {number} startedAt
 * @property {number} pausedElapsedMs
 * @property {number|null} pausedAt
 * @property {string} partialText
 * @property {NodeJS.Timeout|null} ticker
 * @property {string|null} error
 */

/** @type {Map<string, ActiveSession>} */
const sessions = new Map();

let _windowManager = null;

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function safeUnlink(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
}

function safeRmdir(dir) {
  try { if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {
    console.warn('[TranscriptionSession] cleanup dir:', e?.message);
  }
}

function parseMetadata(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function deriveTitle(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return `Transcription — ${new Date().toLocaleString()}`;
  const slice = cleaned.slice(0, 60);
  return slice + (cleaned.length > 60 ? '…' : '');
}

function elapsedSeconds(s) {
  if (!s) return 0;
  if (s.phase === 'paused' && s.pausedAt) {
    return Math.floor((s.pausedAt - s.startedAt - s.pausedElapsedMs) / 1000);
  }
  return Math.floor((Date.now() - s.startedAt - s.pausedElapsedMs) / 1000);
}

function broadcastState(s) {
  if (!_windowManager) return;
  _windowManager.broadcast('transcription:state', {
    sessionId: s ? s.id : null,
    phase: s ? s.phase : 'idle',
    sources: s ? s.sources : [],
    seconds: s ? elapsedSeconds(s) : 0,
    livePreview: s ? s.livePreview : false,
    partialText: s ? s.partialText : '',
    error: s ? s.error : null,
  });
}

function broadcastIdle() {
  if (!_windowManager) return;
  _windowManager.broadcast('transcription:state', {
    sessionId: null,
    phase: 'idle',
    sources: [],
    seconds: 0,
    livePreview: false,
    partialText: '',
    error: null,
  });
}

function startTicker(s) {
  if (s.ticker) return;
  s.ticker = setInterval(() => {
    if (s.phase === 'recording') broadcastState(s);
  }, 1000);
}

function stopTicker(s) {
  if (s.ticker) {
    clearInterval(s.ticker);
    s.ticker = null;
  }
}

// ---------------------------------------------------------------------------
// ffmpeg helpers
// ---------------------------------------------------------------------------

function loadFluentFfmpeg() {
  try {
    const fluent = require('fluent-ffmpeg');
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    const ffmpegPath = ffmpegInstaller.path;
    fluent.setFfmpegPath(ffmpegPath);
    try {
      const dir = path.dirname(ffmpegPath);
      const base = path.basename(ffmpegPath).replace(/^ffmpeg/i, 'ffprobe');
      const probeGuess = path.join(dir, base);
      if (fs.existsSync(probeGuess)) {
        fluent.setFfprobePath(probeGuess);
      }
    } catch { /* ignore missing ffprobe */ }
    return fluent;
  } catch (e) {
    console.warn('[TranscriptionSession] ffmpeg unavailable:', e?.message);
    return null;
  }
}

/**
 * MediaRecorder WebM chunks: usually only chunk 0 is a full container; the rest are
 * bitstream continuations. The concat *demuxer* often decodes ~one segment (~few seconds).
 * Fix: raw byte-cat into one .webm, then decode once; if that still looks too small,
 * try per-file decode + concat filter (some Electron builds emit self-contained slices).
 *
 * @param {Record<string, unknown>} [debugCtx]
 */
function concatFilesToMp3(sortedFiles, outputMp3, debugCtx) {
  const ff = loadFluentFfmpeg();
  if (!ff || !sortedFiles.length) return Promise.reject(new Error('ffmpeg or files missing'));
  const existing = sortedFiles.filter((p) => p && fs.existsSync(p));
  if (!existing.length) return Promise.reject(new Error('No input files'));

  let webmSum = 0;
  for (const p of existing) {
    try { webmSum += fs.statSync(p).size; } catch { /* ignore */ }
  }

  function outputMp3TooSmallForInputs() {
    if (existing.length < 2 || webmSum < 40000) return false;
    try {
      const sz = fs.statSync(outputMp3).size;
      return sz < webmSum * 0.045;
    } catch {
      return true;
    }
  }

  function logConcat(strategy) {
    if (!debugCtx) return;
    try {
      const st = fs.statSync(outputMp3);
      audioDurationDebugLog({
        hypothesisId: 'AUD',
        step: 'concatMp3',
        strategy,
        outBytes: st.size,
        webmSum,
        nFiles: existing.length,
        ...debugCtx,
      });
    } catch { /* ignore */ }
  }

  if (existing.length === 1) {
    return new Promise((resolve, reject) => {
      ff(existing[0])
        .audioCodec('libmp3lame')
        .audioFrequency(16000)
        .audioBitrate('64k')
        .on('end', () => { logConcat('single'); resolve(); })
        .on('error', reject)
        .save(outputMp3);
    });
  }

  const combinedWebm = `${outputMp3}.combined.webm`;

  const runByteCat = () => new Promise((resolve, reject) => {
    safeUnlink(combinedWebm);
    try {
      const fd = fs.openSync(combinedWebm, 'w');
      try {
        for (const p of existing) {
          fs.writeSync(fd, fs.readFileSync(p));
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch (e) {
      safeUnlink(combinedWebm);
      reject(e);
      return;
    }
    ff(combinedWebm)
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioBitrate('64k')
      .on('end', () => {
        safeUnlink(combinedWebm);
        if (outputMp3TooSmallForInputs()) {
          safeUnlink(outputMp3);
          reject(new Error('byteCat MP3 too small vs WebM input'));
          return;
        }
        logConcat('byteCat');
        resolve();
      })
      .on('error', (err) => {
        safeUnlink(combinedWebm);
        reject(err);
      })
      .save(outputMp3);
  });

  const runFilterConcat = () => new Promise((resolve, reject) => {
    let cmd = ff();
    for (const p of existing) {
      cmd = cmd.input(p);
    }
    const labels = existing.map((_, i) => `[${i}:a]`).join('');
    const filterComplex = `${labels}concat=n=${existing.length}:v=0:a=1[aout]`;
    cmd
      .complexFilter([filterComplex])
      .outputOptions(['-map', '[aout]'])
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioBitrate('64k')
      .on('end', () => {
        if (outputMp3TooSmallForInputs()) {
          safeUnlink(outputMp3);
          reject(new Error('filter concat MP3 too small'));
          return;
        }
        logConcat('filter');
        resolve();
      })
      .on('error', reject)
      .save(outputMp3);
  });

  const runDemuxer = () => {
    const lines = existing.map((p) => `file '${p.replace(/'/g, "'\\''")}'`);
    const listPath = `${outputMp3}.concat.txt`;
    fs.writeFileSync(listPath, lines.join('\n'));
    return new Promise((resolve, reject) => {
      ff()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('libmp3lame')
        .audioFrequency(16000)
        .audioBitrate('64k')
        .on('end', () => {
          safeUnlink(listPath);
          if (outputMp3TooSmallForInputs()) {
            safeUnlink(outputMp3);
            reject(new Error('All WebM concat strategies produced a short MP3'));
            return;
          }
          logConcat('demuxer');
          resolve();
        })
        .on('error', (err) => {
          safeUnlink(listPath);
          reject(err);
        })
        .save(outputMp3);
    });
  };

  safeUnlink(outputMp3);
  return runByteCat()
    .catch(() => {
      safeUnlink(outputMp3);
      return runFilterConcat();
    })
    .catch(() => {
      safeUnlink(outputMp3);
      return runDemuxer();
    });
}

function mixTwoMp3sToMp3(micMp3, sysMp3, outputMp3) {
  const ff = loadFluentFfmpeg();
  if (!ff) return Promise.reject(new Error('ffmpeg unavailable'));
  return new Promise((resolve, reject) => {
    ff()
      .input(micMp3)
      .input(sysMp3)
      .complexFilter(['[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2[a]'])
      .outputOptions(['-map', '[a]'])
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioBitrate('64k')
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputMp3);
  });
}

/**
 * @param {string} filePath
 * @returns {Promise<number|null>} duration in seconds
 */
function probeFormatDurationSec(filePath) {
  const ff = loadFluentFfmpeg();
  if (!ff || !filePath || !fs.existsSync(filePath)) return Promise.resolve(null);
  return new Promise((resolve) => {
    ff.ffprobe(filePath, (err, metadata) => {
      if (err || metadata?.format?.duration == null) {
        resolve(null);
        return;
      }
      const d = Number(metadata.format.duration);
      resolve(Number.isFinite(d) && d > 0 ? d : null);
    });
  });
}

/** @param {Array<{ file_path?: string }>} chunks */
function sumChunkBytesOnDisk(chunks) {
  let n = 0;
  for (const c of chunks) {
    const p = c?.file_path;
    if (!p) continue;
    try {
      n += fs.statSync(p).size;
    } catch { /* ignore */ }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

function getSessionsRoot() {
  return path.join(app.getPath('userData'), 'transcription-sessions');
}

function ensureSessionsRoot() {
  const root = getSessionsRoot();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

/**
 * @param {Object} deps
 * @param {{ projectId?: string, folderId?: string|null, sources: Array<'mic'|'system'>, livePreview?: boolean, saveAudio?: boolean }} opts
 */
function startSession(deps, opts) {
  if (!opts || !Array.isArray(opts.sources) || opts.sources.length === 0) {
    throw new Error('sources is required (mic and/or system)');
  }
  const sources = opts.sources.filter((s) => s === 'mic' || s === 'system');
  if (sources.length === 0) throw new Error('Invalid sources');

  const projectId = opts.projectId || 'default';
  const folderId = opts.folderId != null && opts.folderId !== '' ? String(opts.folderId) : null;
  const queries = deps.database.getQueries();
  if (!queries.getProjectById.get(projectId)) {
    throw new Error('Project not found');
  }

  const id = genId('ts');
  const sessionDir = path.join(ensureSessionsRoot(), id);
  fs.mkdirSync(sessionDir, { recursive: true });

  const now = Date.now();
  queries.insertTranscriptionSession.run(
    id,
    projectId,
    folderId,
    'recording',
    JSON.stringify(sources),
    opts.livePreview ? 1 : 0,
    opts.saveAudio !== false ? 1 : 0,
    sessionDir,
    now,
    now,
  );

  const session = {
    id,
    projectId,
    folderId,
    sources,
    livePreview: Boolean(opts.livePreview),
    saveAudio: opts.saveAudio !== false,
    sessionDir,
    phase: 'recording',
    startedAt: now,
    pausedElapsedMs: 0,
    pausedAt: null,
    partialText: '',
    ticker: null,
    error: null,
  };
  sessions.set(id, session);
  startTicker(session);
  broadcastState(session);

  return { sessionId: id };
}

/**
 * Persist a chunk to disk + DB. If livePreview is enabled, kick off async STT
 * for the chunk and append to partialText.
 */
async function appendChunk(deps, payload) {
  const { sessionId, track, seq, startMs, buffer, extension } = payload;
  if (!sessionId || (track !== 'mic' && track !== 'system')) {
    throw new Error('Invalid chunk payload');
  }
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  if (session.phase === 'transcribing' || session.phase === 'error') {
    // Drop late chunks once we've started finalization.
    return { partialText: undefined };
  }

  const buf = Buffer.from(buffer instanceof ArrayBuffer ? buffer : (buffer.buffer || buffer));
  const ext = (extension || 'webm').replace(/^\./, '') || 'webm';
  const filePath = path.join(session.sessionDir, `${track}-${String(seq).padStart(6, '0')}.${ext}`);
  fs.writeFileSync(filePath, buf);

  const queries = deps.database.getQueries();
  queries.insertTranscriptionChunk.run(sessionId, Number(seq), track, Number(startMs) || 0, null, filePath, null);

  // Live preview: transcribe this chunk now (best-effort, non-fatal)
  if (session.livePreview) {
    void transcribeChunkBestEffort(deps, session, { track, seq: Number(seq), filePath });
  }

  return { partialText: undefined };
}

async function transcribeChunkBestEffort(deps, session, chunk) {
  try {
    const apiKey = transcriptionService.getTranscriptionApiKey(deps.database);
    if (!apiKey) return;

    // MediaRecorder streaming WebM chunks are NOT valid standalone files — only chunk 0
    // carries the EBML header; subsequent chunks are raw cluster data that ffmpeg rejects.
    // Solution: concatenate all saved chunks for this track (ffmpeg's concat demuxer reads
    // the first file's header and treats the rest as continuation clusters).
    const queries = deps.database.getQueries();
    const savedFiles = queries.listSessionChunks.all(session.id)
      .filter((c) => c.track === chunk.track && c.file_path && fs.existsSync(c.file_path))
      .sort((a, b) => a.seq - b.seq)
      .map((c) => c.file_path);
    if (!savedFiles.length) return;

    const tempMp3 = path.join(session.sessionDir, `_partial-${chunk.track}-${chunk.seq}.mp3`);
    try {
      await concatFilesToMp3(savedFiles, tempMp3, {
        sessionId: session.id,
        track: chunk.track,
        partial: true,
      });
    } catch (concatErr) {
      console.warn('[TranscriptionSession] partial concat failed:', concatErr?.message);
      return;
    }

    let text = '';
    try {
      const out = await transcriptionService.transcribeFilePath(tempMp3, {
        apiKey,
        database: deps.database,
        captureSources: session.sources,
      });
      text = String(out.text || '').trim();
    } finally {
      safeUnlink(tempMp3);
    }

    if (!text) return;

    // Do not broadcast after finalizeSession removed this session — async partial
    // STT can finish later and would otherwise send a stale "transcribing" payload
    // after broadcastIdle().
    if (sessions.get(session.id) !== session) {
      return;
    }

    // Replace the whole partial text with the full running transcript so far.
    // finalizeSession will always do its own full STT pass on the merged file.
    session.partialText = text;
    queries.appendTranscriptionPartial.run(text, Date.now(), session.id);
    broadcastState(session);
  } catch (err) {
    console.warn('[TranscriptionSession] partial STT failed:', err?.message);
  }
}

function pauseSession(deps, sessionId) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Session not active');
  if (s.phase !== 'recording') return;
  s.phase = 'paused';
  s.pausedAt = Date.now();
  const now = Date.now();
  deps.database.getQueries().updateTranscriptionSessionStatus.run('paused', now, null, sessionId);
  broadcastState(s);
}

function resumeSession(deps, sessionId) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Session not active');
  if (s.phase !== 'paused') return;
  if (s.pausedAt) {
    s.pausedElapsedMs += Date.now() - s.pausedAt;
    s.pausedAt = null;
  }
  s.phase = 'recording';
  const now = Date.now();
  deps.database.getQueries().updateTranscriptionSessionStatus.run('recording', now, null, sessionId);
  broadcastState(s);
}

function cancelSession(deps, sessionId) {
  const s = sessions.get(sessionId);
  if (!s) {
    // Session might have already been removed; still mark cancelled in DB.
    const now = Date.now();
    try { deps.database.getQueries().updateTranscriptionSessionStatus.run('cancelled', now, null, sessionId); } catch { /* */ }
    broadcastIdle();
    return;
  }
  stopTicker(s);
  sessions.delete(sessionId);
  safeRmdir(s.sessionDir);
  const now = Date.now();
  deps.database.getQueries().updateTranscriptionSessionStatus.run('cancelled', now, null, sessionId);
  broadcastIdle();
}

/**
 * Finalize a session: concat → mix → STT (if needed) → resource creation.
 * Returns { resourceId, plainText, durationMs } on success.
 */
async function finalizeSession(deps, sessionId) {
  const queries = deps.database.getQueries();
  const row = queries.getTranscriptionSession.get(sessionId);
  if (!row) throw new Error('Session not found');

  const sources = (() => {
    try { return JSON.parse(row.sources || '[]'); } catch { return []; }
  })();
  const sessionDir = row.session_dir;
  const livePreviewEnabled = Boolean(row.live_preview);

  // Switch to transcribing phase
  const memSession = sessions.get(sessionId);
  if (memSession) {
    memSession.phase = 'transcribing';
    stopTicker(memSession);
    broadcastState(memSession);
  }
  queries.updateTranscriptionSessionStatus.run('transcribing', Date.now(), null, sessionId);

  // Bucket chunks by track
  const allChunks = queries.listSessionChunks.all(sessionId);
  /** @type {Record<string, Array<any>>} */
  const byTrack = { mic: [], system: [] };
  for (const c of allChunks) {
    if (c.track === 'mic' || c.track === 'system') byTrack[c.track].push(c);
  }
  byTrack.mic.sort((a, b) => a.seq - b.seq);
  byTrack.system.sort((a, b) => a.seq - b.seq);

  if (allChunks.length === 0) {
    throw new Error('No audio chunks recorded');
  }

  // 1) Per-track concat to MP3
  const trackMp3s = {};
  for (const track of ['mic', 'system']) {
    const chunks = byTrack[track];
    if (!chunks.length) continue;
    const outMp3 = path.join(sessionDir, `${track}.mp3`);
    await concatFilesToMp3(chunks.map((c) => c.file_path), outMp3, { sessionId, track });
    trackMp3s[track] = outMp3;
  }

  // 2) Mix if both, else single
  let mergedMp3;
  if (trackMp3s.mic && trackMp3s.system) {
    const micDurPre = await probeFormatDurationSec(trackMp3s.mic);
    const sysDurPre = await probeFormatDurationSec(trackMp3s.system);
    audioDurationDebugLog({
      hypothesisId: 'AUD',
      step: 'preMix',
      sessionId,
      micChunks: byTrack.mic.length,
      sysChunks: byTrack.system.length,
      micWebmBytes: sumChunkBytesOnDisk(byTrack.mic),
      sysWebmBytes: sumChunkBytesOnDisk(byTrack.system),
      micMp3Bytes: fs.existsSync(trackMp3s.mic) ? fs.statSync(trackMp3s.mic).size : null,
      sysMp3Bytes: fs.existsSync(trackMp3s.system) ? fs.statSync(trackMp3s.system).size : null,
      micDurPre,
      sysDurPre,
    });

    mergedMp3 = path.join(sessionDir, 'merged.mp3');
    await mixTwoMp3sToMp3(trackMp3s.mic, trackMp3s.system, mergedMp3);

    const mergedDurAfterMix = await probeFormatDurationSec(mergedMp3);
    audioDurationDebugLog({
      hypothesisId: 'AUD',
      step: 'postMix',
      sessionId,
      mergedDurAfterMix,
      mergedBytes: fs.existsSync(mergedMp3) ? fs.statSync(mergedMp3).size : null,
    });

    // loopback/system WebM can decode to a tiny MP3 (~few seconds). In some cases amix
    // still yields a merged file far shorter than mic; keep the full mic take instead.
    if (micDurPre != null && mergedDurAfterMix != null
      && micDurPre >= 4
      && mergedDurAfterMix < micDurPre * 0.85) {
      audioDurationDebugLog({
        hypothesisId: 'AUD',
        step: 'fallbackMicOnly',
        sessionId,
        micDurPre,
        mergedDurAfterMix,
      });
      mergedMp3 = trackMp3s.mic;
    } else {
      try {
        const mSz = fs.statSync(trackMp3s.mic).size;
        const meSz = fs.statSync(mergedMp3).size;
        if (mSz > 12000 && meSz > 0 && meSz < mSz * 0.25) {
          audioDurationDebugLog({
            hypothesisId: 'AUD',
            step: 'fallbackMicOnlyBySize',
            sessionId,
            mSz,
            meSz,
            micDurPre,
            mergedDurAfterMix,
          });
          mergedMp3 = trackMp3s.mic;
        }
      } catch { /* ignore */ }
    }
  } else {
    mergedMp3 = trackMp3s.mic || trackMp3s.system;
  }
  if (!mergedMp3 || !fs.existsSync(mergedMp3)) {
    throw new Error('ffmpeg merge produced no output');
  }

  // 3) Final transcript
  let plainText = '';
  let structured = null;
  if (livePreviewEnabled && allChunks.some((c) => c.text && c.text.trim())) {
    // Already transcribed chunk-by-chunk — assemble from DB rows.
    plainText = allChunks
      .filter((c) => c.text && c.text.trim())
      .sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0))
      .map((c) => c.text.trim())
      .join(' ');
  } else {
    const apiKey = transcriptionService.getTranscriptionApiKey(deps.database);
    if (!apiKey) throw new Error('STT API key not configured');
    const out = await transcriptionService.transcribeFilePath(mergedMp3, {
      apiKey,
      database: deps.database,
      captureSources: sources.filter((s) => s === 'mic' || s === 'system'),
    });
    plainText = String(out.text || '').trim();
    structured = out.structured || null;
  }

  if (!plainText) {
    throw new Error('Transcription produced empty text');
  }

  // 4) Create the audio resource (only persistent artifact)
  const now = Date.now();
  const resourceId = genId('res');
  const title = deriveTitle(plainText);

  const importResult = await deps.fileStorage.importFile(mergedMp3, 'audio');
  const dup = queries.findByHash.get(importResult.hash);
  let finalResourceId = resourceId;
  let finalInternalPath = importResult.internalPath;
  let finalMimeType = importResult.mimeType;
  let finalSize = importResult.size;
  let finalHash = importResult.hash;
  let finalOriginalName = importResult.originalName;
  let createdNewResource = false;

  const mergedDurationSec = await probeFormatDurationSec(mergedMp3);
  const durationMsFromFile = mergedDurationSec != null && mergedDurationSec > 0
    ? Math.round(mergedDurationSec * 1000)
    : null;
  audioDurationDebugLog({
    hypothesisId: 'AUD',
    step: 'import',
    sessionId,
    mergedDurationSec,
    durationMsFromFile,
    importSize: importResult.size,
  });

  const baseMetadata = {
    kind: 'transcription',
    sources,
    transcription: plainText,
    transcription_structured: structured,
    duration_ms: durationMsFromFile != null
      ? durationMsFromFile
      : (row.finished_at ? row.finished_at - row.started_at : Date.now() - row.started_at),
    transcribed_at: now,
    session_id: sessionId,
  };

  if (dup) {
    finalResourceId = dup.id;
    const existing = queries.getResourceById.get(dup.id);
    const existingMeta = parseMetadata(existing?.metadata);
    const mergedMeta = { ...existingMeta, ...baseMetadata };
    queries.updateResource.run(existing.title || title, existing.content || null, JSON.stringify(mergedMeta), now, dup.id);
    _windowManager?.broadcast('resource:updated', { id: dup.id, metadata: mergedMeta });
  } else {
    const thumb = deps.thumbnail
      ? await deps.thumbnail
          .generateThumbnail(deps.fileStorage.getFullPath(finalInternalPath), 'audio', finalMimeType)
          .catch(() => null)
      : null;
    queries.createResourceWithFile.run(
      finalResourceId,
      row.project_id,
      'audio',
      title,
      null,
      null,
      finalInternalPath,
      finalMimeType,
      finalSize,
      finalHash,
      thumb,
      finalOriginalName,
      JSON.stringify(baseMetadata),
      now,
      now,
    );
    createdNewResource = true;
    if (row.folder_id) {
      try { queries.moveResourceToFolder.run(row.folder_id, now, finalResourceId); } catch { /* */ }
    }
    const created = queries.getResourceById.get(finalResourceId);
    if (created) _windowManager?.broadcast('resource:created', created);
    try {
      semanticIndexScheduler.init(deps.database);
      if (semanticIndexScheduler.shouldIndex(created)) {
        semanticIndexScheduler.scheduleSemanticReindex(finalResourceId);
      }
    } catch (e) {
      console.warn('[TranscriptionSession] semantic index schedule:', e?.message);
    }
  }

  // 5) Mark DB session done
  queries.finalizeTranscriptionSession.run(finalResourceId, now, now, sessionId);

  // 6) Cleanup staging dir
  safeRmdir(sessionDir);

  // 7) Drop in-memory session and broadcast idle
  if (memSession) {
    stopTicker(memSession);
    sessions.delete(sessionId);
  }
  broadcastIdle();

  return {
    resourceId: finalResourceId,
    plainText,
    durationMs: baseMetadata.duration_ms,
    createdNewResource,
  };
}

async function stopSession(deps, sessionId) {
  try {
    const result = await finalizeSession(deps, sessionId);
    return { resourceId: result.resourceId };
  } catch (err) {
    console.error('[TranscriptionSession] stop failed:', err);
    const now = Date.now();
    try {
      deps.database.getQueries().updateTranscriptionSessionStatus.run('error', now, String(err.message || err), sessionId);
    } catch { /* */ }
    const memSession = sessions.get(sessionId);
    if (memSession) {
      memSession.phase = 'error';
      memSession.error = String(err.message || err);
      stopTicker(memSession);
      broadcastState(memSession);
      sessions.delete(sessionId);
    } else {
      broadcastIdle();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function setWindowManager(wm) {
  _windowManager = wm;
}

function getActiveState() {
  // Most recent active session (we only support one at a time in v1)
  const list = Array.from(sessions.values());
  if (!list.length) {
    return { sessionId: null, phase: 'idle', sources: [], seconds: 0, livePreview: false, partialText: '', error: null };
  }
  const s = list[list.length - 1];
  return {
    sessionId: s.id,
    phase: s.phase,
    sources: s.sources,
    seconds: elapsedSeconds(s),
    livePreview: s.livePreview,
    partialText: s.partialText,
    error: s.error,
  };
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
  setWindowManager,
  startSession,
  appendChunk,
  controlSession,
  pauseSession,
  resumeSession,
  cancelSession,
  stopSession,
  finalizeSession,
  getActiveState,
  // Internal helpers exported for the recovery module
  _internal: { broadcastIdle, sessions },
};
