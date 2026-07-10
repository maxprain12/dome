/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const fileStorage = require('../storage/file-storage.cjs');
const pdfExtractor = require('../documents/pdf-extractor.cjs');
const database = require('../core/database.cjs');
const cloudLlm = require('./cloud-llm.service.cjs');
const cloudLlmTasks = require('./cloud-llm-tasks.cjs');

const SCALE = 1.35;

/** Remove chain-of-thought / reasoning blocks leaked into OCR output before persisting or serving */
function stripVisionModelNoise(raw) {
  let s = String(raw || '').replace(/\u200c|\uFEFF/g, '');
  s = s.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '');
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/** True when stored transcript is unusable as document text for tools (instructions + leaked reasoning). */
function storedPdfVisionTranscriptLooksCorrupted(body) {
  const s = String(body || '').trim();
  if (!s) return false;
  const pageMarkers = (s.match(/<!--\s*page:\d+\s*-->/gi) || []).length;
  const noImageHits = (s.match(/no\s+(?:puedo\s+)?ver\s+(?:ninguna\s+)?imagen\b/gi) || []).length;
  if (pageMarkers >= 4 && noImageHits >= 2) return true;
  if (
    pageMarkers >= 4 &&
    /renderizada como imagen\.?\s*(?:Transcribe|transcribe)/i.test(s) &&
    /documento\s+PDF/i.test(s)
  )
    return true;
  return false;
}

/** Non-whitespace printable body length after stripping page markers. */
function pdfJsMeaningfulLength(text) {
  const plain = String(text || '')
    .replace(/<!--\s*page:\d+\s*-->/gi, ' ')
    .replace(/\s+/g, '')
    .trim();
  return plain.length;
}

/**
 * Infer whether pdf.js text layer yielded enough usable text vs likely scan-only PDF.
 * Loose thresholds: academic PDFs dominate on text length; scanned pages hover near zero.
 */
function pdfJsExtractIsInsufficient(text, numPages) {
  const n = Math.max(1, Number(numPages) || 1);
  const meaningful = pdfJsMeaningfulLength(text);
  if (meaningful < 18) return true;
  const avg = meaningful / n;
  if (n <= 2 && meaningful >= 120) return false;
  if (meaningful >= 400) return false;
  return avg < 32;
}

function getModelVersionLabel() {
  const q = database.getQueries();
  const p = String(q.getSetting.get('ai_provider')?.value || 'cloud');
  const m = String(q.getSetting.get('ai_model')?.value || 'default');
  return `cloud:${p}:${m}`;
}

function resolveVisionOcrAvailable(queries) {
  if (!cloudLlm.isCloudLlmAvailable(() => queries)) return false;
  const cfg = cloudLlm.resolveConfig(() => queries);
  return cloudLlm.isVisionSupportedProviderId(cfg.provider);
}

/**
 * @param {*} queries
 * @param {string} resourceId
 * @param {string} nextContent
 * @param {Record<string, unknown>} indexingPatch merged into metadata.pdf_indexing
 */
function finalizePdfIndexingState(queries, resourceId, nextContent, indexingPatch) {
  try {
    const row = queries.getResourceById.get(resourceId);
    if (!row) return;
    const now = Date.now();
    let meta = {};
    try {
      meta = row.metadata ? JSON.parse(row.metadata) : {};
    } catch {
      meta = {};
    }
    meta.pdf_indexing = {
      ...(typeof meta.pdf_indexing === 'object' && meta.pdf_indexing !== null ? meta.pdf_indexing : {}),
      ...indexingPatch,
      updated_at: now,
    };
    queries.updateResource.run(row.title || 'Untitled', nextContent ?? '', JSON.stringify(meta), now, resourceId);
  } catch (e) {
    console.warn('[pdf-transcription] finalizePdfIndexingState', e?.message || e);
  }
}

/**
 * @param {string} fullPath
 * @param {number} numPages
 */
async function buildPdfjsMarkedText(fullPath, numPages) {
  const session = await pdfExtractor.openPdfDocument(fullPath);
  if (!session) {
    const r = await pdfExtractor.extractPdfText(fullPath, { maxChars: numPages * 100000 });
    return r.success && r.text ? r.text : '';
  }
  const parts = [];
  try {
    for (let p = 1; p <= numPages; p++) {
      const t = await pdfExtractor.extractTextFromDocPage(session.doc, p, 100000);
      parts.push(`<!-- page:${p} -->\n\n${t.trim()}`);
      if (p % 10 === 0) await new Promise((r) => setImmediate(r));
    }
  } finally {
    await pdfExtractor.destroyPdfDocument(session.doc);
  }
  return parts.join('\n\n');
}

/**
 * @param {{ onProgress?: unknown }} opts
 * @returns {((p: { done: number, total: number, page: number }) => void) | null}
 */
function getEffectiveOnProgress(opts) {
  return typeof opts.onProgress === 'function' ? opts.onProgress : null;
}

/**
 * @param {{ type?: unknown; internal_path?: unknown }} resource
 * @returns {string|null}
 */
