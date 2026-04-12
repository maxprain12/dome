/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const resourceIndexer = require('../resource-indexer.cjs');

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

function deriveNoteTitle(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return `Transcripción — ${new Date().toLocaleString()}`;
  }
  const slice = cleaned.slice(0, 60);
  return slice + (cleaned.length > 60 ? '…' : '');
}

function getTranscriptionDefaults(database) {
  const transcriptionService = require('../transcription-service.cjs');
  const queries = database.getQueries();
  const providerRow = queries.getSetting.get('transcription_stt_provider');
  let sttProvider = providerRow?.value && String(providerRow.value).trim().toLowerCase();
  if (sttProvider !== 'groq' && sttProvider !== 'openai' && sttProvider !== 'custom') {
    sttProvider = transcriptionService.getTranscriptionSttProvider(database);
  }
  const modelRow = queries.getSetting.get('transcription_model');
  const langRow = queries.getSetting.get('transcription_language');
  const baseRow = queries.getSetting.get('transcription_api_base_url');
  const promptRow = queries.getSetting.get('transcription_prompt');
  const pauseRow = queries.getSetting.get('transcription_pause_threshold_sec');
  let model = modelRow?.value && String(modelRow.value).trim();
  if (!model) {
    model = sttProvider === 'groq' ? transcriptionService.DEFAULT_GROQ_MODEL : 'whisper-1';
  }
  const languageRaw = langRow?.value && String(langRow.value).trim();
  const language = languageRaw || null;
  const apiBaseUrl = baseRow?.value && String(baseRow.value).trim() ? String(baseRow.value).trim() : '';
  const prompt = promptRow?.value && String(promptRow.value).trim() ? String(promptRow.value).trim() : '';
  const pauseParsed = parseFloat(String(pauseRow?.value || ''));
  const pauseThresholdSec =
    Number.isFinite(pauseParsed) && pauseParsed >= 0.4 && pauseParsed <= 8 ? pauseParsed : 1.35;
  return { sttProvider, model, language, apiBaseUrl, prompt, pauseThresholdSec };
}

function register({ ipcMain, windowManager, database, fileStorage, aiToolsHandler, thumbnail, initModule, ollamaService, pendingDisplayMediaSources }) {
  const transcriptionService = require('../transcription-service.cjs');
  const transcriptionStructured = require('../transcription-structured.cjs');
  const transcriptionShortcut = require('../transcription-shortcut.cjs');
  const indexerDeps = { database, fileStorage, windowManager, initModule, ollamaService };

  /**
   * macOS microphone permission (no-op elsewhere; Chromium handles the rest).
   */
  ipcMain.handle('transcription:request-microphone-access', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        const granted = await systemPreferences.askForMediaAccess('microphone');
        return { success: true, granted };
      }
      return { success: true, granted: true };
    } catch (err) {
      console.error('[Transcription] microphone access error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Store the desired desktopCapturer source ID before the renderer calls getDisplayMedia().
   * The setDisplayMediaRequestHandler in main.cjs reads this to select the right source.
   */
  ipcMain.handle('transcription:set-display-media-source', async (event, { sourceId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    if (typeof sourceId !== 'string' || !sourceId) {
      return { success: false, error: 'sourceId required' };
    }
    if (pendingDisplayMediaSources && typeof pendingDisplayMediaSources.set === 'function') {
      pendingDisplayMediaSources.set(sourceId);
    }
    return { success: true };
  });

  /**
   * Returns current microphone and screen recording permission status.
   * On macOS uses systemPreferences.getMediaAccessStatus().
   * On Windows/Linux returns 'granted' (managed by OS).
   */
  ipcMain.handle('transcription:get-permissions-status', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        const microphone = systemPreferences.getMediaAccessStatus('microphone');
        const screen = systemPreferences.getMediaAccessStatus('screen');
        return { success: true, microphone, screen };
      }
      return { success: true, microphone: 'granted', screen: 'granted' };
    } catch (err) {
      console.error('[Transcription] get-permissions-status error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Triggers the macOS Screen Recording permission dialog by calling getSources().
   * On macOS, there is no systemPreferences.askForMediaAccess('screen') — the only
   * way to prompt is to actually attempt screen capture.
   * Returns the updated permission status after the attempt.
   */
  ipcMain.handle('transcription:request-screen-access', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      if (process.platform === 'darwin') {
        const { desktopCapturer, systemPreferences } = require('electron');
        // This call triggers the OS permission prompt on first use
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
        const screen = systemPreferences.getMediaAccessStatus('screen');
        return { success: true, screen };
      }
      return { success: true, screen: 'granted' };
    } catch (err) {
      console.error('[Transcription] request-screen-access error:', err);
      return { success: false, error: err.message };
    }
  });

  const manyVoiceShortcut = require('../many-voice-shortcut.cjs');

  ipcMain.handle('transcription:buffer-to-text', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const raw = payload.buffer;
      if (!raw) {
        return { success: false, error: 'buffer is required' };
      }
      const buf = Buffer.from(raw instanceof ArrayBuffer ? raw : raw.buffer || raw);

      const apiKey = transcriptionService.getTranscriptionApiKey(database);
      if (!apiKey) {
        const prov = transcriptionService.getTranscriptionSttProvider(database);
        return {
          success: false,
          error:
            prov === 'groq'
              ? 'Configura tu clave de Groq para transcripción (Ajustes → Transcripción).'
              : 'Configure una clave de API para transcripción (Ajustes → Transcripción).',
        };
      }

      const defaults = getTranscriptionDefaults(database);
      const model = payload.model || defaults.model;
      const language =
        payload.language !== undefined
          ? payload.language
            ? String(payload.language).trim()
            : null
          : defaults.language;

      const ext = (payload.extension || 'webm').replace(/^\./, '') || 'webm';
      const tempDir = path.join(require('electron').app.getPath('temp'), 'dome-transcription');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempInput = path.join(tempDir, `dome-stt-text-${Date.now()}.${ext}`);
      fs.writeFileSync(tempInput, buf);
      try {
        const { text, structured } = await transcriptionService.transcribeFilePath(tempInput, {
          apiKey,
          model,
          language,
          database,
        });
        if (!text) {
          return { success: false, error: 'Transcription returned empty text' };
        }
        return { success: true, text, structured: structured || null };
      } finally {
        try {
          if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        } catch (_) {
          /* */
        }
      }
    } catch (err) {
      console.error('[Transcription] buffer-to-text error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:resource-to-note', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const resourceId = payload.resourceId;
      if (!resourceId) {
        return { success: false, error: 'resourceId is required' };
      }

      const { transcribeResourceToNote } = require('../transcription-note-helper.cjs');
      const result = await transcribeResourceToNote({
        resourceId,
        database,
        fileStorage,
        windowManager,
        aiToolsHandler,
        initModule,
        ollamaService,
        model: payload.model,
        language: payload.language,
        titleOverride: payload.title,
        updateAudioMetadata: payload.updateAudioMetadata !== false,
      });

      if (!result.success && result.error === 'No STT API key for transcription') {
        const prov = require('../transcription-service.cjs').getTranscriptionSttProvider(database);
        return {
          success: false,
          error:
            prov === 'groq'
              ? 'Configura tu clave de Groq para transcripción (Ajustes → Transcripción).'
              : 'Configure una clave de API para transcripción (Ajustes → Transcripción).',
        };
      }

      return result;
    } catch (err) {
      console.error('[Transcription] resource-to-note error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:buffer-to-note', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const raw = payload.buffer;
      if (!raw) {
        return { success: false, error: 'buffer is required' };
      }
      const buf = Buffer.from(raw instanceof ArrayBuffer ? raw : raw.buffer || raw);

      const projectId = payload.projectId || 'default';
      const folderId = payload.folderId != null && payload.folderId !== '' ? payload.folderId : null;
      if (folderId) {
        const folder = database.getQueries().getResourceById.get(folderId);
        if (!folder || folder.type !== 'folder') {
          return { success: false, error: 'Invalid folder_id' };
        }
      }

      const queries = database.getQueries();
      const projectExists = queries.getProjectById.get(projectId);
      if (!projectExists) {
        return { success: false, error: 'Project not found' };
      }

      const apiKey = transcriptionService.getTranscriptionApiKey(database);
      if (!apiKey) {
        const prov = transcriptionService.getTranscriptionSttProvider(database);
        return {
          success: false,
          error:
            prov === 'groq'
              ? 'Configura tu clave de Groq para transcripción (Ajustes → Transcripción).'
              : 'Configure una clave de API para transcripción (Ajustes → Transcripción).',
        };
      }

      const defaults = getTranscriptionDefaults(database);
      const model = payload.model || defaults.model;
      const language =
        payload.language !== undefined
          ? payload.language
          ? String(payload.language).trim()
          : null
          : defaults.language;

      const ext = (payload.extension || 'webm').replace(/^\./, '') || 'webm';
      const tempDir = path.join(require('electron').app.getPath('temp'), 'dome-transcription');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempInput = path.join(tempDir, `dome-mic-${Date.now()}.${ext}`);
      fs.writeFileSync(tempInput, buf);

      const captureKind =
        payload.captureKind === 'system' ? 'system' : payload.captureKind === 'call' ? 'call' : 'microphone';
      const callPlatform =
        typeof payload.callPlatform === 'string' && payload.callPlatform.trim()
          ? payload.callPlatform.trim()
          : 'unknown';

      let audioResourceId = null;
      try {
        if (payload.saveRecordingAsAudio) {
                        const importResult = await fileStorage.importFile(tempInput, 'audio');
              const dup = queries.findByHash.get(importResult.hash);
              if (dup) {
                audioResourceId = dup.id;
              } else {
                const audioId = generateResourceId();
                const nowA = Date.now();
                const thumb = thumbnail
                  ? await thumbnail.generateThumbnail(
                      fileStorage.getFullPath(importResult.internalPath),
                      'audio',
                      importResult.mimeType
                    )
                  : null;

                const sourceTag =
                  captureKind === 'system' ? 'system_audio' : captureKind === 'call' ? 'call_recording' : 'microphone_recording';

                queries.createResourceWithFile.run(
                  audioId,
                  projectId,
                  'audio',
                  payload.audioTitle?.trim() || `Grabación ${new Date().toLocaleString()}`,
                  null,
                  null,
                  importResult.internalPath,
                  importResult.mimeType,
                  importResult.size,
                  importResult.hash,
                  thumb,
                  importResult.originalName,
                  JSON.stringify({
                    source: sourceTag,
                    capture_kind: captureKind,
                    call_platform: callPlatform,
                    created_at: nowA,
                  }),
                  nowA,
                  nowA
                );
            audioResourceId = audioId;
            const ar = queries.getResourceById.get(audioId);
            windowManager.broadcast('resource:created', ar);
            if (resourceIndexer.shouldIndex(ar)) {
              resourceIndexer.scheduleIndexing(audioId, indexerDeps);
            }
          }
        }

        const { text, structured } = await transcriptionService.transcribeFilePath(tempInput, {
          apiKey,
          model,
          language,
          database,
        });
        if (!text) {
          return { success: false, error: 'Transcription returned empty text' };
        }

        const structuredPayload = {
          ...structured,
          session: { captureKind, callPlatform, inferredAt: Date.now() },
        };
        const md = transcriptionStructured.structuredToMarkdownForNote(
          structuredPayload.segments || [],
          structuredPayload.speakers || {},
        );
        const tipTap = aiToolsHandler.markdownToTipTapJSON(md || text);

        const now = Date.now();
        const noteId = generateResourceId();
        const title = payload.title?.trim() || deriveNoteTitle(text);
        const noteMeta = {
          source: 'transcription',
          source_audio_id: audioResourceId || undefined,
          source_media_type: audioResourceId ? 'audio' : undefined,
          transcription_model: model,
          transcription_language: language || 'auto',
          transcribed_at: now,
          from_microphone: captureKind === 'microphone',
          transcription_diarization: structuredPayload.diarization || 'heuristic',
        };
        queries.createResource.run(
          noteId,
          projectId,
          'note',
          title,
          tipTap,
          null,
          folderId,
          JSON.stringify(noteMeta),
          now,
          now
        );
        const noteResource = queries.getResourceById.get(noteId);
        windowManager.broadcast('resource:created', noteResource);
        if (resourceIndexer.shouldIndex(noteResource)) {
          resourceIndexer.scheduleIndexing(noteId, indexerDeps);
        }

        if (audioResourceId) {
          const ar = queries.getResourceById.get(audioResourceId);
          if (ar) {
            const meta = parseMetadata(ar.metadata);
            meta.transcription = text;
            meta.transcription_structured = structuredPayload;
            meta.transcription_note_id = noteId;
            meta.transcription_model = model;
            meta.transcription_language = language || 'auto';
            meta.transcribed_at = now;
            meta.processing_status = 'completed';
            queries.updateResource.run(ar.title, ar.content, JSON.stringify(meta), now, audioResourceId);
            windowManager.broadcast('resource:updated', { id: audioResourceId, metadata: meta });
          }
        }

        return {
          success: true,
          note: noteResource,
          text,
          structured: structuredPayload,
          audioResourceId,
        };
      } finally {
        try {
          if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        } catch (_) {
          /* */
        }
      }
    } catch (err) {
      console.error('[Transcription] buffer-to-note error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:get-defaults', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      return { success: true, data: getTranscriptionDefaults(database) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:set-settings', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const now = Date.now();
      if (payload.sttProvider != null) {
        const p = String(payload.sttProvider).trim().toLowerCase();
        if (p === 'groq' || p === 'openai' || p === 'custom') {
          queries.setSetting.run('transcription_stt_provider', p, now);
        }
      }
      if (payload.model != null) {
        const m = String(payload.model).trim() || 'whisper-1';
        queries.setSetting.run('transcription_model', m, now);
      }
      if (payload.language !== undefined) {
        queries.setSetting.run('transcription_language', payload.language ? String(payload.language).trim() : '', now);
      }
      if (payload.dedicatedOpenaiKey !== undefined) {
        const k = payload.dedicatedOpenaiKey;
        queries.setSetting.run(
          'transcription_openai_api_key',
          k === '' || k === null ? '' : String(k).trim(),
          now
        );
      }
      if (payload.groqApiKey !== undefined) {
        const k = payload.groqApiKey;
        queries.setSetting.run(
          'transcription_groq_api_key',
          k === '' || k === null ? '' : String(k).trim(),
          now
        );
      }
      if (payload.globalShortcut != null) {
        queries.setSetting.run('transcription_global_shortcut', String(payload.globalShortcut).trim(), now);
      }
      if (payload.transcriptionGlobalShortcutEnabled !== undefined) {
        const on = payload.transcriptionGlobalShortcutEnabled === true || payload.transcriptionGlobalShortcutEnabled === '1';
        queries.setSetting.run('transcription_global_shortcut_enabled', on ? '1' : '0', now);
      }
      if (payload.manyVoiceGlobalShortcut !== undefined) {
        const m =
          payload.manyVoiceGlobalShortcut == null || payload.manyVoiceGlobalShortcut === ''
            ? ''
            : String(payload.manyVoiceGlobalShortcut).trim();
        queries.setSetting.run('many_voice_global_shortcut', m, now);
      }
      if (payload.manyVoiceGlobalShortcutEnabled !== undefined) {
        const on = payload.manyVoiceGlobalShortcutEnabled === true || payload.manyVoiceGlobalShortcutEnabled === '1';
        queries.setSetting.run('many_voice_global_shortcut_enabled', on ? '1' : '0', now);
      }
      if (payload.manyVoiceRealtimeEnabled !== undefined) {
        const on = payload.manyVoiceRealtimeEnabled === true || payload.manyVoiceRealtimeEnabled === '1';
        queries.setSetting.run('many_voice_realtime_enabled', on ? '1' : '0', now);
      }
      if (payload.realtimeVoice != null) {
        const v = String(payload.realtimeVoice).trim();
        if (v) queries.setSetting.run('realtime_voice', v, now);
      }
      if (payload.realtimeModel != null) {
        const m = String(payload.realtimeModel).trim();
        if (m) queries.setSetting.run('realtime_model', m, now);
      }
      if (payload.realtimeInstructionsSuffix !== undefined) {
        const s = payload.realtimeInstructionsSuffix == null ? '' : String(payload.realtimeInstructionsSuffix).slice(0, 2000);
        queries.setSetting.run('realtime_instructions_suffix', s, now);
      }
      if (payload.apiBaseUrl !== undefined) {
        const u = payload.apiBaseUrl == null ? '' : String(payload.apiBaseUrl).trim();
        queries.setSetting.run('transcription_api_base_url', u, now);
      }
      if (payload.prompt !== undefined) {
        const p = payload.prompt == null ? '' : String(payload.prompt).trim();
        queries.setSetting.run('transcription_prompt', p, now);
      }
      if (payload.pauseThresholdSec !== undefined) {
        const raw = payload.pauseThresholdSec;
        if (raw === '' || raw === null) {
          queries.setSetting.run('transcription_pause_threshold_sec', '', now);
        } else {
          const num = Number(raw);
          const clamped = Number.isFinite(num) ? Math.min(8, Math.max(0.4, num)) : 1.35;
          queries.setSetting.run('transcription_pause_threshold_sec', String(clamped), now);
        }
      }
      try {
        transcriptionShortcut.registerFromDatabase(database, windowManager);
        await manyVoiceShortcut.registerFromDatabase(database, windowManager);
      } catch (regErr) {
        console.warn('[Transcription] shortcut refresh:', regErr?.message);
      }
      return { success: true, data: getTranscriptionDefaults(database) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:get-settings', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const queries = database.getQueries();
      const defaults = getTranscriptionDefaults(database);
      const keyRow = queries.getSetting.get('transcription_openai_api_key');
      const groqKeyRow = queries.getSetting.get('transcription_groq_api_key');
      const shortcutRow = queries.getSetting.get('transcription_global_shortcut');
      const manyVoiceRow = queries.getSetting.get('many_voice_global_shortcut');
      const tsEn = queries.getSetting.get('transcription_global_shortcut_enabled');
      const mvEn = queries.getSetting.get('many_voice_global_shortcut_enabled');
      const rtEn = queries.getSetting.get('many_voice_realtime_enabled');
      const rv = queries.getSetting.get('realtime_voice');
      const rm = queries.getSetting.get('realtime_model');
      const ris = queries.getSetting.get('realtime_instructions_suffix');
      const gShortcut = shortcutRow?.value || '';
      const mvShortcut = manyVoiceRow?.value || '';
      const parseTri = (row, hasAccel) => {
        const v = row?.value != null ? String(row.value).trim().toLowerCase() : '';
        if (v === '0' || v === 'false' || v === 'off') return false;
        if (v === '1' || v === 'true' || v === 'on') return true;
        return Boolean(hasAccel);
      };
      return {
        success: true,
        data: {
          ...defaults,
          hasDedicatedOpenAIKey: Boolean(keyRow?.value && String(keyRow.value).trim()),
          hasGroqApiKey: Boolean(groqKeyRow?.value && String(groqKeyRow.value).trim()),
          globalShortcut: gShortcut,
          manyVoiceGlobalShortcut: mvShortcut,
          transcriptionGlobalShortcutEnabled: parseTri(tsEn, gShortcut),
          manyVoiceGlobalShortcutEnabled: parseTri(mvEn, mvShortcut),
          manyVoiceRealtimeEnabled: rtEn?.value === '0' || rtEn?.value === 'false' ? false : true,
          realtimeVoice: rv?.value || 'shimmer',
          realtimeModel: rm?.value || 'gpt-4o-realtime-preview-2024-12-17',
          realtimeInstructionsSuffix: ris?.value || '',
          pauseThresholdSec: defaults.pauseThresholdSec,
        },
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:regenerate-linked-note', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const { regenerateLinkedNoteFromStructured } = require('../transcription-note-helper.cjs');
      const resourceId = payload.resourceId;
      if (!resourceId) return { success: false, error: 'resourceId is required' };
      return regenerateLinkedNoteFromStructured({
        resourceId,
        database,
        windowManager,
        aiToolsHandler,
      });
    } catch (err) {
      console.error('[Transcription] regenerate-linked-note:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:patch-transcript-speakers', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const resourceId = payload.resourceId;
      const speakersPatch = payload.speakersPatch;
      if (!resourceId || !speakersPatch || typeof speakersPatch !== 'object') {
        return { success: false, error: 'resourceId and speakersPatch are required' };
      }
      const queries = database.getQueries();
      const r = queries.getResourceById.get(resourceId);
      if (!r) return { success: false, error: 'Resource not found' };
      const meta = parseMetadata(r.metadata);
      const ts = meta.transcription_structured;
      if (!ts) return { success: false, error: 'No structured transcript' };
      ts.speakers = { ...(ts.speakers || {}), ...speakersPatch };
      meta.transcription_structured = ts;
      const now = Date.now();
      queries.updateResource.run(r.title, r.content, JSON.stringify(meta), now, resourceId);
      windowManager.broadcast('resource:updated', { id: resourceId, metadata: meta });
      return { success: true };
    } catch (err) {
      console.error('[Transcription] patch-transcript-speakers:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:list-desktop-capture-sources', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 120, height: 80 },
        fetchWindowIcons: true,
      });
      return {
        success: true,
        sources: sources.map((s) => ({
          id: s.id,
          name: s.name,
        })),
      };
    } catch (err) {
      console.error('[Transcription] list-desktop-capture-sources:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
