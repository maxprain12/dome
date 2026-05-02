/* eslint-disable no-console */
/**
 * Transcription IPC — single namespace for the redesigned engine.
 *
 * 12 channels total (vs 36 across transcription:* / calls:* / overlay:*):
 *   transcription:get-settings
 *   transcription:set-settings
 *   transcription:get-permissions
 *   transcription:request-mic
 *   transcription:request-screen
 *   transcription:list-capture-sources
 *   transcription:set-display-media-source   (internal — primes the request handler)
 *   transcription:session-start
 *   transcription:session-append
 *   transcription:session-control            (pause | resume | cancel | stop)
 *   transcription:get-active                 (renderer reconnect after reload)
 *   transcription:resource-to-note           (manual conversion from detail page)
 *
 * Broadcast: transcription:state (main -> renderer)
 */

const transcriptionService = require('../transcription-service.cjs');
const transcriptionSession = require('../transcription-session.cjs');

function generateResourceId() {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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

function readDefaultSources(database) {
  try {
    const row = database.getQueries().getSetting.get('transcription_default_sources');
    const raw = row?.value && String(row.value).trim();
    if (!raw) return ['mic'];
    const parsed = JSON.parse(raw);
    const valid = Array.isArray(parsed)
      ? parsed.filter((s) => s === 'mic' || s === 'system')
      : [];
    return valid.length ? valid : ['mic'];
  } catch {
    return ['mic'];
  }
}

function readBoolSetting(database, key, fallback) {
  try {
    const row = database.getQueries().getSetting.get(key);
    if (!row || row.value == null) return fallback;
    const v = String(row.value).trim().toLowerCase();
    if (v === '0' || v === 'false' || v === 'off') return false;
    if (v === '1' || v === 'true' || v === 'on') return true;
    return fallback;
  } catch {
    return fallback;
  }
}

function getSettingsPayload(database) {
  const queries = database.getQueries();

  let sttProvider = transcriptionService.getTranscriptionSttProvider(database);
  if (sttProvider !== 'groq' && sttProvider !== 'openai' && sttProvider !== 'custom') {
    sttProvider = 'openai';
  }

  const modelRow = queries.getSetting.get('transcription_model');
  const langRow = queries.getSetting.get('transcription_language');
  const baseRow = queries.getSetting.get('transcription_api_base_url');
  const promptRow = queries.getSetting.get('transcription_prompt');
  const pauseRow = queries.getSetting.get('transcription_pause_threshold_sec');
  const keyRow = queries.getSetting.get('transcription_openai_api_key');
  const groqKeyRow = queries.getSetting.get('transcription_groq_api_key');
  const shortcutRow = queries.getSetting.get('transcription_global_shortcut');
  const shortcutEnRow = queries.getSetting.get('transcription_global_shortcut_enabled');
  const chunkSecRow = queries.getSetting.get('transcription_chunk_sec');
  const summaryModelRow = queries.getSetting.get('transcription_summary_model');

  const model = (modelRow?.value && String(modelRow.value).trim())
    || (sttProvider === 'groq' ? transcriptionService.DEFAULT_GROQ_MODEL : 'whisper-1');
  const language = (langRow?.value && String(langRow.value).trim()) || null;
  const apiBaseUrl = (baseRow?.value && String(baseRow.value).trim()) || '';
  const prompt = (promptRow?.value && String(promptRow.value).trim()) || '';
  const pauseParsed = parseFloat(String(pauseRow?.value || ''));
  const pauseThresholdSec = Number.isFinite(pauseParsed) && pauseParsed >= 0.4 && pauseParsed <= 8
    ? pauseParsed
    : 1.35;
  const globalShortcut = (shortcutRow?.value && String(shortcutRow.value).trim()) || '';
  const shortcutEnabledRaw = shortcutEnRow?.value != null ? String(shortcutEnRow.value).trim().toLowerCase() : '';
  const globalShortcutEnabled = shortcutEnabledRaw === '0' || shortcutEnabledRaw === 'false' || shortcutEnabledRaw === 'off'
    ? false
    : (shortcutEnabledRaw === '1' || shortcutEnabledRaw === 'true' || shortcutEnabledRaw === 'on'
      ? true
      : Boolean(globalShortcut));
  const chunkSecParsed = parseInt(String(chunkSecRow?.value || ''), 10);
  const chunkSec = Number.isFinite(chunkSecParsed) ? Math.min(60, Math.max(2, chunkSecParsed)) : 4;

  return {
    sttProvider,
    model,
    language,
    apiBaseUrl,
    prompt,
    pauseThresholdSec,
    hasOpenAIKey: Boolean(keyRow?.value && String(keyRow.value).trim()),
    hasGroqKey: Boolean(groqKeyRow?.value && String(groqKeyRow.value).trim()),
    globalShortcut,
    globalShortcutEnabled,
    defaultSources: readDefaultSources(database),
    liveTranscriptDefault: readBoolSetting(database, 'transcription_live_transcript_default', true),
    autoSummary: readBoolSetting(database, 'transcription_auto_summary', false),
    chunkSec,
    summaryModel: (summaryModelRow?.value && String(summaryModelRow.value).trim()) || 'gpt-4o-mini',
  };
}

function register({
  ipcMain,
  windowManager,
  database,
  fileStorage,
  aiToolsHandler,
  thumbnail,
  initModule,
  ollamaService,
  pendingDisplayMediaSources,
}) {
  const transcriptionShortcut = require('../transcription-shortcut.cjs');
  const sessionDeps = { database, fileStorage, windowManager, thumbnail, initModule, ollamaService };

  // -- Settings -----------------------------------------------------------

  ipcMain.handle('transcription:get-settings', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      return { success: true, data: getSettingsPayload(database) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:set-settings', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const queries = database.getQueries();
      const now = Date.now();

      if (payload.sttProvider != null) {
        let p = String(payload.sttProvider).trim().toLowerCase();
        if (p === 'local-gemma') p = 'openai';
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
        queries.setSetting.run('transcription_openai_api_key', k === '' || k === null ? '' : String(k).trim(), now);
      }
      if (payload.groqApiKey !== undefined) {
        const k = payload.groqApiKey;
        queries.setSetting.run('transcription_groq_api_key', k === '' || k === null ? '' : String(k).trim(), now);
      }
      if (payload.globalShortcut !== undefined) {
        queries.setSetting.run('transcription_global_shortcut', String(payload.globalShortcut || '').trim(), now);
      }
      if (payload.globalShortcutEnabled !== undefined) {
        const on = payload.globalShortcutEnabled === true || payload.globalShortcutEnabled === '1';
        queries.setSetting.run('transcription_global_shortcut_enabled', on ? '1' : '0', now);
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
      if (payload.defaultSources !== undefined) {
        const valid = Array.isArray(payload.defaultSources)
          ? payload.defaultSources.filter((s) => s === 'mic' || s === 'system')
          : [];
        queries.setSetting.run('transcription_default_sources', JSON.stringify(valid.length ? valid : ['mic']), now);
      }
      if (payload.liveTranscriptDefault !== undefined) {
        const on = payload.liveTranscriptDefault === true || payload.liveTranscriptDefault === '1';
        queries.setSetting.run('transcription_live_transcript_default', on ? '1' : '0', now);
      }
      if (payload.autoSummary !== undefined) {
        const on = payload.autoSummary === true || payload.autoSummary === '1';
        queries.setSetting.run('transcription_auto_summary', on ? '1' : '0', now);
      }
      if (payload.chunkSec !== undefined) {
        const n = Number(payload.chunkSec);
        const sec = Number.isFinite(n) ? Math.min(60, Math.max(2, Math.round(n))) : 4;
        queries.setSetting.run('transcription_chunk_sec', String(sec), now);
      }
      if (payload.summaryModel !== undefined) {
        const m = payload.summaryModel == null ? '' : String(payload.summaryModel).trim();
        queries.setSetting.run('transcription_summary_model', m || 'gpt-4o-mini', now);
      }

      try {
        transcriptionShortcut.registerFromDatabase(database, windowManager);
      } catch (regErr) {
        console.warn('[Transcription] shortcut refresh:', regErr?.message);
      }
      return { success: true, data: getSettingsPayload(database) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // -- Permissions --------------------------------------------------------

  ipcMain.handle('transcription:get-permissions', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        return {
          success: true,
          mic: systemPreferences.getMediaAccessStatus('microphone'),
          screen: systemPreferences.getMediaAccessStatus('screen'),
        };
      }
      return { success: true, mic: 'granted', screen: 'granted' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:request-mic', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        const granted = await systemPreferences.askForMediaAccess('microphone');
        return { success: true, granted };
      }
      return { success: true, granted: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:request-screen', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      if (process.platform === 'darwin') {
        const { desktopCapturer, systemPreferences } = require('electron');
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
        const screen = systemPreferences.getMediaAccessStatus('screen');
        return { success: true, granted: screen === 'granted', screen };
      }
      return { success: true, granted: true, screen: 'granted' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // -- Capture sources ----------------------------------------------------

  ipcMain.handle('transcription:list-capture-sources', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
      });
      return {
        success: true,
        sources: sources.map((s) => {
          const displayId = s.display_id != null ? String(s.display_id).trim() : '';
          const kind = displayId.length > 0 ? 'screen' : 'window';
          let thumbnailDataUrl = '';
          try {
            if (s.thumbnail && !s.thumbnail.isEmpty()) {
              const jpeg = s.thumbnail.toJPEG(85);
              thumbnailDataUrl = jpeg.length
                ? `data:image/jpeg;base64,${jpeg.toString('base64')}`
                : s.thumbnail.toDataURL();
            }
          } catch { /* ignore */ }
          let iconDataUrl = '';
          try {
            if (s.appIcon && !s.appIcon.isEmpty()) iconDataUrl = s.appIcon.toDataURL();
          } catch { /* ignore */ }
          return {
            id: s.id,
            name: s.name,
            kind,
            thumbnailDataUrl,
            ...(iconDataUrl ? { iconDataUrl } : {}),
          };
        }),
      };
    } catch (err) {
      console.error('[Transcription] list-capture-sources:', err);
      const base = err instanceof Error ? err.message : String(err);
      const error = process.platform === 'darwin'
        ? `${base} If this persists, grant Dome the "Screen Recording" permission in System Settings → Privacy & Security.`
        : base;
      return {
        success: false,
        error,
        ...(process.platform === 'darwin' ? { errorCode: 'screen_capture_permission' } : {}),
      };
    }
  });

  ipcMain.handle('transcription:set-display-media-source', async (event, { sourceId } = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    if (typeof sourceId !== 'string' || !sourceId) return { success: false, error: 'sourceId required' };
    if (pendingDisplayMediaSources && typeof pendingDisplayMediaSources.set === 'function') {
      pendingDisplayMediaSources.set(sourceId);
    }
    return { success: true };
  });

  // -- Session lifecycle --------------------------------------------------

  ipcMain.handle('transcription:session-start', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const apiKey = transcriptionService.getTranscriptionApiKey(database);
      if (!apiKey) {
        const prov = transcriptionService.getTranscriptionSttProvider(database);
        return {
          success: false,
          error: prov === 'groq'
            ? 'Configure your Groq API key in Settings → Transcription.'
            : 'Configure an API key in Settings → Transcription.',
        };
      }
      const { sessionId } = transcriptionSession.startSession(sessionDeps, {
        sources: payload.sources,
        systemSourceId: payload.systemSourceId,
        projectId: payload.projectId,
        folderId: payload.folderId,
        livePreview: payload.livePreview,
        saveAudio: payload.saveAudio,
      });
      return { success: true, sessionId };
    } catch (err) {
      console.error('[Transcription] session-start:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:session-append', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      await transcriptionSession.appendChunk(sessionDeps, payload);
      return { success: true };
    } catch (err) {
      console.error('[Transcription] session-append:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:session-control', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const result = await transcriptionSession.controlSession(sessionDeps, payload.sessionId, payload.action);
      return { success: true, ...result };
    } catch (err) {
      console.error('[Transcription] session-control:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transcription:get-active', async (event) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      return { success: true, data: transcriptionSession.getActiveState() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // -- Manual conversion: audio resource -> note --------------------------

  ipcMain.handle('transcription:resource-to-note', async (event, payload = {}) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    try {
      const resourceId = payload.resourceId;
      if (!resourceId) return { success: false, error: 'resourceId is required' };

      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (!resource) return { success: false, error: 'Resource not found' };

      const meta = parseMetadata(resource.metadata);
      const transcript = String(meta.transcription || '').trim();
      if (!transcript) return { success: false, error: 'Resource has no transcript' };

      // If the user has already linked a note, return that.
      if (meta.transcription_note_id) {
        const existing = queries.getResourceById.get(meta.transcription_note_id);
        if (existing) return { success: true, note: existing };
      }

      const now = Date.now();
      const noteId = generateResourceId();
      const title = deriveTitle(transcript);
      const tipTap = aiToolsHandler.markdownToTipTapJSON(transcript);

      const noteMeta = {
        source: 'transcription',
        source_audio_id: resource.id,
        source_media_type: 'audio',
        transcription: transcript,
        transcription_structured: meta.transcription_structured,
        transcribed_at: meta.transcribed_at || now,
      };

      queries.createResource.run(
        noteId,
        resource.project_id,
        'note',
        title,
        tipTap,
        null,
        resource.folder_id || null,
        JSON.stringify(noteMeta),
        now,
        now,
      );
      const noteResource = queries.getResourceById.get(noteId);
      windowManager.broadcast('resource:created', noteResource);

      // Back-link from audio resource for idempotence.
      meta.transcription_note_id = noteId;
      queries.updateResource.run(resource.title, resource.content, JSON.stringify(meta), now, resource.id);
      windowManager.broadcast('resource:updated', { id: resource.id, metadata: meta });

      return { success: true, note: noteResource };
    } catch (err) {
      console.error('[Transcription] resource-to-note:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };
