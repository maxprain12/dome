/* eslint-disable no-console */
'use strict';
const fs = require('node:fs');
const { getIndexableText } = require('./resource-text.cjs');
const fileStorage = require('../storage/file-storage.cjs');
const cloudLlm = require('./cloud-llm.service.cjs');
const cloudLlmTasks = require('./cloud-llm-tasks.cjs');
const { extractPdfTextWithCloud } = require('./pdf-transcription.cjs');
function shouldIndexResourceType(type) {
  return ['note','url','document','pdf','notebook','ppt','excel','image','artifact'].includes(type);
}
async function tryExtractPdfText(resource, queries) {
  if (!(resource.type === 'pdf' && resource.vault_path)) return null;
  try {
    return await extractPdfTextWithCloud(resource, queries);
  } catch (e) {
    console.warn('[TextIndex] pdf transcription', e?.message || e);
    return null;
  }
}

/**
 * Extract text from an image resource via cloud vision (caption + OCR).
 * @param {Record<string, any>} resource
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 */
async function tryExtractImageText(resource, queries) {
  if (!(resource.type === 'image' && resource.vault_path)) return null;
  if (!cloudLlm.isCloudLlmAvailable(() => queries)) return null;
  try {
    const fullPath = require('../storage/vault-store.cjs').getResourceFilePath(
      resource,
      queries,
      fileStorage,
    );
    if (!fullPath || !fs.existsSync(fullPath)) return null;
    const mime = resource.file_mime_type || 'image/png';
    const b64 = fs.readFileSync(fullPath).toString('base64');
    const dataUrl = `data:${mime};base64,${b64}`;
    const gen = (o) => cloudLlm.generateText({ ...o, getQueries: () => queries });
    const caption = await cloudLlmTasks.runCaptionOnImageDataUrl(gen, dataUrl);
    const ocr = await cloudLlmTasks.runOcrOnImageDataUrl(gen, dataUrl);
    const title = String(resource.title || '').trim();
    const cap = String(caption || '').trim();
    const oc = String(ocr || '').trim();
    const text = [title, cap && `Descripcion: ${cap}`, oc && `Texto: ${oc}`]
      .filter(Boolean)
      .join('\n\n');
    return { text, source: 'cloud_image' };
  } catch (e) {
    console.warn('[TextIndex] cloud image', e?.message || e);
    return null;
  }
}

/**
 * Resolve the indexable text/source for a resource, layering PDF / image
 * transcription on top of the base text. Each special extractor is opt-in
 * and swallows its own errors so one failure doesn't poison the whole
 * pipeline.
 * @param {Record<string, any>} resource
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 */
async function resolveIndexableText(queries, resource) {
  let { text, source } = getIndexableText(resource, queries);
  const pdfResult = await tryExtractPdfText(resource, queries);
  if (pdfResult) {
    text = pdfResult.text;
    source = pdfResult.source;
  }
  const imageResult = await tryExtractImageText(resource, queries);
  if (imageResult) {
    text = imageResult.text;
    source = imageResult.source;
  }
  return { text, source };
}

function createIndexer({ getQueries, getDB }) {
  let queue = Promise.resolve();
  const pending = new Map();
  function indexResource(id) {
    if (pending.has(id)) return pending.get(id);
    const task = queue.then(async () => {
      const queries = getQueries();
      const resource = queries.getResourceById.get(id);
      if (!resource || !shouldIndexResourceType(resource.type)) return { ok: true, skipped: true };
      const { text } = await resolveIndexableText(queries, resource);
      const body = text.startsWith(`${resource.title || ''}\n`) ? text.slice(String(resource.title || '').length + 1) : text;
      // Only update the search cache: original note/document content stays intact.
      getDB().prepare('UPDATE resources SET content_text = ? WHERE id = ?').run(String(body || '').slice(0, 6_000_000), id);
      return { ok: true };
    }).finally(() => pending.delete(id));
    pending.set(id, task);
    queue = task.catch((error) => console.warn('[TextIndex]', error.message));
    return task;
  }
  return { indexResource, waitForIndexerIdle: () => queue };
}
module.exports = { createIndexer, shouldIndexResourceType };
