'use strict';

/**
 * Picks how a session shows live text.
 *
 * - `realtime`: stream PCM to OpenAI Realtime (OpenAI provider, default endpoint).
 * - `chunks`:   re-transcribe the recorded WebM chunks with the batch endpoint
 *               (Groq, custom base URLs, or when the user prefers it).
 *
 * The final transcript always comes from a batch pass over the merged audio
 * (diarization + best quality); live text is the fallback if that pass fails.
 */

const config = require('./stt/stt-config.cjs');
const { createRealtimeTranscriber } = require('./stt/realtime-stt.cjs');

/** @returns {'realtime'|'chunks'} */
function resolveLiveEngine(database) {
  if (config.getLiveEnginePreference(database) !== 'realtime') return 'chunks';
  if (config.getTranscriptionSttProvider(database) !== 'openai') return 'chunks';
  if (config.readSetting(database, 'transcription_api_base_url')) return 'chunks';
  if (!config.getTranscriptionApiKey(database, 'openai')) return 'chunks';
  return 'realtime';
}

/**
 * @param {object} database
 * @param {{ onText: (text: string) => void, onError: (code: string, detail?: string) => void }} handlers
 */
function createLiveTranscriber(database, handlers) {
  return createRealtimeTranscriber({
    apiKey: config.getTranscriptionApiKey(database, 'openai'),
    model: config.getRealtimeModel(database),
    language: config.getTranscriptionLanguage(database),
    prompt: config.getTranscriptionPromptFromDb(database),
    onText: handlers.onText,
    onError: handlers.onError,
  });
}

module.exports = { resolveLiveEngine, createLiveTranscriber };
