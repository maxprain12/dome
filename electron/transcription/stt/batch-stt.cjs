'use strict';

/**
 * Batch STT over an OpenAI-compatible /v1/audio/transcriptions endpoint
 * (OpenAI, Groq or a custom base URL). Normalizes audio with ffmpeg and splits
 * files above the request size limit.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const { loadFfmpeg } = require('../ffmpeg.cjs');
const { TranscriptionError } = require('../errors.cjs');
const structured = require('./structured.cjs');
const config = require('./stt-config.cjs');

/** Margin under OpenAI's ~25 MB request limit. */
const MAX_REQUEST_BYTES = 24 * 1024 * 1024;

function getTempDir() {
  return path.join(app.getPath('temp'), 'dome-transcription');
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function requireFfmpeg() {
  const ff = loadFfmpeg();
  if (!ff) throw new TranscriptionError('transcription_failed', 'ffmpeg unavailable');
  return ff;
}

function probeDurationSeconds(filePath) {
  const ff = requireFfmpeg();
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

/** Mono 16 kHz MP3, optionally a [start, start+duration) slice. */
function toMonoMp3(inputPath, outputPath, range) {
  const ff = requireFfmpeg();
  return new Promise((resolve, reject) => {
    let cmd = ff(inputPath);
    if (range) cmd = cmd.setStartTime(Math.max(0, range.start)).duration(Math.max(0.1, range.duration));
    cmd
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('64k')
      .format('mp3')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}

// ─── HTTP request ────────────────────────────────────────────────────────

function isDiarizeModel(model) {
  return model === 'gpt-4o-transcribe-diarize';
}

/** gpt-4o-transcribe family only supports json/text (not verbose_json). */
function shouldTryVerboseJson(model, verbose) {
  return !/^gpt-4o(-mini)?-transcribe(-diarize)?$/.test(model) && verbose !== false;
}

function buildForm(fileBuffer, ctx, useVerbose) {
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', ctx.model);
  if (ctx.language) form.append('language', ctx.language);
  if (ctx.prompt) form.append('prompt', ctx.prompt);
  if (ctx.isDiarize) {
    form.append('response_format', 'diarized_json');
  } else if (useVerbose) {
    form.append('response_format', 'verbose_json');
    if (ctx.sttProvider === 'groq') {
      form.append('timestamp_granularities[]', 'segment');
      form.append('timestamp_granularities[]', 'word');
    }
  }
  return form;
}

function postTranscription(fileBuffer, apiKey, ctx, useVerbose) {
  return fetch(ctx.apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: buildForm(fileBuffer, ctx, useVerbose),
  });
}

async function readErrorDetail(res) {
  const body = await res.text().catch(() => '');
  try {
    const json = JSON.parse(body);
    return json.error?.message || body;
  } catch {
    return body || res.statusText;
  }
}

function normalizeSegments(data, isDiarize) {
  if (!Array.isArray(data.segments)) return [];
  return data.segments
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .map((s) => ({
      start: typeof s.start === 'number' ? s.start : 0,
      end: typeof s.end === 'number' ? s.end : 0,
      text: String(s.text).trim(),
      ...(isDiarize && typeof s.speaker === 'string' ? { speaker: s.speaker } : {}),
    }));
}

/**
 * One request for an MP3 buffer (≤ MAX_REQUEST_BYTES).
 * @returns {Promise<{ text: string, whisperSegments: Array<{ start: number, end: number, text: string, speaker?: string }>, duration: number|null, language: string|null }>}
 */
async function transcMp3BufferDetailed(fileBuffer, apiKey, opts = {}) {
  const model = opts.model || config.DEFAULT_OPENAI_MODEL;
  const ctx = {
    model,
    language: opts.language?.trim() || null,
    prompt: opts.prompt?.trim() || null,
    apiUrl: opts.apiUrl || `${config.DEFAULT_OPENAI_ORIGIN}/v1/audio/transcriptions`,
    sttProvider: opts.sttProvider || 'openai',
    isDiarize: isDiarizeModel(model),
  };
  const tryVerbose = shouldTryVerboseJson(model, opts.verbose);

  let res = await postTranscription(fileBuffer, apiKey, ctx, tryVerbose);
  if (tryVerbose && res.status === 400) {
    const body = await res.clone().text().catch(() => '');
    if (/response_format|verbose|json/i.test(body)) res = await postTranscription(fileBuffer, apiKey, ctx, false);
  }
  if (!res.ok) {
    throw new TranscriptionError('transcription_failed', `${res.status} ${await readErrorDetail(res)}`);
  }

  const data = await res.json();
  if (typeof data.text !== 'string') throw new TranscriptionError('transcription_failed', 'response without text');

  const text = data.text.trim();
  const duration = typeof data.duration === 'number' && Number.isFinite(data.duration) ? data.duration : null;
  let whisperSegments = normalizeSegments(data, ctx.isDiarize);
  if (!whisperSegments.length && text) whisperSegments = [{ start: 0, end: duration ?? 0, text }];
  return { text, whisperSegments, duration, language: typeof data.language === 'string' ? data.language : null };
}

// ─── File transcription ──────────────────────────────────────────────────

/** Single source → one speaker; mic + system → at most two alternating speakers. */
function buildHeuristicSpeakerOpts(captureSources, pauseThresholdSec) {
  const hasMic = captureSources.includes('mic');
  const hasSys = captureSources.includes('system');
  if (hasMic && hasSys) return { pauseThresholdSec, speakerMode: 'alternating', maxSpeakers: 2 };
  if (hasMic || hasSys) return { pauseThresholdSec, speakerMode: 'single' };
  return { pauseThresholdSec, speakerMode: 'alternating', maxSpeakers: 8 };
}

function resolveRequest(options) {
  const database = options.database || null;
  const sttProvider = database ? config.getTranscriptionSttProvider(database) : options.sttProvider || 'openai';
  const apiKey = options.apiKey || config.getTranscriptionApiKey(database, sttProvider);
  if (!apiKey) throw new TranscriptionError(sttProvider === 'groq' ? 'missing_groq_key' : 'missing_api_key');

  let prompt = options.prompt === undefined ? config.getTranscriptionPromptFromDb(database) : options.prompt;
  if (typeof prompt === 'string' && !prompt.trim()) prompt = null;

  return {
    apiKey,
    sttProvider,
    apiUrl: options.apiUrl || config.resolveTranscriptionsUrl(database, sttProvider),
    prompt,
    model: options.model || config.getTranscriptionModel(database, sttProvider),
    language: options.language ?? config.getTranscriptionLanguage(database),
    pauseThresholdSec: Number.isFinite(options.pauseThresholdSec)
      ? options.pauseThresholdSec
      : config.getPauseThresholdFromDb(database),
    captureSources: Array.isArray(options.captureSources)
      ? options.captureSources.filter((s) => s === 'mic' || s === 'system')
      : [],
  };
}

async function transcribeSingleRequest(normalizedPath, req) {
  const detail = await transcMp3BufferDetailed(fs.readFileSync(normalizedPath), req.apiKey, req);
  const durationSec = detail.duration > 0
    ? detail.duration
    : await probeDurationSeconds(normalizedPath).catch(() => 0);
  const turns = detail.whisperSegments.some((s) => s.speaker)
    ? structured.fromDiarizedSegments(detail.whisperSegments)
    : structured.applyAlternatingSpeakerHeuristic(
      detail.whisperSegments,
      buildHeuristicSpeakerOpts(req.captureSources, req.pauseThresholdSec),
    );
  return {
    text: structured.segmentsToPlainText(turns.segments) || detail.text,
    structured: { version: 1, ...turns, durationSec: durationSec || undefined },
  };
}

async function transcribeInSlices(normalizedPath, sizeBytes, req, tempDir, baseName) {
  const duration = await probeDurationSeconds(normalizedPath);
  if (!duration || duration <= 0) throw new TranscriptionError('transcription_failed', 'unknown duration');

  const numChunks = Math.max(2, Math.ceil(sizeBytes / MAX_REQUEST_BYTES));
  const sliceSeconds = Math.max(30, Math.ceil(duration / numChunks) + 1);
  const allRaw = [];
  for (let start = 0; start < duration; start += sliceSeconds) {
    const segPath = path.join(tempDir, `${baseName}-seg-${start}.mp3`);
    try {
      await toMonoMp3(normalizedPath, segPath, { start, duration: Math.min(sliceSeconds, duration - start) });
      if (fs.statSync(segPath).size > MAX_REQUEST_BYTES) {
        throw new TranscriptionError('transcription_failed', 'segment above request limit');
      }
      const detail = await transcMp3BufferDetailed(fs.readFileSync(segPath), req.apiKey, req);
      for (const s of detail.whisperSegments) allRaw.push({ start: start + s.start, end: start + s.end, text: s.text });
    } finally {
      safeUnlink(segPath);
    }
  }
  const turns = structured.applyAlternatingSpeakerHeuristic(
    allRaw,
    buildHeuristicSpeakerOpts(req.captureSources, req.pauseThresholdSec),
  );
  return {
    text: structured.segmentsToPlainText(turns.segments),
    structured: { version: 1, ...turns, durationSec: duration },
  };
}

/**
 * Transcribe the audio file at `inputAbsolutePath`.
 * @param {string} inputAbsolutePath
 * @param {{ database?: object, apiKey?: string, model?: string, language?: string|null, apiUrl?: string, prompt?: string|null, pauseThresholdSec?: number, captureSources?: Array<'mic'|'system'>, sttProvider?: string }} options
 * @returns {Promise<{ text: string, structured: object }>}
 */
async function transcribeFilePath(inputAbsolutePath, options = {}) {
  const req = resolveRequest(options);
  if (!fs.existsSync(inputAbsolutePath)) throw new TranscriptionError('transcription_failed', 'audio file not found');
  requireFfmpeg();

  const tempDir = getTempDir();
  ensureDir(tempDir);
  const baseName = `dome-stt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const normalizedPath = path.join(tempDir, `${baseName}.mp3`);
  try {
    try {
      await toMonoMp3(inputAbsolutePath, normalizedPath);
    } catch (e) {
      throw new TranscriptionError('transcription_failed', `conversion: ${e.message}`);
    }
    const size = fs.statSync(normalizedPath).size;
    return size <= MAX_REQUEST_BYTES
      ? await transcribeSingleRequest(normalizedPath, req)
      : await transcribeInSlices(normalizedPath, size, req, tempDir, baseName);
  } finally {
    safeUnlink(normalizedPath);
  }
}

/** Transcribe an in-memory recording (e.g. MediaRecorder) via a temp file. */
async function transcribeBuffer(buffer, suggestedExtension, database, transcriptionOptions = {}) {
  const tempDir = getTempDir();
  ensureDir(tempDir);
  const ext = (suggestedExtension || 'webm').replace(/^\./, '') || 'webm';
  const inPath = path.join(tempDir, `dome-rec-${Date.now()}.${ext}`);
  fs.writeFileSync(inPath, buffer);
  try {
    return await transcribeFilePath(inPath, { ...transcriptionOptions, database });
  } finally {
    safeUnlink(inPath);
  }
}

module.exports = {
  MAX_REQUEST_BYTES,
  transcMp3BufferDetailed,
  transcribeFilePath,
  transcribeBuffer,
};
