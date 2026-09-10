/* eslint-disable no-console */
'use strict';

const fs = require('node:fs');
const {
  embedDocuments,
  embedQuery,
  resetPipeline,
  isConfigured,
  getActiveContextTokensSafe,
  EMBEDDINGS_NOT_CONFIGURED,
} = require('./embeddings.service.cjs');
const { chunkTextForEmbeddings, assignPageNumbersFromMarkers } = require('./chunking.cjs');
const { getIndexableText, syncArtifactFtsContent } = require('./resource-text.cjs');
const fileStorage = require('../storage/file-storage.cjs');
const cloudLlm = require('./cloud-llm.service.cjs');
const cloudLlmTasks = require('./cloud-llm-tasks.cjs');
const { extractPdfTextWithCloud } = require('./pdf-transcription.cjs');
const lancedb = require('./lancedb-semantic.cjs');

/** Dedupe entre llamadas y entre instancias de indexer (evita recrear indexer en cada init). */
/** @type {Map<string, Promise<any>>} */
const GLOBAL_INDEX_INFLIGHT = new Map();

/**
 * True while a reindexAll() is in progress. The AutoIndex sweep checks this
 * flag to avoid contending with a full reindex over the embeddings worker.
 */
let _reindexAllInFlight = false;

const DEFAULT_THRESHOLD = 0.45;
const TOP_K = 8;
/** Evita O(N²) en bibliotecas grandes: solo comparamos centroides contra una muestra de otros recursos. */
const MAX_NEIGHBOR_CANDIDATES = 512;
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
 * Subconjunto aleatorio sin repetición de tamaño acotado (Fisher-Yates parcial).
 * @param {string[]} ids
 * @param {number} max
 * @returns {string[]}
 */