function resolvePdfInput(resource) {
  if (!resource || resource.type !== 'pdf' || !resource.internal_path) return null;
  const fullPath = fileStorage.getFullPath(resource.internal_path);
  return fullPath && fs.existsSync(fullPath) ? fullPath : null;
}

/**
 * @param {string} fullPath
 * @returns {Promise<number>}
 */
async function loadPdfPageCount(fullPath) {
  const meta = await pdfExtractor.getPdfMetadata(fullPath);
  if (!meta.success || !meta.metadata?.pageCount) return 0;
  return Math.max(1, Number(meta.metadata.pageCount) || 1);
}

function deleteTranscriptsQuietly(queries, resourceId) {
  try {
    queries.deleteResourceTranscripts.run(resourceId);
  } catch {
    /* */
  }
}

/**
 * @param {string} resourceId
 * @param {ReturnType<import('../core/database.cjs')['getQueries']>} queries
 * @param {string} fullPath
 * @param {number} numPages
 * @returns {Promise<{ text: string; source: string } | null>}
 */
async function tryFinalizeWithPdfjs(resourceId, queries, fullPath, numPages) {
  const pdfJsText = await buildPdfjsMarkedText(fullPath, numPages);
  if (pdfJsExtractIsInsufficient(pdfJsText, numPages)) return null;
  deleteTranscriptsQuietly(queries, resourceId);
  finalizePdfIndexingState(queries, resourceId, pdfJsText, {
    status: 'ok',
    text_source: 'pdfjs',
  });
  return { text: pdfJsText, source: 'pdfjs' };
}

/**
 * @param {ReturnType<import('../core/database.cjs')['getQueries']>} queries
 * @param {string} resourceId
 * @returns {{ text: string; source: string }}
 */
function buildBlockedNoVisionOcrResult(queries, resourceId) {
  finalizePdfIndexingState(queries, resourceId, '', {
    status: 'blocked_no_vision_ocr',
    text_source: 'none',
    blocked_reason: 'pdfjs_insufficient_no_ocr_provider',
    user_hint_es:
      'Este PDF tiene poco o ningún texto seleccionable. Para indexarlo necesitas un proveedor de IA con soporte ' +
      'de imagen/OCR en Ajustes (OpenAI, Anthropic, Google, MiniMax u Ollama con modelo de visión, o sesión Dome con modelo multimodal). ' +
      'Sin eso Dome no ejecuta OCR del modelo sobre las páginas.',
  });
  deleteTranscriptsQuietly(queries, resourceId);
  return { text: '', source: 'blocked_no_vision_ocr' };
}

/**
 * @param {ReturnType<import('../core/database.cjs')['getQueries']>} queries
 * @param {string} resourceId
 * @param {string} fileHash
 * @param {number} numPages
 * @returns {{ text: string; source: string } | null}
 */
function tryFinalizeWithCachedVisionOcr(queries, resourceId, fileHash, numPages) {
  if (!fileHash || numPages <= 0) return null;
  const cachedCount = queries.countResourceTranscriptsForHash.get(resourceId, fileHash || '__none__');
  const cached = Number(cachedCount?.c ?? 0);
  if (cached !== numPages) return null;
  const rows = queries.getResourceTranscriptsByResource.all(resourceId);
  if (rows.length !== numPages) return null;
  const text = rows
    .map((row) => {
      const md = stripVisionModelNoise(row.markdown || '');
      return `<!-- page:${row.page_number} -->\n\n${md}`;
    })
    .join('\n\n');
  if (!text.trim() || storedPdfVisionTranscriptLooksCorrupted(text)) return null;
  finalizePdfIndexingState(queries, resourceId, text, {
    status: 'ok',
    text_source: 'vision_ocr_cached',
  });
  return { text, source: 'cloud_pdf_transcript_cached' };
}

/**
 * @param {unknown} docSession
 * @param {string} fullPath
 * @param {number} p
 */
function renderPdfPageOrFallback(docSession, fullPath, p) {
  if (docSession) {
    return pdfExtractor.renderPdfPageFromDoc(docSession.doc, p, SCALE);
  }
  return pdfExtractor.renderPdfPagePngDataUrl(fullPath, p, SCALE);
}

/**
 * @param {(opts: object) => Promise<unknown>} gen
 * @param {string} dataUrl
 * @param {number} p
 */
async function transcribePageSafe(gen, dataUrl, p) {
  try {
    return await cloudLlmTasks.transcribePdfPage(gen, dataUrl, p);
  } catch (e) {
    console.warn('[pdf-transcription] transcribe page', p, e?.message || e);
    return '';
  }
}

/**
 * @param {{
 *   gen: (opts: object) => Promise<unknown>,
 *   docSession: unknown,
 *   fullPath: string,
 *   p: number,
 *   numPages: number,
 *   onProgress: ((p: { done: number, total: number, page: number }) => void) | null,
 *   queries: ReturnType<import('../core/database.cjs')['getQueries']>,
 *   resourceId: string,
 *   fileHash: string,
 *   visionNow: number,
 *   modelUsed: string,
 * }} ctx
 * @returns {Promise<string>}
 */
