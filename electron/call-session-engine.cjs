/* eslint-disable no-console */
/**
 * Long-call transcription: chunked dual-track (mic + system) STT, merge, note + optional audio + summary.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const transcriptionService = require('./transcription-service.cjs');
const transcriptionStructured = require('./transcription-structured.cjs');
const semanticIndexScheduler = require('./semantic-index-scheduler.cjs');
const { getOpenAIKey } = require('./openai-key.cjs');
const aiCloudService = require('./ai-cloud-service.cjs');

/** @typedef {{ id: string, projectId: string, folderId: string|null, callPlatform: string, saveRecordingAsAudio: boolean, sessionDir: string, startedAt: number, allSegments: Array<Object>, speakers: Record<string, { label: string, isSelf?: boolean }>, micFiles: Array<{ seq: number, filePath: string }>, sysFiles: Array<{ seq: number, filePath: string }>, paused: boolean }} CallSession */

/** @type {Map<string, CallSession>} */
const sessions = new Map();

function generateResourceId() {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function parseMetadata(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function newSegId() {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function deriveNoteTitle(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return `Llamada — ${new Date().toLocaleString()}`;
  }
  const slice = cleaned.slice(0, 60);
  return slice + (cleaned.length > 60 ? '…' : '');
}

function getPauseThreshold(database) {
  try {
    const row = database.getQueries().getSetting.get('transcription_pause_threshold_sec');
    const num = parseFloat(String(row?.value || ''));
    return Number.isFinite(num) && num >= 0.4 && num <= 8 ? num : 1.35;
  } catch {
    return 1.35;
  }
}

function getCallSummaryModel(database) {
  try {
    const row = database.getQueries().getSetting.get('transcription_call_summary_model');
    const m = row?.value && String(row.value).trim();
    return m || 'gpt-4o-mini';
  } catch {
    return 'gpt-4o-mini';
  }
}

function getCallAutoSummaryEnabled(database) {
  try {
    const row = database.getQueries().getSetting.get('transcription_call_auto_summary');
    const v = row?.value != null ? String(row.value).trim() : '';
    if (v === '0' || v === 'false' || v === 'off') return false;
    return true;
  } catch {
    return true;
  }
}

function getSttOpts(database) {
  const queries = database.getQueries();
  const providerRow = queries.getSetting.get('transcription_stt_provider');
  let sttProvider = providerRow?.value && String(providerRow.value).trim().toLowerCase();
  if (sttProvider === 'local-gemma') sttProvider = 'openai';
  if (sttProvider !== 'groq' && sttProvider !== 'openai' && sttProvider !== 'custom') {
    sttProvider = transcriptionService.getTranscriptionSttProvider(database);
  }
  const modelRow = queries.getSetting.get('transcription_model');
  const langRow = queries.getSetting.get('transcription_language');
  let model = modelRow?.value && String(modelRow.value).trim();
  if (!model) {
    model = sttProvider === 'groq' ? transcriptionService.DEFAULT_GROQ_MODEL : 'whisper-1';
  }
  const languageRaw = langRow?.value && String(langRow.value).trim();
  const language = languageRaw || null;
  return { model, language };
}

function safeRmdir(dir) {
  try {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('[CallSession] cleanup dir:', e?.message);
  }
}

/**
 * @param {string[]} sortedFiles absolute paths
 * @param {string} outputMp3
 */
function concatFilesToMp3(sortedFiles, outputMp3) {
  const ff = (() => {
    try {
      const fluent = require('fluent-ffmpeg');
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      fluent.setFfmpegPath(ffmpegInstaller.path);
      return fluent;
    } catch (e) {
      console.warn('[CallSession] ffmpeg:', e?.message);
      return null;
    }
  })();
  if (!ff || !sortedFiles.length) return Promise.reject(new Error('ffmpeg or files missing'));

  const listPath = `${outputMp3}.concat.txt`;
  const lines = sortedFiles
    .filter((p) => p && fs.existsSync(p))
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`);
  if (!lines.length) return Promise.reject(new Error('No input files'));
  fs.writeFileSync(listPath, lines.join('\n'));

  return new Promise((resolve, reject) => {
    ff()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioBitrate('64k')
      .on('end', () => {
        try {
          fs.unlinkSync(listPath);
        } catch (_) {
          /* */
        }
        resolve();
      })
      .on('error', (err) => {
        try {
          fs.unlinkSync(listPath);
        } catch (_) {
          /* */
        }
        reject(err);
      })
      .save(outputMp3);
  });
}

/**
 * @param {Object} deps
 * @param {{ projectId: string, folderId?: string|null, callPlatform?: string, saveRecordingAsAudio?: boolean }} opts
 */
function startSession(deps, opts) {
  const projectId = opts.projectId || 'default';
  const folderId = opts.folderId != null && opts.folderId !== '' ? opts.folderId : null;
  const queries = deps.database.getQueries();
  const projectExists = queries.getProjectById.get(projectId);
  if (!projectExists) {
    throw new Error('Project not found');
  }
  if (folderId) {
    const folder = queries.getResourceById.get(folderId);
    if (!folder || folder.type !== 'folder') {
      throw new Error('Invalid folder_id');
    }
  }

  const id = `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const sessionDir = path.join(app.getPath('temp'), 'dome-call', id);
  fs.mkdirSync(sessionDir, { recursive: true });

  /** @type {CallSession} */
  const session = {
    id,
    projectId,
    folderId,
    callPlatform: typeof opts.callPlatform === 'string' && opts.callPlatform.trim() ? opts.callPlatform.trim() : 'unknown',
    saveRecordingAsAudio: Boolean(opts.saveRecordingAsAudio),
    sessionDir,
    startedAt: Date.now(),
    allSegments: [],
    speakers: {
      self: { label: 'Yo', isSelf: true },
    },
    micFiles: [],
    sysFiles: [],
    paused: false,
  };
  sessions.set(id, session);
  return id;
}

/**
 * @param {Object} deps
 * @param {{ sessionId: string, track: 'mic'|'system', buffer: ArrayBuffer|Buffer, seq: number, startMs: number, extension?: string }} params
 */
async function appendChunk(deps, params) {
  const session = sessions.get(params.sessionId);
  if (!session) {
    return { success: false, error: 'Invalid session' };
  }

  const track = params.track === 'mic' ? 'mic' : 'system';
  const raw = params.buffer;
  if (!raw) {
    return { success: false, error: 'buffer is required' };
  }
  const buf = Buffer.from(raw instanceof ArrayBuffer ? raw : raw.buffer || raw);
  if (buf.length < 32) {
    return { success: true, skipped: true };
  }

  const seq = Number(params.seq) || 0;
  const ext = (params.extension || 'webm').replace(/^\./, '') || 'webm';
  const filePath = path.join(session.sessionDir, `${track}-${String(seq).padStart(6, '0')}.${ext}`);
  fs.writeFileSync(filePath, buf);

  if (track === 'mic') session.micFiles.push({ seq, filePath });
  else session.sysFiles.push({ seq, filePath });

  const apiKey = transcriptionService.getTranscriptionApiKey(deps.database);
  if (!apiKey) {
    const prov = transcriptionService.getTranscriptionSttProvider(deps.database);
    return {
      success: false,
      error:
        prov === 'groq'
          ? 'Configura tu clave de Groq para transcripción (Ajustes → Transcripción).'
          : 'Configure una clave de API para transcripción (Ajustes → Transcripción).',
    };
  }

  const { model, language } = getSttOpts(deps.database);
  const t0 = (Number(params.startMs) || 0) / 1000;

  try {
    const { text, structured } = await transcriptionService.transcribeFilePath(filePath, {
      apiKey,
      model,
      language,
      database: deps.database,
      pauseThresholdSec: getPauseThreshold(deps.database),
    });

    /** @type {Record<string, { label: string, isSelf?: boolean }>} */
    const extraSpeakers = {};
    /** @type {Array<Object>} */
    let newSegments = [];

    if (track === 'mic') {
      newSegments = (structured.segments || []).map((seg) => ({
        ...seg,
        id: newSegId(),
        speakerId: 'self',
        startTime: seg.startTime + t0,
        endTime: seg.endTime + t0,
        text: String(seg.text || '').trim(),
      }));
    } else {
      const baseSpeakers = structured.speakers || {};
      for (const [k, v] of Object.entries(baseSpeakers)) {
        const label = String(v?.label || k).replace(/^Persona\b/, 'Interlocutor');
        extraSpeakers[`remote-${k}`] = { label };
      }
      newSegments = (structured.segments || []).map((seg) => ({
        ...seg,
        id: newSegId(),
        speakerId: `remote-${seg.speakerId}`,
        startTime: seg.startTime + t0,
        endTime: seg.endTime + t0,
        text: String(seg.text || '').trim(),
      }));
    }

    Object.assign(session.speakers, extraSpeakers);
    session.allSegments.push(...newSegments);
    session.allSegments.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

    const plain = transcriptionStructured.segmentsToPlainText(session.allSegments);
    return { success: true, chunkText: text, plainText: plain };
  } catch (err) {
    console.error('[CallSession] appendChunk transcribe:', err);
    return { success: false, error: err.message };
  }
}

function getLive(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Invalid session' };
  }
  const plainText = transcriptionStructured.segmentsToPlainText(session.allSegments);
  const durationMs = Date.now() - session.startedAt;
  return {
    success: true,
    plainText,
    segmentCount: session.allSegments.length,
    durationMs,
    paused: session.paused,
  };
}

function setPaused(sessionId, paused) {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, error: 'Invalid session' };
  session.paused = Boolean(paused);
  return { success: true };
}

