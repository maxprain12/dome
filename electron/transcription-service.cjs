/* eslint-disable no-console */
/**
 * Transcription via OpenAI Speech-to-Text API.
 * Normalizes arbitrary audio with ffmpeg, handles large files by chunking.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const transcriptionStructured = require('./transcription-structured.cjs');

const DEFAULT_OPENAI_ORIGIN = 'https://api.openai.com';
/** Groq OpenAI-compatible STT origin */
const DEFAULT_GROQ_ORIGIN = 'https://api.groq.com';
/** Default balanced STT model on Groq (speed/cost vs quality) */
const DEFAULT_GROQ_MODEL = 'whisper-large-v3-turbo';
/** Leave margin under OpenAI's ~25 MB limit */
const MAX_REQUEST_BYTES = 24 * 1024 * 1024;
/** Default segment length (seconds) when chunking long files */
const DEFAULT_CHUNK_SECONDS = 480;

let ffmpeg = null;

function loadFfmpeg() {
  if (ffmpeg !== null) return ffmpeg;
  try {
    const fluent = require('fluent-ffmpeg');
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    fluent.setFfmpegPath(ffmpegInstaller.path);
    ffmpeg = fluent;
    return ffmpeg;
  } catch (e) {
    console.warn('[Transcription] ffmpeg not available:', e?.message);
    ffmpeg = false;
    return null;
  }
}

/**
 * Resolve OpenAI API key: dedicated transcription key, then primary AI key when provider is openai, else fallbacks.
 * @param {Object} database
 * @returns {string|null}
 */
function getOpenAIKeyForTranscription(database) {
  try {
    const queries = database.getQueries();
    const dedicated = queries.getSetting.get('transcription_openai_api_key');
    if (dedicated?.value && String(dedicated.value).trim()) {
      return String(dedicated.value).trim();
    }
    const providerRow = queries.getSetting.get('ai_provider');
    if (providerRow?.value === 'openai') {
      const k = queries.getSetting.get('ai_api_key')?.value;
      if (k) return String(k).trim();
    }
    const openaiLegacy = queries.getSetting.get('openai_api_key')?.value;
    if (openaiLegacy) return String(openaiLegacy).trim();
    const any = queries.getSetting.get('ai_api_key')?.value;
    if (any) return String(any).trim();
  } catch (err) {
    console.error('[Transcription] Key lookup error:', err);
  }
  return null;
}

/**
 * STT backend: OpenAI, Groq (OpenAI-compatible /v1/audio/transcriptions), or custom base URL.
 * @param {Object|null} database
 * @returns {'openai'|'groq'|'custom'}
 */
function getTranscriptionSttProvider(database) {
  if (!database) return 'openai';
  try {
    const row = database.getQueries().getSetting.get('transcription_stt_provider');
    const v = row?.value && String(row.value).trim().toLowerCase();
    if (v === 'groq' || v === 'openai' || v === 'custom') return v;
    const baseRow = database.getQueries().getSetting.get('transcription_api_base_url');
    const raw = baseRow?.value && String(baseRow.value).trim().toLowerCase();
    if (raw && raw.includes('groq')) return 'groq';
    return 'openai';
  } catch {
    return 'openai';
  }
}

/**
 * API key for the active STT provider (Groq uses a dedicated key).
 * @param {Object|null} database
 * @param {'openai'|'groq'|'custom'|undefined} [providerHint]
 * @returns {string|null}
 */
function getTranscriptionApiKey(database, providerHint) {
  const p = providerHint || (database ? getTranscriptionSttProvider(database) : 'openai');
  if (p === 'groq') {
    if (!database) return null;
    try {
      const row = database.getQueries().getSetting.get('transcription_groq_api_key');
      if (row?.value && String(row.value).trim()) return String(row.value).trim();
    } catch (err) {
      console.error('[Transcription] Groq key lookup error:', err);
    }
    return null;
  }
  return getOpenAIKeyForTranscription(database);
}

/**
 * Full URL for POST /v1/audio/transcriptions (OpenAI-compatible endpoint).
 * Setting transcription_api_base_url: origin only (e.g. https://api.openai.com) or full URL ending in /audio/transcriptions.
 * @param {Object|null} database
 * @param {'openai'|'groq'|'custom'|undefined} [forcedProvider]
 * @returns {string}
 */
