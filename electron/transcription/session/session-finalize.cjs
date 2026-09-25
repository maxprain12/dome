'use strict';

/**
 * Finalize a session: merge audio → final batch STT → audio resource.
 * Shared by `stop` and crash recovery.
 */

const fs = require('node:fs');
const batchStt = require('../stt/batch-stt.cjs');
const { TranscriptionError } = require('../errors.cjs');
const { deriveTitle } = require('../resource-text.cjs');
const store = require('./session-store.cjs');
const { mergeSessionAudio, probeFormatDurationSec } = require('./session-audio.cjs');

function safeRmdir(dir) {
  try {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.warn('[TranscriptionSession] cleanup dir:', e?.message);
  }
}

function parseSources(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((s) => s === 'mic' || s === 'system') : [];
  } catch {
    return [];
  }
}

function chunksByTrack(queries, sessionId) {
  const byTrack = { mic: [], system: [] };
  for (const c of queries.listSessionChunks.all(sessionId)) {
    if (c.track === 'mic' || c.track === 'system') byTrack[c.track].push(c);
  }
  byTrack.mic.sort((a, b) => a.seq - b.seq);
  byTrack.system.sort((a, b) => a.seq - b.seq);
  return byTrack;
}

/**
 * Batch pass first; if it fails but live text exists (realtime), keep that
 * text rather than losing the recording.
 */
async function transcribeMerged(deps, mergedMp3, sources, liveText) {
  try {
    const out = await batchStt.transcribeFilePath(mergedMp3, { database: deps.database, captureSources: sources });
    const text = String(out.text || '').trim();
    if (text) return { text, structured: out.structured || null };
  } catch (err) {
    if (!liveText) throw err;
    console.warn('[TranscriptionSession] final STT failed, keeping live text:', err?.detail || err?.message);
  }
  if (liveText) return { text: liveText, structured: null };
  throw new TranscriptionError('transcription_failed', 'empty transcript');
}

async function importAudioResource(deps, row, mergedMp3, title) {
  const importer = require('../../storage/resource-import.cjs').createResourceImporter({
    database: deps.database,
    fileStorage: deps.fileStorage,
    thumbnail: deps.thumbnail,
    windowManager: store.getWindowManager() || undefined,
  });
  const imported = await importer.importFile(mergedMp3, {
    projectId: row.project_id || 'default',
    folderId: row.folder_id,
    title,
    type: 'audio',
  });
  if (!imported.success) throw new Error(imported.error);
  return imported.data.id;
}

/**
 * @param {object} deps { database, fileStorage, thumbnail }
 * @param {string} sessionId
 * @param {{ liveText?: string }} [opts]
 * @returns {Promise<{ resourceId: string, plainText: string, durationMs: number }>}
 */
async function finalizeSession(deps, sessionId, opts = {}) {
  const queries = deps.database.getQueries();
  const row = queries.getTranscriptionSession.get(sessionId);
  if (!row) throw new TranscriptionError('session_not_found');

  const memSession = store.sessions.get(sessionId);
  if (memSession) {
    memSession.phase = 'transcribing';
    store.stopTimers(memSession);
    store.broadcastState(memSession);
  }
  queries.updateTranscriptionSessionStatus.run('transcribing', Date.now(), null, sessionId);

  const byTrack = chunksByTrack(queries, sessionId);
  if (byTrack.mic.length + byTrack.system.length === 0) {
    throw new TranscriptionError('transcription_failed', 'no audio chunks recorded');
  }

  const sources = parseSources(row.sources);
  const mergedMp3 = await mergeSessionAudio(row.session_dir, byTrack);
  const liveText = String(opts.liveText || row.partial_text || '').trim();
  const { text: plainText, structured } = await transcribeMerged(deps, mergedMp3, sources, liveText);

  const now = Date.now();
  const title = deriveTitle(plainText);
  const durationSec = await probeFormatDurationSec(mergedMp3);
  const metadata = {
    kind: 'transcription',
    sources,
    transcription: plainText,
    transcription_structured: structured,
    duration_ms: durationSec ? Math.round(durationSec * 1000) : (row.finished_at || now) - row.started_at,
    transcribed_at: now,
    session_id: sessionId,
  };

  const resourceId = await importAudioResource(deps, row, mergedMp3, title);
  queries.updateResource.run(title, plainText, JSON.stringify(metadata), now, resourceId);
  store.getWindowManager()?.broadcast('resource:updated', {
    id: resourceId,
    updates: { content: plainText, metadata },
  });

  queries.finalizeTranscriptionSession.run(resourceId, now, now, sessionId);
  safeRmdir(row.session_dir);

  if (memSession) {
    store.stopTimers(memSession);
    store.sessions.delete(sessionId);
  }
  store.broadcastIdle();

  return { resourceId, plainText, durationMs: metadata.duration_ms };
}

module.exports = { finalizeSession, safeRmdir };
