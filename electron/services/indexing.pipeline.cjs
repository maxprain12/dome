/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const {
  embedDocuments,
  embedQuery,
  floatsToBlob,
  blobToFloats,
  MODEL_VERSION,
  resetPipeline,
} = require('./embeddings.service.cjs');
const { chunkText, assignPageNumbersFromMarkers } = require('./chunking.cjs');
const { getIndexableText } = require('./resource-text.cjs');
const fileStorage = require('../file-storage.cjs');
const cloudLlm = require('./cloud-llm.service.cjs');
const cloudLlmTasks = require('./cloud-llm-tasks.cjs');
const { extractPdfTextWithCloud } = require('./pdf-transcription.cjs');

const DEFAULT_THRESHOLD = 0.45;
const TOP_K = 8;
/** Límite de fragmentos por recurso para evitar OOM en embeddings / SQLite. */
const MAX_CHUNKS_PER_RESOURCE = 5000;

/**
 * @param {Float32Array | null} a
 * @param {Float32Array | null} b
 */
function dotNormalized(a, b) {
  if (!a || !b) return 0;
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/**
 * @param {Float32Array[]} vectors
 * @returns {Float32Array | null}
 */
function centroidL2Normalized(vectors) {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const acc = new Float32Array(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length;
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += acc[i] * acc[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-12) return null;
  for (let i = 0; i < dim; i++) acc[i] /= norm;
  return acc;
}

/**
 * @param {string} type
 */
function shouldIndexResourceType(type) {
  return ['note', 'url', 'document', 'pdf', 'notebook', 'ppt', 'excel', 'image'].includes(type);
}

/**
 * @param {import('better-sqlite3').Statement} q
 * @param {string} src
 * @param {string} tgt
 * @param {number} sim
 * @param {number} now
 */
function upsertAutoEdge(q, src, tgt, sim, now) {
  if (src === tgt) return;
  const id = `${src}__${tgt}`;
  const existing = q.getSemanticRelationByPair.get(src, tgt);
  if (!existing) {
    q.insertSemanticRelation.run(id, src, tgt, sim, 'auto', null, now, null);
    return;
  }
  if (existing.relation_type === 'auto') {
    q.updateSemanticAutoByPair.run(sim, now, src, tgt);
  }
}

/**
 * @param {{ getQueries: () => Record<string, import('better-sqlite3').Statement> }} opts
 */
function createIndexer(opts) {
  const { getQueries } = opts;
  let _queue = Promise.resolve();

  /**
   * @param {() => Promise<void>} task
   */
  function enqueue(task) {
    _queue = _queue.then(task).catch((e) => {
      console.error('[indexing.pipeline]', e);
    });
    return _queue;
  }

  /**
   * @param {string} resourceId
   * @param {{ threshold?: number }} [options]
   */
  async function indexResource(resourceId, options = {}) {
    const threshold =
      typeof options.threshold === 'number' ? options.threshold : DEFAULT_THRESHOLD;
    const queries = getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { ok: false, error: 'not_found' };
    }
    if (!shouldIndexResourceType(resource.type)) {
      return { ok: true, skipped: true };
    }

    let { text, source } = getIndexableText(resource, queries);

    if (resource.type === 'pdf' && resource.internal_path) {
      try {
        const tr = await extractPdfTextWithCloud(resource, queries);
        text = tr.text;
        source = tr.source;
      } catch (e) {
        console.warn('[indexing.pipeline] pdf transcription', e?.message || e);
      }
    }

    if (resource.type === 'image' && cloudLlm.isCloudLlmAvailable(() => queries) && resource.internal_path) {
      try {
        const fullPath = fileStorage.getFullPath(resource.internal_path);
        if (fullPath && fs.existsSync(fullPath)) {
          const mime = resource.file_mime_type || 'image/png';
          const b64 = fs.readFileSync(fullPath).toString('base64');
          const dataUrl = `data:${mime};base64,${b64}`;
          const gen = (o) => cloudLlm.generateText({ ...o, getQueries: () => queries });
          const caption = await cloudLlmTasks.runCaptionOnImageDataUrl(gen, dataUrl);
          const ocr = await cloudLlmTasks.runOcrOnImageDataUrl(gen, dataUrl);
          const title = String(resource.title || '').trim();
          const cap = String(caption || '').trim();
          const oc = String(ocr || '').trim();
          text = [title, cap && `Descripcion: ${cap}`, oc && `Texto: ${oc}`].filter(Boolean).join('\n\n');
          source = 'cloud_image';
        }
      } catch (e) {
        console.warn('[indexing.pipeline] cloud image', e?.message || e);
      }
    }

    if (!text || source === 'empty') {
      queries.deleteChunksByResource.run(resourceId);
      queries.deleteSemanticAutoFromSource.run(resourceId);
      return { ok: true, skipped: true, reason: 'empty_text' };
    }

    let chunks;
    try {
      chunks = chunkText(text);
      if (resource.type === 'pdf' && String(text).includes('<!-- page:')) {
        assignPageNumbersFromMarkers(text, chunks);
      }
    } catch {
      return { ok: false, error: 'chunking_failed' };
    }
    if (chunks.length === 0) {
      queries.deleteChunksByResource.run(resourceId);
      queries.deleteSemanticAutoFromSource.run(resourceId);
      return { ok: true, skipped: true, reason: 'no_chunks' };
    }

    if (chunks.length > MAX_CHUNKS_PER_RESOURCE) {
      chunks = chunks.slice(0, MAX_CHUNKS_PER_RESOURCE);
    }

    let vectors;
    try {
      vectors = await embedDocuments(chunks.map((c) => c.text));
    } catch (e) {
      resetPipeline();
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[indexing.pipeline] embedding_failed', resourceId, msg);
      return { ok: false, error: 'embedding_failed', message: msg };
    }
    const now = Date.now();

    queries.deleteChunksByResource.run(resourceId);

    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      const vec = vectors[i];
      const id = `${resourceId}#${i}`;
      const blob = floatsToBlob(vec);
      queries.insertResourceChunk.run(
        id,
        resourceId,
        i,
        ch.text,
        blob,
        MODEL_VERSION,
        ch.char_start ?? null,
        ch.char_end ?? null,
        ch.page_number ?? null,
        now,
      );
    }

    queries.deleteSemanticAutoFromSource.run(resourceId);

    const myCentroid = centroidL2Normalized(vectors);
    if (!myCentroid) {
      return { ok: true, count: 0, chunks: chunks.length, textSource: source };
    }

    /** @type {{ targetId: string, sim: number }[]} */
    const relations = [];
    const otherIds = queries.getDistinctChunkResourceIdsExcluding.all(MODEL_VERSION, resourceId);
    for (const row of otherIds) {
      const otherId = row.resource_id;
      const embRows = queries.getChunkEmbeddingsByResourceForModel.all(otherId, MODEL_VERSION);
      if (!embRows.length) continue;
      /** @type {Float32Array[]} */
      const ovecs = [];
      for (const er of embRows) {
        try {
          ovecs.push(blobToFloats(er.embedding));
        } catch {
          /* skip */
        }
      }
      const c = centroidL2Normalized(ovecs);
      if (!c) continue;
      const sim = dotNormalized(myCentroid, c);
      if (sim >= threshold) {
        relations.push({ targetId: otherId, sim });
      }
    }
    relations.sort((a, b) => b.sim - a.sim);
    const topK = relations.slice(0, TOP_K);

    for (const r of topK) {
      upsertAutoEdge(queries, resourceId, r.targetId, r.sim, now);
      upsertAutoEdge(queries, r.targetId, resourceId, r.sim, now);
    }

    return { ok: true, count: topK.length, chunks: chunks.length, textSource: source };
  }

  /**
   * @param {{ threshold?: number, onProgress?: (p: { total: number, done: number, errors: number, step?: string }) => void }} [options]
   */
  async function reindexAll(options = {}) {
    const queries = getQueries();
    const rows = queries.getAllResources.all(500000);
    const targets = rows.filter((r) => shouldIndexResourceType(r.type));
    const out = { total: targets.length, done: 0, errors: 0 };
    for (const row of targets) {
      try {
        if (typeof options.onProgress === 'function') {
          options.onProgress({ ...out, step: row.id });
        }
        await indexResource(row.id, { threshold: options.threshold });
        out.done += 1;
      } catch {
        out.errors += 1;
      }
      if (typeof options.onProgress === 'function') {
        options.onProgress({ ...out, step: row.id });
      }
    }
    return out;
  }

  /**
   * @param {string} query
   * @param {{ limit?: number, filter?: { type?: string[] } }} [options]
   */
  async function searchSemantic(query, options = {}) {
    // TODO: cuando haya muchos miles de chunks, migrar a sqlite-vec / HNSW para evitar cosine O(n) en memoria.
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const filterTypes = options.filter?.type?.length ? new Set(options.filter.type) : null;
    const queries = getQueries();
    const qVec = await embedQuery(query);
    let norm = 0;
    for (let i = 0; i < qVec.length; i++) norm += qVec[i] * qVec[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) {
      return [];
    }

    const rows = queries.getChunkRowsForSemanticSearch.all(MODEL_VERSION);
    /** @type {{ resource_id: string, chunk_index: number, char_start: number | null, char_end: number | null, page_number: number | null, snippet: string, score: number, title: string, type: string }[]} */
    const scored = [];

    for (const row of rows) {
      try {
        const resType = String(row.res_type || 'note');
        if (filterTypes && !filterTypes.has(resType)) continue;
        const emb = blobToFloats(row.embedding);
        let score = 0;
        for (let i = 0; i < Math.min(qVec.length, emb.length); i++) score += qVec[i] * emb[i];
        const pn = row.page_number != null ? Number(row.page_number) : null;
        scored.push({
          resource_id: row.resource_id,
          chunk_index: row.chunk_index,
          char_start: row.char_start,
          char_end: row.char_end,
          page_number: Number.isFinite(pn) ? pn : null,
          snippet: String(row.text || '').slice(0, 400),
          score,
          title: row.res_title || 'Untitled',
          type: resType,
        });
      } catch {
        /* skip */
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topPool = scored.slice(0, limit * 4);
    /** @type {Map<string, typeof scored[0]>} */
    const bestByResource = new Map();
    for (const hit of topPool) {
      const prev = bestByResource.get(hit.resource_id);
      if (!prev || hit.score > prev.score) {
        bestByResource.set(hit.resource_id, hit);
      }
    }
    const merged = Array.from(bestByResource.values()).sort((a, b) => b.score - a.score);
    return merged.slice(0, limit);
  }

  return {
    indexResource: (id, opts) => enqueue(() => indexResource(id, opts)),
    reindexAll: (opts) => enqueue(() => reindexAll(opts)),
    searchSemantic: (q, opts) => searchSemantic(q, opts),
    /** @internal */
    indexResourceImmediate: indexResource,
  };
}

module.exports = {
  createIndexer,
  dotNormalized,
  DEFAULT_THRESHOLD,
  TOP_K,
  shouldIndexResourceType,
};