/**
 * @param {Object} deps
 * @param {string} sessionId
 */
async function stopSession(deps, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Invalid session' };
  }
  sessions.delete(sessionId);

  const queries = deps.database.getQueries();
  const { aiToolsHandler, windowManager, fileStorage, thumbnail, initModule, ollamaService } = deps;
  const indexerDeps = { database: deps.database, fileStorage, windowManager, initModule, ollamaService };

  const structuredPayload = {
    version: 1,
    segments: session.allSegments,
    speakers: session.speakers,
    diarization: 'heuristic',
    session: {
      captureKind: 'call',
      callPlatform: session.callPlatform,
      inferredAt: Date.now(),
    },
  };

  const md = transcriptionStructured.structuredToMarkdownForNote(session.allSegments, session.speakers);
  const plain = transcriptionStructured.segmentsToPlainText(session.allSegments);
  if (!plain.trim()) {
    safeRmdir(session.sessionDir);
    return { success: false, error: 'No transcribed content' };
  }

  const tipTap = aiToolsHandler.markdownToTipTapJSON(md || plain);
  const now = Date.now();
  const noteId = generateResourceId();
  const title = deriveNoteTitle(plain);

  const stt = getSttOpts(deps.database);
  const noteMeta = {
    source: 'call',
    source_media_type: undefined,
    transcription: plain,
    transcription_structured: structuredPayload,
    transcription_model: stt.model,
    transcription_language: stt.language || 'auto',
    transcribed_at: now,
    from_microphone: true,
    transcription_diarization: 'heuristic',
    call: {
      platform: session.callPlatform,
      duration_ms: now - session.startedAt,
      tracks: ['mic', 'system'],
      summary: '',
      action_items: [],
      decisions: [],
      participants: [
        { speakerId: 'self', label: 'Yo', isSelf: true },
        ...Object.entries(session.speakers)
          .filter(([k]) => k.startsWith('remote-'))
          .map(([speakerId, v]) => ({ speakerId, label: v.label, isSelf: false })),
      ],
    },
  };

  let audioResourceId = null;

  if (session.saveRecordingAsAudio) {
    try {
      session.sysFiles.sort((a, b) => a.seq - b.seq);
      session.micFiles.sort((a, b) => a.seq - b.seq);
      const preferSys = session.sysFiles.map((x) => x.filePath);
      const micPaths = session.micFiles.map((x) => x.filePath);
      const chosen = preferSys.length ? preferSys : micPaths;
      if (chosen.length) {
        const outMp3 = path.join(session.sessionDir, `call-${session.id}.mp3`);
        await concatFilesToMp3(chosen, outMp3);
        const importResult = await fileStorage.importFile(outMp3, 'audio');
        const dup = queries.findByHash.get(importResult.hash);
        if (dup) {
          audioResourceId = dup.id;
        } else {
          const audioId = generateResourceId();
          const thumb = thumbnail
            ? await thumbnail.generateThumbnail(
                fileStorage.getFullPath(importResult.internalPath),
                'audio',
                importResult.mimeType
              )
            : null;
          queries.createResourceWithFile.run(
            audioId,
            session.projectId,
            'audio',
            `Llamada ${new Date().toLocaleString()}`,
            null,
            null,
            importResult.internalPath,
            importResult.mimeType,
            importResult.size,
            importResult.hash,
            thumb,
            importResult.originalName,
            JSON.stringify({
              source: 'call_recording',
              capture_kind: 'call',
              call_platform: session.callPlatform,
              created_at: now,
            }),
            now,
            now
          );
          audioResourceId = audioId;
          const ar = queries.getResourceById.get(audioId);
          windowManager.broadcast('resource:created', ar);
          if (resourceIndexer.shouldIndex(ar)) {
            resourceIndexer.scheduleIndexing(audioId, indexerDeps);
          }
        }
        const ar = queries.getResourceById.get(audioResourceId);
        if (ar) {
          const meta = parseMetadata(ar.metadata);
          meta.transcription = plain;
          meta.transcription_structured = structuredPayload;
          meta.transcription_note_id = noteId;
          meta.transcription_model = noteMeta.transcription_model;
          meta.transcription_language = noteMeta.transcription_language;
          meta.transcribed_at = now;
          meta.processing_status = 'completed';
          queries.updateResource.run(ar.title, ar.content, JSON.stringify(meta), now, audioResourceId);
          windowManager.broadcast('resource:updated', { id: audioResourceId, metadata: meta });
        }
      }
    } catch (e) {
      console.warn('[CallSession] audio save failed:', e?.message);
    }
  }

  noteMeta.source_audio_id = audioResourceId || undefined;
  noteMeta.source_media_type = audioResourceId ? 'audio' : undefined;

  queries.createResource.run(
    noteId,
    session.projectId,
    'note',
    title,
    tipTap,
    null,
    session.folderId,
    JSON.stringify(noteMeta),
    now,
    now
  );
  const noteResource = queries.getResourceById.get(noteId);
  windowManager.broadcast('resource:created', noteResource);
  semanticIndexScheduler.init(deps.database);
  if (semanticIndexScheduler.shouldIndex(noteResource)) {
    semanticIndexScheduler.scheduleSemanticReindex(noteId);
  }

  safeRmdir(session.sessionDir);

  if (getCallAutoSummaryEnabled(deps.database)) {
    void runCallSummary(deps, noteId, plain).catch((err) => console.warn('[CallSession] summary:', err?.message));
  }

  return {
    success: true,
    note: noteResource,
    text: plain,
    structured: structuredPayload,
    audioResourceId,
  };
}

function cancelSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return { success: false, error: 'Invalid session' };
  }
  sessions.delete(sessionId);
  safeRmdir(session.sessionDir);
  return { success: true };
}

/**
 * @param {Object} deps
 * @param {string} noteId
 * @param {string} plainText
 */
async function runCallSummary(deps, noteId, plainText) {
  const apiKey = getOpenAIKey(deps.database);
  if (!apiKey || !plainText.trim()) return;

  const model = getCallSummaryModel(deps.database);
  const promptPath = path.join(__dirname, '..', 'prompts', 'calls', 'summary.md');
  let systemPrompt = 'Summarize the meeting transcript as JSON.';
  try {
    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, 'utf8');
    }
  } catch (_) {
    /* */
  }

  const content = await aiCloudService.chatOpenAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Transcripción:\n\n${plainText.slice(0, 120000)}` },
    ],
    apiKey,
    model,
    'https://api.openai.com',
    120000
  );

  let summary = content.trim();
  /** @type {string[]} */
  let action_items = [];
  /** @type {string[]} */
  let decisions = [];
  try {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (typeof j.summary === 'string') summary = j.summary;
      if (Array.isArray(j.action_items)) action_items = j.action_items.map((x) => String(x)).filter(Boolean);
      if (Array.isArray(j.decisions)) decisions = j.decisions.map((x) => String(x)).filter(Boolean);
    }
  } catch (_) {
    /* use raw */
  }

  const queries = deps.database.getQueries();
  const row = queries.getResourceById.get(noteId);
  if (!row || row.type !== 'note') return;

  const meta = parseMetadata(row.metadata);
  meta.call = meta.call && typeof meta.call === 'object' ? meta.call : {};
  meta.call.summary = summary;
  meta.call.action_items = action_items;
  meta.call.decisions = decisions;
  meta.call.summary_model = model;
  meta.call.summarized_at = Date.now();

  const now = Date.now();
  queries.updateResource.run(row.title, row.content, JSON.stringify(meta), now, noteId);
  deps.windowManager.broadcast('resource:updated', { id: noteId, metadata: meta });
}

/**
 * @param {Object} deps
 * @param {string} noteId
 */
async function regenerateSummaryForNote(deps, noteId) {
  const queries = deps.database.getQueries();
  const row = queries.getResourceById.get(noteId);
  if (!row || row.type !== 'note') {
    return { success: false, error: 'Note not found' };
  }
  const meta = parseMetadata(row.metadata);
  const structured = meta.transcription_structured;
  let plain = '';
  if (structured && Array.isArray(structured.segments)) {
    plain = transcriptionStructured.segmentsToPlainText(structured.segments);
  }
  if (!plain.trim()) {
    try {
      const doc = row.content ? JSON.parse(row.content) : null;
      if (doc && typeof doc === 'object') {
        plain = JSON.stringify(doc).slice(0, 50000);
      }
    } catch (_) {
      plain = typeof row.content === 'string' ? row.content : '';
    }
  }
  if (!plain.trim()) {
    return { success: false, error: 'No transcript text' };
  }
  await runCallSummary(deps, noteId, plain);
  return { success: true };
}

module.exports = {
  startSession,
  appendChunk,
  getLive,
  setPaused,
  stopSession,
  cancelSession,
  regenerateSummaryForNote,
};
