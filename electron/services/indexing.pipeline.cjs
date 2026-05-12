/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const {
  embedDocuments,
  embedQuery,
  MODEL_VERSION,
  resetPipeline,
} = require('./embeddings.service.cjs');
const { chunkText, assignPageNumbersFromMarkers } = require('./chunking.cjs');
const { getIndexableText, syncArtifactFtsContent } = require('./resource-text.cjs');
const fileStorage = require('../file-storage.cjs');
const cloudLlm = require('./cloud-llm.service.cjs');
const cloudLlmTasks = require('./cloud-llm-tasks.cjs');
const { extractPdfTextWithCloud } = require('./pdf-transcription.cjs');
const lancedb = require('./lancedb-semantic.cjs');

const DEFAULT_THRESHOLD = 0.45;
const TOP_K = 8;
/** Límite de fragmentos por recurso para evitar OOM en embeddings / SQLite. */
const MAX_CHUNKS_PER_RESOURCE = 5000;
/** Máx. embeddings por recurso al calcular centroides (reindex de docs enormes + biblioteca grande). */
const MAX_EMBEDDINGS_FOR_CENTROID = 384;
/** Evita cargar notas/PDF enormes en un solo string antes del chunking (OOM del proceso). */
const MAX_INDEXABLE_TEXT_CHARS = 6_000_000;

/**
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
function sampleEvenlyForCentroid(items) {
  if (!Array.isArray(items) || items.length <= MAX_EMBEDDINGS_FOR_CENTROID) return items;
  const n = items.length;
  const k = MAX_EMBEDDINGS_FOR_CENTROID;
  const out = [];
  for (let j = 0; j < k; j++) {
    const idx = n <= 1 ? 0 : Math.min(n - 1, Math.floor((j * (n - 1)) / Math.max(1, k - 1)));
    out.push(items[idx]);
  }
  return out;
}

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
  return ['note', 'url', 'document', 'pdf', 'notebook', 'ppt', 'excel', 'image', 'artifact'].includes(
    type,
  );
}

/**
 * Keep FTS row in sync when artifact embeddings run (sweep / reindex). IPC also syncs on mutation for low latency.
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 * @param {{ type?: string, id?: string } | undefined} resource
 */
function finalizeArtifactSearchSurface(queries, resource) {
  const rid = resource?.id;
  if (!rid || String(resource?.type) !== 'artifact') return;
  try {
    syncArtifactFtsContent(queries, rid);
  } catch (e) {
    console.warn('[indexing.pipeline] artifact fts sync', e?.message || e);
  }
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
      try {
        await lancedb.deleteChunksForResource(resourceId);
      } catch (e) {
        console.warn('[indexing.pipeline] lance delete (empty)', e?.message || e);
      }
      finalizeArtifactSearchSurface(queries, resource);
      return { ok: true, skipped: true, reason: 'empty_text' };
    }

    if (text.length > MAX_INDEXABLE_TEXT_CHARS) {
      text =
        text.slice(0, MAX_INDEXABLE_TEXT_CHARS) +
        '\n\n[Dome: texto truncado para indexación por límite de tamaño]';
    }

    let chunks;
    try {
      chunks = chunkText(text);
      if (resource.type === 'pdf' && String(text).includes('<!-- page:')) {
        assignPageNumbersFromMarkers(text, chunks);
      }
    } catch {
      try {
        await lancedb.deleteChunksForResource(resourceId);
      } catch {
        /* ignore */
      }
      finalizeArtifactSearchSurface(queries, resource);
      return { ok: false, error: 'chunking_failed' };
    }
    if (chunks.length === 0) {
      queries.deleteChunksByResource.run(resourceId);
      queries.deleteSemanticAutoFromSource.run(resourceId);
      try {
        await lancedb.deleteChunksForResource(resourceId);
      } catch (e) {
        console.warn('[indexing.pipeline] lance delete (no chunks)', e?.message || e);
      }
      finalizeArtifactSearchSurface(queries, resource);
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
      finalizeArtifactSearchSurface(queries, resource);
      return { ok: false, error: 'embedding_failed', message: msg };
    }
    const now = Date.now();

    queries.deleteChunksByResource.run(resourceId);

    const lanceRows = chunks.map((ch, i) => ({
      chunk_index: i,
      text: ch.text,
      vector: vectors[i],
      char_start: ch.char_start ?? -1,
      char_end: ch.char_end ?? -1,
      page_number: ch.page_number ?? -1,
      res_title: String(resource.title || ''),
      res_type: String(resource.type || ''),
      project_id: String(resource.project_id || ''),
    }));
    try {
      await lancedb.replaceResourceChunks(resourceId, lanceRows);
      await lancedb.upsertLexForResource({
        resource_id: resourceId,
        title: String(resource.title || ''),
        type: String(resource.type || ''),
        project_id: resource.project_id,
        content: String(resource.content || ''),
      });
    } catch (e) {
      console.error('[indexing.pipeline] lance write', resourceId, e?.message || e);
      finalizeArtifactSearchSurface(queries, resource);
      return { ok: false, error: 'lance_write_failed', message: String(e?.message || e) };
    }

    queries.deleteSemanticAutoFromSource.run(resourceId);

    const myCentroid = centroidL2Normalized(sampleEvenlyForCentroid(vectors));
    if (!myCentroid) {
      finalizeArtifactSearchSurface(queries, resource);
      return { ok: true, count: 0, chunks: chunks.length, textSource: source };
    }

    /** @type {{ targetId: string, sim: number }[]} */
    const relations = [];
    let otherIds = [];
    try {
      otherIds = await lancedb.listIndexedResourceIdsExcluding(resourceId);
    } catch (e) {
      console.warn('[indexing.pipeline] lance list neighbors', e?.message || e);
    }
    let relScan = 0;
    for (const otherId of otherIds) {
      relScan += 1;
      if (relScan % 48 === 0) {
        await new Promise((r) => setImmediate(r));
      }
      let ovecs = [];
      try {
        ovecs = await lancedb.sampleVectorsForCentroid(otherId, MAX_EMBEDDINGS_FOR_CENTROID);
      } catch {
        continue;
      }
      if (!ovecs.length) continue;
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

    finalizeArtifactSearchSurface(queries, resource);

    return { ok: true, count: topK.length, chunks: chunks.length, textSource: source };
  }

  /**
   * @param {{ threshold?: number, onProgress?: (p: { total: number, done: number, errors: number, step?: string }) => void }} [options]
   */
  async function reindexAll(options = {}) {
    // Second consecutive full reindex: reusing the ONNX session can SIGTRAP; reload per job.
    resetPipeline();
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
    resetPipeline();
    return out;
  }

  /**
   * @param {string} query
   * @param {{ limit?: number, filter?: { type?: string[] } }} [options]
   */
  async function searchSemantic(query, options = {}) {
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const filterTypes = options.filter?.type?.length ? new Set(options.filter.type) : null;
    const qVec = await embedQuery(query);
    let norm = 0;
    for (let i = 0; i < qVec.length; i++) norm += qVec[i] * qVec[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) {
      return [];
    }
    try {
      return await lancedb.searchSemanticVector(qVec, limit, filterTypes);
    } catch (e) {
      console.error('[indexing.pipeline] searchSemantic lance', e?.message || e);
      return [];
    }
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