function resolveTranscriptionsUrl(database, forcedProvider) {
  const provider = forcedProvider || (database ? getTranscriptionSttProvider(database) : 'openai');
  const defaultOrigin = provider === 'groq' ? DEFAULT_GROQ_ORIGIN : DEFAULT_OPENAI_ORIGIN;
  const defaultUrl = `${defaultOrigin}/v1/audio/transcriptions`;
  if (!database) return defaultUrl;
  try {
    const row = database.getQueries().getSetting.get('transcription_api_base_url');
    const raw = row?.value && String(row.value).trim() ? String(row.value).trim() : '';
    if (!raw) return defaultUrl;
    if (/\/audio\/transcriptions/i.test(raw)) {
      return raw.replace(/\/$/, '');
    }
    const base = raw.replace(/\/$/, '');
    return `${base}/v1/audio/transcriptions`;
  } catch {
    return defaultUrl;
  }
}

/**
 * Optional Whisper prompt (vocabulary / style hint) from settings.
 * @param {Object|null} database
 * @returns {string|null}
 */
function getTranscriptionPromptFromDb(database) {
  if (!database) return null;
  try {
    const row = database.getQueries().getSetting.get('transcription_prompt');
    const p = row?.value && String(row.value).trim() ? String(row.value).trim() : '';
    return p || null;
  } catch {
    return null;
  }
}

/** Pausa mínima (s) para alternar hablante heurístico */
function getPauseThresholdFromDb(database) {
  if (!database) return 1.35;
  try {
    const row = database.getQueries().getSetting.get('transcription_pause_threshold_sec');
    const v = parseFloat(String(row?.value || ''));
    if (Number.isFinite(v) && v >= 0.4 && v <= 8) return v;
  } catch {
    /* */
  }
  return 1.35;
}

function getTempDir() {
  return path.join(app.getPath('temp'), 'dome-transcription');
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/**
 * @param {string} filePath
 * @returns {Promise<number>} duration in seconds
 */
function probeDurationSeconds(filePath) {
  const ff = loadFfmpeg();
  if (!ff) return Promise.reject(new Error('ffmpeg is not available'));

  return new Promise((resolve, reject) => {
    ff.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const d = metadata?.format?.duration;
      resolve(typeof d === 'number' && Number.isFinite(d) ? d : 0);
    });
  });
}

/**
 * Convert input to mono MP3 suitable for Whisper (small, compatible).
 * @param {string} inputPath
 * @param       {string} outputPath
 */