async function ocrAndPersistPage(ctx) {
  const rend = await renderPdfPageOrFallback(ctx.docSession, ctx.fullPath, ctx.p);
  if (!rend.success || !rend.dataUrl) {
    console.warn('[pdf-transcription] render failed page', ctx.p, rend.error);
    ctx.onProgress?.({ done: ctx.p, total: ctx.numPages, page: ctx.p });
    return `<!-- page:${ctx.p} -->\n\n`;
  }
  const rawMd = await transcribePageSafe(ctx.gen, rend.dataUrl, ctx.p);
  const md = stripVisionModelNoise(String(rawMd || ''));
  ctx.onProgress?.({ done: ctx.p, total: ctx.numPages, page: ctx.p });
  try {
    ctx.queries.upsertResourceTranscript.run(
      ctx.resourceId,
      ctx.p,
      md,
      ctx.modelUsed,
      ctx.fileHash || null,
      ctx.visionNow,
    );
  } catch (e) {
    console.warn('[pdf-transcription] upsert transcript', ctx.p, e?.message || e);
  }
  await new Promise((r) => setImmediate(r));
  return `<!-- page:${ctx.p} -->\n\n${md}`;
}

/**
 * @param {{ id: string; file_hash?: string }} resource
 * @param {ReturnType<import('../core/database.cjs')['getQueries']>} queries
 * @param {string} fullPath
 * @param {number} numPages
 * @param {{ windowManager?: { broadcast: Function } }} opts
 * @param {((p: { done: number, total: number, page: number }) => void) | null} onProgress
 * @returns {Promise<{ text: string; source: string }>}
 */
async function runOcrLoopAndFinalize(resource, queries, fullPath, numPages, opts, onProgress) {
  const resourceId = resource.id;
  const fileHash = String(resource.file_hash || '');
  const visionNow = Date.now();
  const modelUsed = getModelVersionLabel();
  deleteTranscriptsQuietly(queries, resourceId);

  const gen = (o) =>
    cloudLlm.generateText({ ...o, getQueries: () => queries, windowManager: opts.windowManager });

  const parts = [];
  let docSession;
  try {
    docSession = await pdfExtractor.openPdfDocument(fullPath);
    for (let p = 1; p <= numPages; p++) {
      const part = await ocrAndPersistPage({
        gen,
        docSession,
        fullPath,
        p,
        numPages,
        onProgress,
        queries,
        resourceId,
        fileHash,
        visionNow,
        modelUsed,
      });
      parts.push(part);
    }
  } finally {
    if (docSession) await pdfExtractor.destroyPdfDocument(docSession.doc);
  }

  const joined = parts.join('\n\n');
  const isEmpty = !joined.trim();
  finalizePdfIndexingState(queries, resourceId, joined, {
    status: isEmpty ? 'failed_vision_empty' : 'ok',
    text_source: isEmpty ? 'none' : 'vision_ocr',
    blocked_reason: isEmpty ? 'vision_ocr_yielded_empty' : undefined,
    user_hint_es: isEmpty
      ? 'OCR por modelo no produjo texto usable. Prueba otro modelo o vuelve a indexar más tarde.'
      : '',
  });
  if (isEmpty) return { text: '', source: 'vision_ocr_failed' };
  return { text: joined, source: 'cloud_pdf_transcript' };
}

/**
 * Full PDF indexing: **pdf.js texto nativo primero**. Si falta contenido útil → OCR modelo (cloud vision).
 * Si no hay proveedor con imagen configurado → bloqueado (metadata.pdf_indexing + content vacío).
 *
 * @param {import('better-sqlite3').Statement['get'] extends infer _ ? any : never} resource
 * @param {ReturnType<import('../core/database.cjs')['getQueries']>} queries
 * @param {{ onProgress?: (p: { done: number, total: number, page: number }) => void, windowManager?: { broadcast: Function } }} [opts]
 * @returns {Promise<{ text: string, source: string }>}
 */
async function extractPdfTextWithCloud(resource, queries, opts = {}) {
  const onProgress = getEffectiveOnProgress(opts);
  const fullPath = resolvePdfInput(resource);
  if (!fullPath) return { text: '', source: 'empty' };

  const numPages = await loadPdfPageCount(fullPath);
  if (numPages === 0) return { text: '', source: 'empty' };

  const resourceId = resource.id;
  const fileHash = String(resource.file_hash || '');

  const pdfjsResult = await tryFinalizeWithPdfjs(resourceId, queries, fullPath, numPages);
  if (pdfjsResult) return pdfjsResult;

  if (!resolveVisionOcrAvailable(queries)) {
    return buildBlockedNoVisionOcrResult(queries, resourceId);
  }

  const cachedResult = tryFinalizeWithCachedVisionOcr(queries, resourceId, fileHash, numPages);
  if (cachedResult) return cachedResult;

  return runOcrLoopAndFinalize(resource, queries, fullPath, numPages, opts, onProgress);
}

module.exports = {
  extractPdfTextWithCloud,
  buildPdfjsMarkedText,
  stripVisionModelNoise,
  storedPdfVisionTranscriptLooksCorrupted,
  pdfJsExtractIsInsufficient,
};