function sampleNeighborIds(ids, max) {
  if (!Array.isArray(ids) || ids.length <= max) return ids;
  const pool = ids.slice();
  for (let i = 0; i < max; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool.slice(0, max);
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

/** No useful text for indexing — placeholder sources from upstream extraction steps. */
function isUnindexableText(text, source) {
  return (
    !text ||
    source === 'empty' ||
    source === 'blocked_no_vision_ocr' ||
    source === 'vision_ocr_failed'
  );
}

/** Truncate oversized documents so embeddings don't OOM. */
function truncateForIndexing(text) {
  if (text.length <= MAX_INDEXABLE_TEXT_CHARS) return text;
  return (
    text.slice(0, MAX_INDEXABLE_TEXT_CHARS) +
    '\n\n[Dome: texto truncado para indexación por límite de tamaño]'
  );
}

/**
 * Extract text from a PDF resource via cloud OCR. Returns null on failure
 * (caller keeps the previously-resolved plain text).
 * @param {Record<string, any>} resource
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 */
async function tryExtractPdfText(resource, queries) {
  if (!(resource.type === 'pdf' && resource.vault_path)) return null;
  try {
    return await extractPdfTextWithCloud(resource, queries);
  } catch (e) {
    console.warn('[indexing.pipeline] pdf transcription', e?.message || e);
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
    console.warn('[indexing.pipeline] cloud image', e?.message || e);
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

/**
 * Drop every stored artifact for `resourceId` (sqlite + Lance). Used when
 * we know there is nothing meaningful to index anymore.
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 * @param {string} resourceId
 * @param {Record<string, any>} resource
 */
async function purgeStoredArtifacts(queries, resourceId, resource) {
  queries.deleteChunksByResource.run(resourceId);
  queries.deleteSemanticAutoFromSource.run(resourceId);
  try {
    await lancedb.deleteChunksForResource(resourceId);
  } catch (e) {
    console.warn('[indexing.pipeline] lance delete', e?.message || e);
  }
  finalizeArtifactSearchSurface(queries, resource);
}

/**
 * Chunk `text` honoring the active context window, attaching PDF page markers
 * when relevant. Returns `{ ok: true, chunks }` or `{ ok: false, error }`.
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 * @param {Record<string, any>} resource
 * @param {string} text
 */
async function buildChunksForResource(queries, resource, text) {
  try {
    const ctxTokens = await getActiveContextTokensSafe(() => queries);
    const chunks = await chunkTextForEmbeddings(text, { contextTokens: ctxTokens });
    if (resource.type === 'pdf' && String(text).includes('<!-- page:')) {
      assignPageNumbersFromMarkers(text, chunks);
    }
    return { ok: true, chunks };
  } catch {
    return { ok: false, error: 'chunking_failed' };
  }
}

/**
 * Embed an array of chunk texts. Returns `{ ok, vectors }` or
 * `{ ok: false, message }` so callers can react without throwing.
 * @param {string[]} texts
 */
async function embedChunkTexts(texts) {
  try {
    const vectors = await embedDocuments(texts);
    return { ok: true, vectors };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Map chunks + vectors to LanceDB rows.
 * @param {Array<{ text: string, char_start?: number, char_end?: number, page_number?: number }>} chunks
 * @param {Float32Array[]} vectors
 * @param {Record<string, any>} resource
 * @param {string} resourceId
 */
function buildLanceRows(chunks, vectors, resource, resourceId) {
  return chunks.map((ch, i) => ({
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
}

/**
 * Write the freshly-indexed chunks (plus lexical index) for `resourceId` to
 * LanceDB. Returns `{ ok: true }` or `{ ok: false, error, message }`.
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 * @param {Record<string, any>} resource
 * @param {string} resourceId
 * @param {Array<{ text: string, char_start?: number, char_end?: number, page_number?: number }>} chunks
 * @param {Float32Array[]} vectors
 */
async function writeResourceToLance(queries, resource, resourceId, chunks, vectors) {
  const lanceRows = buildLanceRows(chunks, vectors, resource, resourceId);
  try {
    await lancedb.replaceResourceChunks(resourceId, lanceRows);
    await lancedb.upsertLexForResource({
      resource_id: resourceId,
      title: String(resource.title || ''),
      type: String(resource.type || ''),
      project_id: resource.project_id,
      content: String(resource.content || ''),
    });
    return { ok: true };
  } catch (e) {
    const message = String(e?.message || e);
    return { ok: false, error: 'lance_write_failed', message };
  }
}

/**
 * Scan a sample of other indexed resources, compute their centroids, and
 * upsert the top-K semantic auto-edges that pass `threshold`.
 * @param {Record<string, import('better-sqlite3').Statement>} queries
 * @param {string} resourceId
 * @param {Float32Array[]} vectors
 * @param {number} threshold
 * @param {number} neighborBudget
 * @param {number} now
 */
async function scanAndUpsertRelations(queries, resourceId, vectors, threshold, neighborBudget, now) {
  const myCentroid = centroidL2Normalized(sampleEvenlyForCentroid(vectors));
  if (!myCentroid) return [];

  let otherIds = [];
  try {
    otherIds = await lancedb.listIndexedResourceIdsExcluding(resourceId);
  } catch (e) {
    console.warn('[indexing.pipeline] lance list neighbors', e?.message || e);
  }
  const sampled = sampleNeighborIds(otherIds, neighborBudget);
  const relations = [];
  let relScan = 0;
  for (const otherId of sampled) {
    relScan += 1;
    if (relScan % 48 === 0) {
      await new Promise((r) => setImmediate(r));
    }
    const candidate = await tryReadNeighborCentroid(otherId);
    if (!candidate) continue;
    const sim = dotNormalized(myCentroid, candidate);
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
  return topK;
}

/**
 * Read + L2-normalize the centroid of another resource for relation scoring.
 * Returns null when the resource has no vectors or the centroid degenerates.
 * @param {string} otherId
 */
async function tryReadNeighborCentroid(otherId) {
  let ovecs = [];
  try {
    ovecs = await lancedb.sampleVectorsForCentroid(otherId, MAX_EMBEDDINGS_FOR_CENTROID);
  } catch {
    return null;
  }
  if (!ovecs.length) return null;
  return centroidL2Normalized(ovecs);
}

/**
 * Normalize the user-supplied indexing options, applying defaults.
 * @param {{ threshold?: number, neighborScanBudget?: number, skipSemanticRelations?: boolean }} options
 */
function resolveIndexOptions(options) {
  const threshold =
    typeof options.threshold === 'number' ? options.threshold : DEFAULT_THRESHOLD;
  const neighborBudget =
    typeof options.neighborScanBudget === 'number' && options.neighborScanBudget > 0
      ? Math.floor(options.neighborScanBudget)
      : MAX_NEIGHBOR_CANDIDATES;
  const skipRelations = options.skipSemanticRelations === true;
  return { threshold, neighborBudget, skipRelations };
}

/**
 * Cap a chunk list at the maximum supported per resource.
 * @param {any[]} chunks
 */
function capChunks(chunks) {
  return chunks.length > MAX_CHUNKS_PER_RESOURCE ? chunks.slice(0, MAX_CHUNKS_PER_RESOURCE) : chunks;
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

  /** Espera a que terminen los trabajos encolados (`indexResource` / `reindexAll`). */
  function waitForIndexerIdle() {
    return _queue;
  }

  /** Una sola indexación activa por recurso (evita ONNX/Lance duplicados). */

  /**
   * @param {string} resourceId
   * @param {{ threshold?: number, neighborScanBudget?: number, skipSemanticRelations?: boolean }} [options]
   */
  function runIndexResourceDeduped(resourceId, options = {}) {
    const hit = GLOBAL_INDEX_INFLIGHT.get(resourceId);
    if (hit) return hit;
    const p = indexResourceImpl(resourceId, options).finally(() => {
      if (GLOBAL_INDEX_INFLIGHT.get(resourceId) === p) GLOBAL_INDEX_INFLIGHT.delete(resourceId);
    });
    GLOBAL_INDEX_INFLIGHT.set(resourceId, p);
    return p;
  }

  /**
   * @param {string} resourceId
   * @param {{ threshold?: number, neighborScanBudget?: number, skipSemanticRelations?: boolean }} [options]
   */
  async function indexResourceImpl(resourceId, options = {}) {
    const queries = getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) return { ok: false, error: 'not_found' };
    if (!shouldIndexResourceType(resource.type)) return { ok: true, skipped: true };
    if (!isConfigured()) return { ok: true, skipped: true, reason: 'embeddings_not_configured' };

    const { threshold, neighborBudget, skipRelations } = resolveIndexOptions(options);

    const { text, source } = await resolveIndexableText(queries, resource);

    if (isUnindexableText(text, source)) {
      await purgeStoredArtifacts(queries, resourceId, resource);
      return { ok: true, skipped: true, reason: 'empty_text' };
    }

    const truncated = truncateForIndexing(text);
    const chunkResult = await buildChunksForResource(queries, resource, truncated);
    if (!chunkResult.ok) {
      await purgeStoredArtifacts(queries, resourceId, resource);
      return { ok: false, error: chunkResult.error };
    }
    const chunks = chunkResult.chunks;
    if (chunks.length === 0) {
      await purgeStoredArtifacts(queries, resourceId, resource);
      return { ok: true, skipped: true, reason: 'no_chunks' };
    }
    const finalChunks = capChunks(chunks);

    const embedResult = await embedChunkTexts(finalChunks.map((c) => c.text));
    if (!embedResult.ok) {
      await resetPipeline();
      console.error('[indexing.pipeline] embedding_failed', resourceId, embedResult.message);
      finalizeArtifactSearchSurface(queries, resource);
      return { ok: false, error: 'embedding_failed', message: embedResult.message };
    }
    const vectors = embedResult.vectors;
    const now = Date.now();

    queries.deleteChunksByResource.run(resourceId);
    const writeResult = await writeResourceToLance(queries, resource, resourceId, finalChunks, vectors);
    if (!writeResult.ok) {
      console.error('[indexing.pipeline] lance write', resourceId, writeResult.message);
      finalizeArtifactSearchSurface(queries, resource);
      return { ok: false, error: writeResult.error, message: writeResult.message };
    }

    queries.deleteSemanticAutoFromSource.run(resourceId);
    finalizeArtifactSearchSurface(queries, resource);

    if (skipRelations) {
      return { ok: true, count: 0, chunks: finalChunks.length, textSource: source };
    }

    const topK = await scanAndUpsertRelations(
      queries,
      resourceId,
      vectors,
      threshold,
      neighborBudget,
      now,
    );
    return { ok: true, count: topK.length, chunks: finalChunks.length, textSource: source };
  }

  /**
   * @param {{ threshold?: number, skipSemanticRelations?: boolean, onProgress?: (p: { total: number, done: number, errors: number, step?: string }) => void }} [options]
   */
  async function reindexAll(options = {}) {
    _reindexAllInFlight = true;
    const queries = getQueries();
    const rows = queries.listResourcesIdType.all(500000);
    const targets = rows
      .filter((r) => shouldIndexResourceType(r.type))
      .map((r) => ({ id: r.id, type: r.type }));
    const out = { total: targets.length, done: 0, errors: 0 };
    try {
      for (const row of targets) {
        try {
          if (typeof options.onProgress === 'function') {
            options.onProgress({ ...out, step: row.id });
          }
          await runIndexResourceDeduped(row.id, {
            threshold: options.threshold,
            skipSemanticRelations: options.skipSemanticRelations === true,
          });
          out.done += 1;
        } catch {
          out.errors += 1;
        }
        if (typeof options.onProgress === 'function') {
          options.onProgress({ ...out, step: row.id });
        }
      }
    } finally {
      _reindexAllInFlight = false;
    }
    return out;
  }

  /**
   * @param {string} query
   * @param {{ limit?: number, filter?: { type?: string[] } }} [options]
   */
  async function searchSemantic(query, options = {}) {
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const filterTypes = options.filter?.type?.length ? new Set(options.filter.type) : null;
    if (!isConfigured()) return [];
    let qVec;
    try {
      qVec = await embedQuery(query);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes(EMBEDDINGS_NOT_CONFIGURED)) return [];
      throw e;
    }
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
    indexResource: (id, opts) => enqueue(() => runIndexResourceDeduped(id, opts ?? {})),
    reindexAll: (opts) => enqueue(() => reindexAll(opts)),
    searchSemantic: (q, opts) => searchSemantic(q, opts),
    waitForIndexerIdle,
    /** @internal — usar runIndexResourceDeduped salvo tests */
    indexResourceImmediate: runIndexResourceDeduped,
  };
}

module.exports = {
  createIndexer,
  dotNormalized,
  DEFAULT_THRESHOLD,
  TOP_K,
  MAX_NEIGHBOR_CANDIDATES,
  shouldIndexResourceType,
  get reindexAllInFlight() { return _reindexAllInFlight; },
};