function normalizeToMp3(inputPath, outputPath) {
  const ff = loadFfmpeg();
  if (!ff) return Promise.reject(new Error('ffmpeg is not available'));

  return new Promise((resolve, reject) => {
    ff(inputPath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('64k')
      .format('mp3')
      .on('end', () => resolve(outputPath))
      .on('error', (e) => reject(e))
      .save(outputPath);
  });
}

/**
 * Extract [start, start+duration) to mp3
 */
function extractSegmentMp3(inputPath, outputPath, startSec, durationSec) {
  const ff = loadFfmpeg();
  if (!ff) return Promise.reject(new Error('ffmpeg is not available'));

  return new Promise((resolve, reject) => {
    ff(inputPath)
      .setStartTime(Math.max(0, startSec))
      .duration(Math.max(0.1, durationSec))
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('64k')
      .format('mp3')
      .on('end', () => resolve(outputPath))
      .on('error', (e) => reject(e))
      .save(outputPath);
  });
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {Buffer} fileBuffer
 * @param {string} apiKey
 * @param {{ model?: string, language?: string|null, apiUrl?: string, prompt?: string|null, verbose?: boolean, sttProvider?: 'openai'|'groq'|'custom' }} opts
 * @returns {Promise<{ text: string, whisperSegments: Array<{ start: number, end: number, text: string }>, duration: number|null, language: string|null }>}
 */
async function transcMp3BufferDetailed(fileBuffer, apiKey, opts = {}) {
  const model = opts.model || 'whisper-1';
  const language = opts.language && String(opts.language).trim() ? String(opts.language).trim() : null;
  const apiUrl = opts.apiUrl || `${DEFAULT_OPENAI_ORIGIN}/v1/audio/transcriptions`;
  const prompt = opts.prompt && String(opts.prompt).trim() ? String(opts.prompt).trim() : null;
  const tryVerbose = opts.verbose !== false;
  const sttProvider = opts.sttProvider || 'openai';

  async function doRequest(useVerbose) {
    const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
    const form = new FormData();
    form.append('file', blob, 'audio.mp3');
    form.append('model', model);
    if (language) form.append('language', language);
    if (prompt) form.append('prompt', prompt);
    if (useVerbose) {
      try {
        form.append('response_format', 'verbose_json');
      } catch (_) {
        /* FormData may vary */
      }
      if (sttProvider === 'groq') {
        try {
          form.append('timestamp_granularities[]', 'segment');
          form.append('timestamp_granularities[]', 'word');
        } catch (_) {
          /* */
        }
      }
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
    return res;
  }

  let res = await doRequest(tryVerbose);
  if (!res.ok && tryVerbose && res.status === 400) {
    let body = '';
    try {
      body = await res.clone().text();
    } catch (_) {
      /* */
    }
    if (/response_format|verbose|json/i.test(body)) {
      res = await doRequest(false);
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.error?.message || JSON.stringify(j);
    } catch (_) {
      try {
        detail = await res.text();
      } catch (_) {
        /* */
      }
    }
    throw new Error(`Transcription failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  if (typeof data.text !== 'string') {
    throw new Error('Transcription: unexpected response (no text)');
  }

  const text = data.text.trim();
  /** @type {Array<{ start: number, end: number, text: string }>} */
  let whisperSegments = [];
  if (Array.isArray(data.segments)) {
    whisperSegments = data.segments
      .filter((s) => s && typeof s.text === 'string' && String(s.text).trim())
      .map((s) => ({
        start: typeof s.start === 'number' ? s.start : 0,
        end: typeof s.end === 'number' ? s.end : 0,
        text: String(s.text).trim(),
      }));
  }

  const duration = typeof data.duration === 'number' && Number.isFinite(data.duration) ? data.duration : null;
  const languageOut = typeof data.language === 'string' ? data.language : null;

  if (!whisperSegments.length && text) {
    whisperSegments = [{ start: 0, end: duration != null ? duration : 0, text }];
  }

  return {
    text,
    whisperSegments,
    duration,
    language: languageOut,
  };
}

/**
 * Transcribe audio file at absolute path.
 * @param {string} inputAbsolutePath
 * @param {Object} options
 * @param {string} options.apiKey
 * @param {string} [options.model]
 * @param {string|null} [options.language] - ISO-639-1 or omit for auto
 * @param {Object|null} [options.database] - when set, resolves API URL and prompt from settings
 * @param {string} [options.apiUrl] - overrides URL from database
 * @param {string|null} [options.prompt] - overrides prompt from database
 * @returns {Promise<{ text: string, structured: Object }>}
 */
async function transcribeFilePath(inputAbsolutePath, options) {
  const database = options.database || null;
  const sttProvider = database ? getTranscriptionSttProvider(database) : options.sttProvider || 'openai';
  const apiKey = options.apiKey || (database ? getTranscriptionApiKey(database, sttProvider) : null);
  if (!apiKey) throw new Error('STT API key not configured for the selected provider');

  const apiUrl = options.apiUrl || resolveTranscriptionsUrl(database, sttProvider);
  let prompt = options.prompt;
  if (prompt === undefined) {
    prompt = getTranscriptionPromptFromDb(database);
  } else if (prompt !== null && typeof prompt === 'string' && !prompt.trim()) {
    prompt = null;
  }

  if (!fs.existsSync(inputAbsolutePath)) {
    throw new Error('Audio file not found');
  }

  const ff = loadFfmpeg();
  if (!ff) {
    throw new Error('ffmpeg is required for audio transcription. Reinstall dependencies.');
  }

  const tempDir = getTempDir();
  ensureDir(tempDir);
  const baseName = `dome-stt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const normalizedPath = path.join(tempDir, `${baseName}.mp3`);

  try {
    await normalizeToMp3(inputAbsolutePath, normalizedPath);
  } catch (e) {
    safeUnlink(normalizedPath);
    throw new Error(`Audio conversion failed: ${e.message}`);
  }

  const stat = fs.statSync(normalizedPath);
  const model =
    options.model ||
    (sttProvider === 'groq' ? DEFAULT_GROQ_MODEL : 'whisper-1');
  const language = options.language ?? null;

  try {
    const pauseThresholdSec =
      options.pauseThresholdSec != null && Number.isFinite(options.pauseThresholdSec)
        ? options.pauseThresholdSec
        : getPauseThresholdFromDb(database);

    if (stat.size <= MAX_REQUEST_BYTES) {
      const buf = fs.readFileSync(normalizedPath);
      const detail = await transcMp3BufferDetailed(buf, apiKey, {
        model,
        language,
        apiUrl,
        prompt,
        sttProvider,
      });
      const probed =
        detail.duration != null && detail.duration > 0
          ? detail.duration
          : await probeDurationSeconds(normalizedPath).catch(() => 0);
      const { segments, speakers, diarization } = transcriptionStructured.applyAlternatingSpeakerHeuristic(
        detail.whisperSegments,
        { pauseThresholdSec },
      );
      const text = transcriptionStructured.segmentsToPlainText(segments) || detail.text;
      return {
        text,
        structured: {
          version: 1,
          segments,
          speakers,
          diarization,
          durationSec: probed || undefined,
        },
      };
    }

    const duration = await probeDurationSeconds(normalizedPath);
    if (!duration || duration <= 0) {
      throw new Error('Could not read audio duration for chunking');
    }

    const numChunks = Math.max(2, Math.ceil(stat.size / MAX_REQUEST_BYTES));
    const chunkSeconds = Math.max(30, Math.ceil(duration / numChunks) + 1);

    /** @type {Array<{ start: number, end: number, text: string }>} */
    const allRaw = [];
    for (let start = 0; start < duration; start += chunkSeconds) {
      const segPath = path.join(tempDir, `${baseName}-seg-${start}.mp3`);
      const len = Math.min(chunkSeconds, duration - start);
      try {
        await extractSegmentMp3(normalizedPath, segPath, start, len);
        const segStat = fs.statSync(segPath);
        if (segStat.size > MAX_REQUEST_BYTES) {
          throw new Error('Audio segment still too large after splitting; try a shorter recording or lower quality source.');
        }
        const buf = fs.readFileSync(segPath);
        const detail = await transcMp3BufferDetailed(buf, apiKey, {
          model,
          language,
          apiUrl,
          prompt,
          sttProvider,
        });
        for (const s of detail.whisperSegments) {
          allRaw.push({
            start: start + s.start,
            end: start + s.end,
            text: s.text,
          });
        }
      } finally {
        safeUnlink(segPath);
      }
    }

    const { segments, speakers, diarization } = transcriptionStructured.applyAlternatingSpeakerHeuristic(
      allRaw,
      { pauseThresholdSec },
    );
    const text = transcriptionStructured.segmentsToPlainText(segments);
    return {
      text,
      structured: {
        version: 1,
        segments,
        speakers,
        diarization,
        durationSec: duration,
      },
    };
  } finally {
    safeUnlink(normalizedPath);
  }
}

/**
 * Transcribe uploaded buffer (e.g. MediaRecorder). Writes temp file then runs transcribeFilePath.
 * @param {Buffer} buffer
 * @param {string} suggestedExtension - e.g. webm, wav
 */
async function transcribeBuffer(buffer, suggestedExtension, database, transcriptionOptions = {}) {
  const apiKey =
    transcriptionOptions.apiKey ||
    (database ? getTranscriptionApiKey(database) : null);
  if (!apiKey) throw new Error('STT API key not configured for the selected provider');

  const tempDir = getTempDir();
  ensureDir(tempDir);
  const ext = (suggestedExtension || 'webm').replace(/^\./, '') || 'webm';
  const inPath = path.join(tempDir, `dome-rec-${Date.now()}.${ext}`);
  fs.writeFileSync(inPath, buffer);
  try {
    return await transcribeFilePath(inPath, {
      apiKey,
      model: transcriptionOptions.model,
      language: transcriptionOptions.language,
      database,
    });
  } finally {
    safeUnlink(inPath);
  }
}

module.exports = {
  loadFfmpeg,
  getOpenAIKeyForTranscription,
  getTranscriptionSttProvider,
  getTranscriptionApiKey,
  resolveTranscriptionsUrl,
  getTranscriptionPromptFromDb,
  getPauseThresholdFromDb,
  transcribeFilePath,
  transcribeBuffer,
  transcMp3BufferDetailed,
  MAX_REQUEST_BYTES,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_ORIGIN,
};
