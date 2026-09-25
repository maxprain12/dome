'use strict';

/**
 * STT settings resolved from SQLite. Single source for provider, key, endpoint,
 * model, prompt and live engine so session, batch and realtime paths agree.
 */

const { getOpenAIKey } = require('../../ai/openai-key.cjs');
const { readSettingSecret } = require('../../core/settings-secrets.cjs');

const DEFAULT_OPENAI_ORIGIN = 'https://api.openai.com';
const DEFAULT_GROQ_ORIGIN = 'https://api.groq.com';
const DEFAULT_OPENAI_MODEL = 'whisper-1';
const DEFAULT_GROQ_MODEL = 'whisper-large-v3-turbo';
const DEFAULT_PAUSE_THRESHOLD = 1.35;

/** Models accepted by the Realtime transcription session. */
const REALTIME_MODELS = new Set(['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1']);
const DEFAULT_REALTIME_MODEL = 'gpt-4o-mini-transcribe';

const LIVE_ENGINES = new Set(['realtime', 'chunks']);

function readSetting(database, key) {
  if (!database) return '';
  try {
    const row = database.getQueries().getSetting.get(key);
    return row?.value == null ? '' : String(row.value).trim();
  } catch {
    return '';
  }
}

/** @returns {'openai'|'groq'|'custom'} */
function getTranscriptionSttProvider(database) {
  const v = readSetting(database, 'transcription_stt_provider').toLowerCase();
  if (v === 'local-gemma') return 'openai';
  if (v === 'groq' || v === 'openai' || v === 'custom') return v;
  if (readSetting(database, 'transcription_api_base_url').toLowerCase().includes('groq')) return 'groq';
  return 'openai';
}

/** API key for the active (or hinted) STT provider; Groq has its own key. */
function getTranscriptionApiKey(database, providerHint) {
  const provider = providerHint || getTranscriptionSttProvider(database);
  if (!database) return null;
  if (provider === 'groq') return readSettingSecret(database.getQueries(), 'transcription_groq_api_key');
  return getOpenAIKey(database);
}

/** Full POST URL for the OpenAI-compatible /v1/audio/transcriptions endpoint. */
function resolveTranscriptionsUrl(database, forcedProvider) {
  const provider = forcedProvider || getTranscriptionSttProvider(database);
  const origin = provider === 'groq' ? DEFAULT_GROQ_ORIGIN : DEFAULT_OPENAI_ORIGIN;
  const raw = readSetting(database, 'transcription_api_base_url');
  if (!raw) return `${origin}/v1/audio/transcriptions`;
  if (/\/audio\/transcriptions/i.test(raw)) return raw.replace(/\/$/, '');
  return `${raw.replace(/\/$/, '')}/v1/audio/transcriptions`;
}

function getTranscriptionModel(database, provider = getTranscriptionSttProvider(database)) {
  return readSetting(database, 'transcription_model')
    || (provider === 'groq' ? DEFAULT_GROQ_MODEL : DEFAULT_OPENAI_MODEL);
}

function getTranscriptionLanguage(database) {
  return readSetting(database, 'transcription_language') || null;
}

function getTranscriptionPromptFromDb(database) {
  return readSetting(database, 'transcription_prompt') || null;
}

function getPauseThresholdFromDb(database) {
  const v = Number.parseFloat(readSetting(database, 'transcription_pause_threshold_sec'));
  return Number.isFinite(v) && v >= 0.4 && v <= 8 ? v : DEFAULT_PAUSE_THRESHOLD;
}

/** Stored preference: 'realtime' (default) streams to OpenAI; 'chunks' re-transcribes recorded chunks. */
function getLiveEnginePreference(database) {
  const v = readSetting(database, 'transcription_live_engine').toLowerCase();
  return LIVE_ENGINES.has(v) ? v : 'realtime';
}

function getRealtimeModel(database) {
  const model = readSetting(database, 'transcription_model');
  return REALTIME_MODELS.has(model) ? model : DEFAULT_REALTIME_MODEL;
}

module.exports = {
  DEFAULT_OPENAI_ORIGIN,
  DEFAULT_GROQ_ORIGIN,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_PAUSE_THRESHOLD,
  REALTIME_MODELS,
  LIVE_ENGINES,
  readSetting,
  getTranscriptionSttProvider,
  getTranscriptionApiKey,
  resolveTranscriptionsUrl,
  getTranscriptionModel,
  getTranscriptionLanguage,
  getTranscriptionPromptFromDb,
  getPauseThresholdFromDb,
  getLiveEnginePreference,
  getRealtimeModel,
};
