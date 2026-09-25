import type { TFunction } from 'i18next';

/** Error codes returned by `transcription:*` IPC and the capture controller. */
export const TRANSCRIPTION_ERROR_CODES = [
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
] as const;

export type TranscriptionErrorCode = (typeof TRANSCRIPTION_ERROR_CODES)[number];

const KNOWN = new Set<string>(TRANSCRIPTION_ERROR_CODES);

export function isTranscriptionErrorCode(value: unknown): value is TranscriptionErrorCode {
  return typeof value === 'string' && KNOWN.has(value);
}

/** Human message for a code (or a legacy free-form error) in the current UI language. */
export function transcriptionErrorMessage(t: TFunction, error: unknown): string {
  if (isTranscriptionErrorCode(error)) return t(`transcriptions.errors.${error}`);
  return t('transcriptions.errors.transcription_failed');
}
