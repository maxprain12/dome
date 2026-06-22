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

async function getModelVersionLabel() {
  const q = database.getQueries();
  const p = String((await q.getSetting.get('ai_provider'))?.value || 'cloud');
  const m = String((await q.getSetting.get('ai_model'))?.value || 'default');
  return `cloud:${p}:${m}`;
}

async function resolveVisionOcrAvailable(queries) {
  if (!await cloudLlm.isCloudLlmAvailable(() => queries)) return false;
  const cfg = await cloudLlm.resolveConfig(() => queries);
  return cloudLlm.isVisionSupportedProviderId(cfg.provider);
}

/**
 * @param {*} queries
 * @param {string} resourceId
 * @param {string} nextContent
 * @param {Record<string, unknown>} indexingPatch merged into metadata.pdf_indexing
 */
async function finalizePdfIndexingState(queries, resourceId, nextContent, indexingPatch) {
  try {
    const row = await queries.getResourceById.get(resourceId);
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
    await queries.updateResource.run(row.title || 'Untitled', nextContent ?? '', JSON.stringify(meta), now, resourceId);
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
 * Full PDF indexing: **pdf.js texto nativo primero**. Si falta contenido útil → OCR modelo (cloud vision).
 * Si no hay proveedor con imagen configurado → bloqueado (metadata.pdf_indexing + content vacío).
 *
 * @param {import('better-sqlite3').Statement['get'] extends infer _ ? any : never} resource
 * @param {ReturnType<import('../core/database.cjs')['getQueries']>} queries
 * @param {{ onProgress?: (p: { done: number, total: number, page: number }) => void, windowManager?: { broadcast: Function } }} [opts]
 * @returns {Promise<{ text: string, source: string }>}
 */
async function extractPdfTextWithCloud(resource, queries, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  if (!resource || resource.type !== 'pdf' || !resource.internal_path) {
    return { text: '', source: 'empty' };
  }
  const fullPath = fileStorage.getFullPath(resource.internal_path);
  if (!fullPath || !fs.existsSync(fullPath)) {
    return { text: '', source: 'empty' };
  }

  const meta = await pdfExtractor.getPdfMetadata(fullPath);
  if (!meta.success || !meta.metadata?.pageCount) {
    return { text: '', source: 'empty' };
  }
  const numPages = Math.max(1, Number(meta.metadata.pageCount) || 1);
  const fileHash = String(resource.file_hash || '');
  const resourceId = resource.id;

  /** 1 — Siempre texto pdf.js marcado por página */
  const pdfJsText = await buildPdfjsMarkedText(fullPath, numPages);
  if (!pdfJsExtractIsInsufficient(pdfJsText, numPages)) {
    try {
      await queries.deleteResourceTranscripts.run(resourceId);
    } catch {
      /* */
    }
    await finalizePdfIndexingState(queries, resourceId, pdfJsText, {
      status: 'ok',
      text_source: 'pdfjs',
    });
    return { text: pdfJsText, source: 'pdfjs' };
  }

  const visionReady = await resolveVisionOcrAvailable(queries);

  if (!visionReady) {
    await finalizePdfIndexingState(queries, resourceId, '', {
      status: 'blocked_no_vision_ocr',
      text_source: 'none',
      blocked_reason: 'pdfjs_insufficient_no_ocr_provider',
      user_hint_es:
        'Este PDF tiene poco o ningún texto seleccionable. Para indexarlo necesitas un proveedor de IA con soporte ' +
        'de imagen/OCR en Ajustes (OpenAI, Anthropic, Google, MiniMax u Ollama con modelo de visión, o sesión Dome con modelo multimodal). ' +
        'Sin eso Dome no ejecuta OCR del modelo sobre las páginas.',
    });
    try {
      await queries.deleteResourceTranscripts.run(resourceId);
    } catch {
      /* */
    }
    return { text: '', source: 'blocked_no_vision_ocr' };
  }

  /** 2 — OCR por modelo (solo si pdf.js fue insuficiente) */
  const visionNow = Date.now();
  const modelUsed = await getModelVersionLabel();
  const cachedCount = await queries.countResourceTranscriptsForHash.get(resourceId, fileHash || '__none__');
  const c = Number(cachedCount?.c ?? 0);
  if (fileHash && c === numPages && numPages > 0) {
    const rows = await queries.getResourceTranscriptsByResource.all(resourceId);
    if (rows.length === numPages) {
      let text = rows
        .map((row) => {
          const md = stripVisionModelNoise(row.markdown || '');
          return `<!-- page:${row.page_number} -->\n\n${md}`;
        })
        .join('\n\n');
      if (!text.trim() || storedPdfVisionTranscriptLooksCorrupted(text)) {
        /** Caché inservible ante nuevas reglas; reintentar OCR */
      } else {
        await finalizePdfIndexingState(queries, resourceId, text, {
          status: 'ok',
          text_source: 'vision_ocr_cached',
        });
        return { text, source: 'cloud_pdf_transcript_cached' };
      }
    }
  }

  try {
    await queries.deleteResourceTranscripts.run(resourceId);
  } catch {
    /* */
  }

  const gen = (o) =>
    cloudLlm.generateText({ ...o, getQueries: () => queries, windowManager: opts.windowManager });

  const parts = [];

  const docSession = await pdfExtractor.openPdfDocument(fullPath);

  try {
    for (let p = 1; p <= numPages; p++) {
      let rend;
      if (docSession) {
        rend = await pdfExtractor.renderPdfPageFromDoc(docSession.doc, p, SCALE);
      } else {
        rend = await pdfExtractor.renderPdfPagePngDataUrl(fullPath, p, SCALE);
      }
      if (!rend.success || !rend.dataUrl) {
        console.warn('[pdf-transcription] render failed page', p, rend.error);
        parts.push(`<!-- page:${p} -->\n\n`);
        onProgress?.({ done: p, total: numPages, page: p });
        continue;
      }
      let md = '';
      try {
        md = await cloudLlmTasks.transcribePdfPage(gen, rend.dataUrl, p);
      } catch (e) {
        console.warn('[pdf-transcription] transcribe page', p, e?.message || e);
      }
      md = stripVisionModelNoise(String(md || ''));

      parts.push(`<!-- page:${p} -->\n\n${md}`);

      try {
        await queries.upsertResourceTranscript.run(
          resourceId,
          p,
          md,
          modelUsed,
          fileHash || null,
          visionNow,
        );
      } catch (e) {
        console.warn('[pdf-transcription] upsert transcript', p, e?.message || e);
      }

      onProgress?.({ done: p, total: numPages, page: p });
      await new Promise((r) => setImmediate(r));
    }
  } finally {
    if (docSession) await pdfExtractor.destroyPdfDocument(docSession.doc);
  }

  const joined = parts.join('\n\n');

  await finalizePdfIndexingState(queries, resourceId, joined, {
    status: joined.trim().length ? 'ok' : 'failed_vision_empty',
    text_source: joined.trim().length ? 'vision_ocr' : 'none',
    blocked_reason: joined.trim().length ? undefined : 'vision_ocr_yielded_empty',
    user_hint_es: joined.trim().length
      ? ''
      : 'OCR por modelo no produjo texto usable. Prueba otro modelo o vuelve a indexar más tarde.',
  });

  if (!joined.trim()) return { text: '', source: 'vision_ocr_failed' };
  return { text: joined, source: 'cloud_pdf_transcript' };
}

module.exports = {
  extractPdfTextWithCloud,
  buildPdfjsMarkedText,
  stripVisionModelNoise,
  storedPdfVisionTranscriptLooksCorrupted,
  pdfJsExtractIsInsufficient,
};
