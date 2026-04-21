/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const fileStorage = require('../file-storage.cjs');
const pdfExtractor = require('../pdf-extractor.cjs');
const database = require('../database.cjs');
const cloudLlm = require('./cloud-llm.service.cjs');
const cloudLlmTasks = require('./cloud-llm-tasks.cjs');

const SCALE = 1.35;

function getModelVersionLabel() {
  const q = database.getQueries();
  const p = String(q.getSetting.get('ai_provider')?.value || 'cloud');
  const m = String(q.getSetting.get('ai_model')?.value || 'default');
  return `cloud:${p}:${m}`;
}

/**
 * @param {string} fullPath
 * @param {number} numPages
 */
async function buildPdfjsMarkedText(fullPath, numPages) {
  const parts = [];
  for (let p = 1; p <= numPages; p++) {
    const r = await pdfExtractor.extractPdfText(fullPath, { maxChars: 100000, pages: String(p) });
    const t = (r.success && r.text ? String(r.text) : '').trim();
    parts.push(`<!-- page:${p} -->\n\n${t}`);
  }
  return parts.join('\n\n');
}

/**
 * Full PDF transcription for indexing: cloud vision page-by-page, or pdf.js text when cloud unavailable.
 *
 * @param {import('better-sqlite3').Statement['get'] extends infer _ ? any : never} resource
 * @param {ReturnType<import('../database.cjs')['getQueries']>} queries
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
  const now = Date.now();

  if (!cloudLlm.isCloudLlmAvailable(() => queries)) {
    const text = await buildPdfjsMarkedText(fullPath, numPages);
    try {
      queries.updateResourceContent.run(text, now, resourceId);
    } catch (e) {
      console.warn('[pdf-transcription] updateResourceContent', e?.message || e);
    }
    return { text, source: 'pdfjs_fallback' };
  }

  const modelUsed = getModelVersionLabel();
  const cachedCount = queries.countResourceTranscriptsForHash.get(resourceId, fileHash || '__none__');
  const c = Number(cachedCount?.c ?? 0);
  if (fileHash && c === numPages && numPages > 0) {
    const rows = queries.getResourceTranscriptsByResource.all(resourceId);
    if (rows.length === numPages) {
      const text = rows
        .map((row) => `<!-- page:${row.page_number} -->\n\n${String(row.markdown || '').trim()}`)
        .join('\n\n');
      try {
        queries.updateResourceContent.run(text, now, resourceId);
      } catch (e) {
        console.warn('[pdf-transcription] updateResourceContent (cache)', e?.message || e);
      }
      return { text, source: 'cloud_pdf_transcript_cached' };
    }
  }

  try {
    queries.deleteResourceTranscripts.run(resourceId);
  } catch {
    /* */
  }

  const gen = (o) =>
    cloudLlm.generateText({ ...o, getQueries: () => queries, windowManager: opts.windowManager });

  const parts = [];

  for (let p = 1; p <= numPages; p++) {
    const rend = await pdfExtractor.renderPdfPagePngDataUrl(fullPath, p, SCALE);
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
    md = String(md || '').trim();
    parts.push(`<!-- page:${p} -->\n\n${md}`);

    try {
      queries.upsertResourceTranscript.run(
        resourceId,
        p,
        md,
        modelUsed,
        fileHash || null,
        now,
      );
    } catch (e) {
      console.warn('[pdf-transcription] upsert transcript', p, e?.message || e);
    }

    onProgress?.({ done: p, total: numPages, page: p });
  }

  const text = parts.join('\n\n');
  try {
    queries.updateResourceContent.run(text, now, resourceId);
  } catch (e) {
    console.warn('[pdf-transcription] updateResourceContent', e?.message || e);
  }

  return { text, source: 'cloud_pdf_transcript' };
}

module.exports = {
  extractPdfTextWithCloud,
  /** @deprecated */
  extractPdfTextWithGemma: extractPdfTextWithCloud,
  buildPdfjsMarkedText,
};
