'use strict';

/**
 * Transcription failures travel to the renderer as stable codes; the UI owns
 * the wording (packages/i18n/locales/<lang>/transcriptions.json → errors.*).
 */

const TRANSCRIPTION_ERROR_CODES = new Set([
  'screen_capture_permission',
  'capture_sources_failed',
  'mic_permission_denied',
  'system_audio_unavailable',
  'no_audio_track',
  'missing_api_key',
  'missing_groq_key',
  'session_already_active',
  'session_not_found',
  'realtime_connection_failed',
  'transcription_failed',
]);

class TranscriptionError extends Error {
  /**
   * @param {string} code one of TRANSCRIPTION_ERROR_CODES
   * @param {string} [detail] provider / ffmpeg detail, logged but never shown
   */
  constructor(code, detail) {
    super(code);
    this.name = 'TranscriptionError';
    this.code = code;
    this.detail = detail || null;
  }
}

function toErrorCode(err, fallback = 'transcription_failed') {
  if (err?.code && TRANSCRIPTION_ERROR_CODES.has(err.code)) return err.code;
  if (TRANSCRIPTION_ERROR_CODES.has(err?.message)) return err.message;
  return fallback;
}

module.exports = { TRANSCRIPTION_ERROR_CODES, TranscriptionError, toErrorCode };
