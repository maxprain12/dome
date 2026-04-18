/* eslint-disable no-console */
/**
 * Shared: transcribe an audio/video resource file and create a linked note (used by IPC + WhatsApp).
 */
const resourceIndexer = require('./resource-indexer.cjs');
const transcriptionStructured = require('./transcription-structured.cjs');

function parseMetadata(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function deriveNoteTitle(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return `Transcripción — ${new Date().toLocaleString()}`;
  const slice = cleaned.slice(0, 60);
  return slice + (cleaned.length > 60 ? '…' : '');
}

function inferCallPlatformFromStrings(title, filename) {
  const s = `${String(title || '')} ${String(filename || '')}`.toLowerCase();
  if (s.includes('teams') || s.includes('microsoft teams')) return 'teams';
  if (s.includes('slack')) return 'slack';
  if (s.includes('discord')) return 'discord';
  if (s.includes('meet.google') || s.includes('google meet')) return 'meet';
  if (s.includes('zoom')) return 'zoom';
  if (s.includes('webex')) return 'webex';
  return 'unknown';
}

function buildTranscriptionSession(resource) {
  const meta = parseMetadata(resource.metadata);
  let captureKind = 'file';
  if (meta.capture_kind === 'mic_and_system') captureKind = 'mic_and_system';
  else if (meta.capture_kind === 'system') captureKind = 'system';
  else if (meta.capture_kind === 'call') captureKind = 'call';
  else if (meta.from_microphone || meta.source === 'microphone_recording') captureKind = 'microphone';

  let callPlatform = meta.call_platform || 'unknown';
  if (callPlatform === 'unknown') {
    callPlatform = inferCallPlatformFromStrings(resource.title, resource.original_filename);
  }
  return { captureKind, callPlatform, inferredAt: Date.now() };
}

function getDefaults(database) {
  const transcriptionService = require('./transcription-service.cjs');
  const queries = database.getQueries();
  const providerRow = queries.getSetting.get('transcription_stt_provider');
  let sttProvider = providerRow?.value && String(providerRow.value).trim().toLowerCase();
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
  return { sttProvider, model, language: languageRaw || null };
}

/**
 * Regenera el contenido TipTap de la nota vinculada desde `transcription_structured`.
 */
function regenerateLinkedNoteFromStructured(ctx) {
  const { resourceId, database, windowManager, aiToolsHandler } = ctx;

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) return { success: false, error: 'Resource not found' };

    const meta = parseMetadata(resource.metadata);
    const ts = meta.transcription_structured;
    const noteId = meta.transcription_note_id;
    if (!ts || !noteId) {
      return { success: false, error: 'No structured transcript or linked note' };
    }

    const note = queries.getResourceById.get(noteId);
    if (!note || note.type !== 'note') {
      return { success: false, error: 'Linked note not found' };
    }

    const md = transcriptionStructured.structuredToMarkdownForNote(ts.segments || [], ts.speakers || {});
    const tipTap = aiToolsHandler.markdownToTipTapJSON(md || meta.transcription || '');
    const noteMeta = parseMetadata(note.metadata);
    const now = Date.now();
    queries.updateResource.run(note.title, tipTap, JSON.stringify(noteMeta), now, noteId);
    windowManager.broadcast('resource:updated', {
      id: noteId,
      updates: { content: tipTap, metadata: noteMeta, updated_at: now },
    });
    return { success: true, noteId };
  } catch (err) {
    console.error('[TranscriptionNoteHelper] regenerateLinkedNoteFromStructured:', err);
    return { success: false, error: err.message };
  }
}

/**
 * @param {Object} ctx
 * @param {string} ctx.resourceId
 * @param {Object} ctx.database
 * @param           {Object} ctx.fileStorage
 * @param {Object} ctx.windowManager
 * @param {Object} ctx.aiToolsHandler - must export markdownToTipTapJSON
 * @param {Object} ctx.initModule
 * @param {Object} ctx.ollamaService
 * @param {string} [ctx.model]
 * @param {string|null} [ctx.language]
 * @param {string} [ctx.titleOverride]
 * @param {boolean} [ctx.updateAudioMetadata]
 * @returns {Promise<{ success: boolean, error?: string, note?: Object, text?: string, structured?: Object }>}
 */
async function transcribeResourceToNote(ctx) {
  const {
    resourceId,
    database,
    fileStorage,
    windowManager,
    aiToolsHandler,
    initModule,
    ollamaService,
    updateAudioMetadata = true,
    model: modelArg,
    language: languageArg,
    titleOverride,
  } = ctx;

  const transcriptionService = require('./transcription-service.cjs');
  const indexerDeps = { database, fileStorage, windowManager, initModule, ollamaService };

  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) return { success: false, error: 'Resource not found' };
    if (resource.type !== 'audio' && resource.type !== 'video') {
      return { success: false, error: 'Not an audio/video resource' };
    }

    let filePath = null;
    if (resource.internal_path && fileStorage.fileExists(resource.internal_path)) {
      filePath = fileStorage.getFullPath(resource.internal_path);
    } else if (resource.file_path && require('fs').existsSync(resource.file_path)) {
      filePath = resource.file_path;
    }
    if (!filePath) return { success: false, error: 'Media file not found' };

    const apiKey = transcriptionService.getTranscriptionApiKey(database);
    if (!apiKey) return { success: false, error: 'No STT API key for transcription' };

    const defaults = getDefaults(database);
    const model =
      modelArg != null && String(modelArg).trim() ? String(modelArg).trim() : defaults.model;
    const language =
      languageArg !== undefined
        ? languageArg
          ? String(languageArg).trim()
          : null
        : defaults.language;
    const { text, structured } = await transcriptionService.transcribeFilePath(filePath, {
      apiKey,
      model,
      language,
      database,
    });
    if (!text) return { success: false, error: 'Empty transcription' };

    const structuredPayload = {
      ...structured,
      session: buildTranscriptionSession(resource),
    };

    const md = transcriptionStructured.structuredToMarkdownForNote(
      structuredPayload.segments || [],
      structuredPayload.speakers || {},
    );
    const tipTap = aiToolsHandler.markdownToTipTapJSON(md || text);

    const now = Date.now();
    const noteId = `res_${now}_${Math.random().toString(36).slice(2, 11)}`;
    const title = (titleOverride && String(titleOverride).trim()) || deriveNoteTitle(text);
    const noteMeta = {
      source: 'transcription',
      source_audio_id: resourceId,
      source_media_type: resource.type,
      transcription_model: model,
      transcription_language: language || 'auto',
      transcribed_at: now,
      transcription_diarization: structuredPayload.diarization || 'heuristic',
    };
    queries.createResource.run(
      noteId,
      resource.project_id,
      'note',
      title,
      tipTap,
      null,
      resource.folder_id,
      JSON.stringify(noteMeta),
      now,
      now
    );
    const noteResource = queries.getResourceById.get(noteId);
    windowManager.broadcast('resource:created', noteResource);
    if (resourceIndexer.shouldIndex(noteResource)) {
      resourceIndexer.scheduleIndexing(noteId, indexerDeps);
    }

    if (updateAudioMetadata) {
      const meta = parseMetadata(resource.metadata);
      meta.transcription = text;
      meta.transcription_structured = structuredPayload;
      meta.transcription_model = model;
      meta.transcription_language = language || 'auto';
      meta.transcribed_at = now;
      meta.processing_status = 'completed';
      meta.transcription_note_id = noteId;
      queries.updateResource.run(resource.title, resource.content, JSON.stringify(meta), now, resource.id);
      windowManager.broadcast('resource:updated', { id: resource.id, metadata: meta });
    }

    return {
      success: true,
      note: noteResource,
      text,
      structured: structuredPayload,
      sourceResourceId: resourceId,
    };
  } catch (err) {
    console.error('[TranscriptionNoteHelper] error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  transcribeResourceToNote,
  regenerateLinkedNoteFromStructured,
  deriveNoteTitle,
  getDefaults,
  parseMetadata,
  buildTranscriptionSession,
};
