/* eslint-disable no-console */
'use strict';

/**
 * LanceDB embebido (userData/dome-lance): chunks vectoriales + espejo FTS de recursos.
 * Los embeddings ya no se guardan en SQLite (`resource_chunks.embedding`).
 */

const path = require('path');
const fs = require('fs');

const CHUNKS_TABLE = 'semantic_chunks';
const LEX_TABLE = 'resource_lex';
const INDEXED_TABLE = 'indexed_resources';
const MODEL_VERSION = 'nomic-embed-text-v1.5';
const EMBED_DIM = 768;
const MAX_LEX_CHARS = 500_000;
/** Max rows per LanceDB add() call to avoid large Arrow batch allocations for big PDFs. */
const LANCE_WRITE_BATCH = 250;

/** @type {string | null} */
let _root = null;
/** @type {import('@lancedb/lancedb').Connection | null} */
let _conn = null;
/** @type {import('@lancedb/lancedb').Table | null} */
let _chunks = null;
/** @type {import('@lancedb/lancedb').Table | null} */
let _lex = null;
/** @type {import('@lancedb/lancedb').Table | null} */
let _indexed = null;
/** @type {Promise<void> | null} */
let _initPromise = null;
/** @type {boolean} */
let _ftsIndexLex = false;

/**
 * @param {string} s
 */
function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

async function getLanceMod() {
  return import('@lancedb/lancedb');
}

/**
 * @param {string} userDataPath
 */
async function init(userDataPath) {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const lancedb = await getLanceMod();
    const root = path.join(userDataPath, 'dome-lance');
    fs.mkdirSync(root, { recursive: true });
    _root = root;
    _conn = await lancedb.connect(root);
    const names = await _conn.tableNames();

    const dummyVec = new Float32Array(EMBED_DIM);
    const dummyChunk = {
      id: '__dome_init__',
      resource_id: '__init__',
      chunk_index: -1,
      text: '',
      vector: Array.from(dummyVec),
      model_version: MODEL_VERSION,
      char_start: -1,
      char_end: -1,
      page_number: -1,
      res_title: '',
      res_type: 'note',
      project_id: '',
    };

    if (names.includes(CHUNKS_TABLE)) {
      _chunks = await _conn.openTable(CHUNKS_TABLE);
    } else {
      _chunks = await _conn.createTable(CHUNKS_TABLE, [dummyChunk], { mode: 'create' });
      await _chunks.delete("id = '__dome_init__'");
    }

    const dummyLex = {
      resource_id: '__dome_init__',
      title: '',
      type: 'note',
      project_id: '',
      search_text: '',
      updated_at: 0,
    };
    if (names.includes(LEX_TABLE)) {
      _lex = await _conn.openTable(LEX_TABLE);
    } else {
      _lex = await _conn.createTable(LEX_TABLE, [dummyLex], { mode: 'create' });
      await _lex.delete("resource_id = '__dome_init__'");
    }

    const dummyIx = { resource_id: '__dome_init__', model_version: MODEL_VERSION };
    if (names.includes(INDEXED_TABLE)) {
      _indexed = await _conn.openTable(INDEXED_TABLE);
    } else {
      _indexed = await _conn.createTable(INDEXED_TABLE, [dummyIx], { mode: 'create' });
      await _indexed.delete("resource_id = '__dome_init__'");
    }

    console.log('[LanceDB] conectado en', root);

    const ic = await _indexed.countRows();
    const cc = await _chunks.countRows();
    if (ic === 0 && cc > 0) {
      const rows = await _chunks
        .query()
        .filter(`model_version == '${esc(MODEL_VERSION)}'`)
        .select(['resource_id'])
        .toArray();
      const seen = new Set();
      const batch = [];
      for (const r of rows) {
        const id = String(r.resource_id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        batch.push({ resource_id: id, model_version: MODEL_VERSION });
      }
      if (batch.length) {
        await _indexed.add(batch);
        console.log('[LanceDB] indexed_resources rellenado desde chunks:', batch.length);
      }
    }
  })().catch((e) => {
    _initPromise = null;
    console.error('[LanceDB] init falló:', e?.message || e);
    throw e;
  });
  return _initPromise;
}

function assertReady() {
  if (!_chunks || !_lex || !_indexed) throw new Error('LanceDB no inicializado (init(userData) primero)');
}

/**
 * @param {string} resourceId
 */
async function deleteChunksForResource(resourceId) {
  assertReady();
  const e = esc(resourceId);
  await _chunks.delete(`resource_id == '${e}' AND model_version == '${esc(MODEL_VERSION)}'`);
  await unmarkIndexed(resourceId);
}

/**
 * @param {string} resourceId
 * @param {Array<{
 *   chunk_index: number,
 *   text: string,
 *   vector: Float32Array,
 *   char_start: number | null,
 *   char_end: number | null,
 *   page_number: number | null,
 *   res_title: string,
 *   res_type: string,
 *   project_id: string,
 * }>} rows
 */
async function replaceResourceChunks(resourceId, rows) {
  assertReady();
  const e = esc(resourceId);
  await _chunks.delete(`resource_id == '${e}' AND model_version == '${esc(MODEL_VERSION)}'`);
  if (!rows.length) {
    await unmarkIndexed(resourceId);
    return;
  }
  const batch = rows.map((r) => ({
    id: `${resourceId}#${r.chunk_index}`,
    resource_id: resourceId,
    chunk_index: r.chunk_index,
    text: String(r.text ?? ''),
    vector: Array.from(r.vector instanceof Float32Array ? r.vector : Float32Array.from(r.vector)),
    model_version: MODEL_VERSION,
    char_start: r.char_start ?? -1,
    char_end: r.char_end ?? -1,
    page_number: r.page_number ?? -1,
    res_title: String(r.res_title ?? ''),
    res_type: String(r.res_type ?? ''),
    project_id: String(r.project_id ?? ''),
  }));
  for (let i = 0; i < batch.length; i += LANCE_WRITE_BATCH) {
    await _chunks.add(batch.slice(i, i + LANCE_WRITE_BATCH));
    if (i + LANCE_WRITE_BATCH < batch.length) await new Promise((r) => setImmediate(r));
  }
  await markIndexed(resourceId);
}

/**
 * @param {string} resourceId
 */
async function markIndexed(resourceId) {
  assertReady();
  const e = esc(resourceId);
  await _indexed.delete(`resource_id == '${e}'`);
  await _indexed.add([{ resource_id: resourceId, model_version: MODEL_VERSION }]);
}

/**
 * @param {string} resourceId
 */
async function unmarkIndexed(resourceId) {
  assertReady();
  await _indexed.delete(`resource_id == '${esc(resourceId)}'`);
}

/**
 * @param {string} excludeId
 * @returns {Promise<string[]>}
 */
async function listIndexedResourceIdsExcluding(excludeId) {
  assertReady();
  const ex = esc(excludeId);
  const rows = await _indexed
    .query()
    .filter(`resource_id != '${ex}' AND model_version == '${esc(MODEL_VERSION)}'`)
    .select(['resource_id'])
    .toArray();
  return rows.map((r) => String(r.resource_id));
}

/**
 * @param {Float32Array} qVec
 * @param {number} limit
 * @param {Set<string> | null} filterTypes
 */
async function searchSemanticVector(qVec, limit, filterTypes) {
  assertReady();
  const lim = Math.max(1, Math.min(100, limit || 20));
  const pool = lim * 8;
  const q = Array.from(qVec);
  const parts = [`model_version == '${esc(MODEL_VERSION)}'`];
  if (filterTypes && filterTypes.size > 0) {
    const types = [...filterTypes].map((t) => `'${esc(t)}'`);
    parts.push(`res_type IN (${types.join(',')})`);
  }
  const pred = parts.join(' AND ');
  const rows = await _chunks.vectorSearch(q).distanceType('cosine').filter(pred).limit(pool).toArray();

  /** @type {{ resource_id: string, chunk_index: number, char_start: number | null, char_end: number | null, page_number: number | null, snippet: string, score: number, title: string, type: string }[]} */
  const scored = [];
  for (const row of rows) {
    const d = typeof row._distance === 'number' ? row._distance : Number(row._distance ?? 0);
    const score = Math.max(-1, Math.min(1, 1 - d / 2));
    const pnRaw = row.page_number != null ? Number(row.page_number) : null;
    const pn = Number.isFinite(pnRaw) && pnRaw >= 0 ? pnRaw : null;
    const cs = row.char_start != null && Number(row.char_start) >= 0 ? Number(row.char_start) : null;
    const ce = row.char_end != null && Number(row.char_end) >= 0 ? Number(row.char_end) : null;
    scored.push({
      resource_id: String(row.resource_id),
      chunk_index: Number(row.chunk_index),
      char_start: cs,
      char_end: ce,
      page_number: pn,
      snippet: String(row.text || '').slice(0, 400),
      score,
      title: String(row.res_title || 'Untitled'),
      type: String(row.res_type || 'note'),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const topPool = scored.slice(0, lim * 4);
  /** @type {Map<string, (typeof scored)[0]>} */
  const bestByResource = new Map();
  for (const hit of topPool) {
    const prev = bestByResource.get(hit.resource_id);
    if (!prev || hit.score > prev.score) bestByResource.set(hit.resource_id, hit);
  }
  return Array.from(bestByResource.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, lim);
}

/**
 * @param {string} chunkId - resourceId#index
 */
async function getChunkById(chunkId) {
  assertReady();
  const e = esc(chunkId);
  const rows = await _chunks.query().filter(`id == '${e}'`).limit(1).toArray();
  return rows[0] || null;
}

async function countChunksForModel() {
  assertReady();
  return _chunks.countRows(`model_version == '${esc(MODEL_VERSION)}'`);
}

/**
 * Recursos indexables que tienen al menos un chunk en Lance.
 */
async function countIndexedResources() {
  assertReady();
  return _indexed.countRows(`model_version == '${esc(MODEL_VERSION)}'`);
}

/**
 * @param {string} resourceId
 */
async function countChunksForResource(resourceId) {
  assertReady();
  return _chunks.countRows(`resource_id == '${esc(resourceId)}' AND model_version == '${esc(MODEL_VERSION)}'`);
}

/**
 * @param {string} resourceId
 * @param {number} k
 * @returns {Promise<Float32Array[]>}
 */
async function sampleVectorsForCentroid(resourceId, k) {
  assertReady();
  const cnt = await countChunksForResource(resourceId);
  const n = Math.max(0, Math.floor(cnt) || 0);
  if (n === 0) return [];
  const kk = Math.max(1, Math.floor(k) || 1);
  /** @type {number[]} */
  const ranks = [];
  if (n <= kk) {
    for (let i = 0; i < n; i++) ranks.push(i);
  } else {
    for (let j = 0; j < kk; j++) {
      ranks.push(Math.min(n - 1, Math.floor((j * (n - 1)) / Math.max(1, kk - 1))));
    }
  }
  const uniq = [...new Set(ranks)].sort((a, b) => a - b);
  const e = esc(resourceId);
  const inList = uniq.join(', ');
  const rows = await _chunks
    .query()
    .filter(`resource_id == '${e}' AND model_version == '${esc(MODEL_VERSION)}' AND chunk_index IN (${inList})`)
    .select(['vector'])
    .toArray();
  /** @type {Float32Array[]} */
  const out = [];
  for (const row of rows) {
    const v = row.vector;
    if (v instanceof Float32Array) out.push(v);
    else if (Array.isArray(v)) out.push(Float32Array.from(v));
  }
  return out;
}

/**
 * @param {string} resourceId
 */
async function deleteLexForResource(resourceId) {
  assertReady();
  await _lex.delete(`resource_id == '${esc(resourceId)}'`);
}

/**
 * @param {{ resource_id: string, title: string, type: string, project_id: string | null, content: string }} row
 */
async function upsertLexForResource(row) {
  assertReady();
  const rid = String(row.resource_id || '');
  if (!rid) return;
  await deleteLexForResource(rid);
  const title = String(row.title ?? '');
  const body = String(row.content ?? '');
  const search_text =
    (title + '\n' + body).length > MAX_LEX_CHARS
      ? (title + '\n' + body).slice(0, MAX_LEX_CHARS)
      : title + '\n' + body;
  await _lex.add([
    {
      resource_id: rid,
      title,
      type: String(row.type ?? 'note'),
      project_id: String(row.project_id ?? ''),
      search_text,
      updated_at: Date.now(),
    },
  ]);
  if (!_ftsIndexLex) {
    try {
      const lancedb = await getLanceMod();
      await _lex.createIndex('search_text', { config: lancedb.Index.fts(), replace: true });
      _ftsIndexLex = true;
    } catch (err) {
      console.warn('[LanceDB] índice FTS en resource_lex omitido:', err?.message || err);
    }
  }
}

/**
 * Búsqueda BM25 sobre `search_text` (título + contenido denormalizado).
 * @param {string} query
 * @param {number} limit
 * @param {{ project_id?: string, type?: string }} [filters]
 */
async function searchLexResources(query, limit, filters = {}) {
  assertReady();
  const lim = Math.max(1, Math.min(50, limit || 10));
  const q = String(query || '').trim();
  if (!q) return [];
  let predParts = [];
  if (filters.project_id) predParts.push(`project_id == '${esc(String(filters.project_id))}'`);
  if (filters.type) predParts.push(`type == '${esc(String(filters.type))}'`);
  const pre = predParts.length ? predParts.join(' AND ') : null;

  let qy = _lex.search(q, 'fts', 'search_text');
  if (pre) qy = qy.filter(pre);
  const rows = await qy.limit(lim).toArray();
  return rows.map((r) => ({
    id: String(r.resource_id),
    title: String(r.title || ''),
    type: String(r.type || 'note'),
    project_id: String(r.project_id || ''),
    snippet: String(r.search_text || '').slice(0, 220),
  }));
}

/**
 * Copia chunks existentes desde SQLite (solo migración one-shot si Lance está vacío).
 * @param {import('better-sqlite3').Database} sqlite
 */
async function migrateChunksFromSqliteIfNeeded(sqlite) {
  assertReady();
  const cnt = await countChunksForModel();
  if (cnt > 0) return { migrated: 0 };
  const total = sqlite.prepare('SELECT COUNT(*) AS c FROM resource_chunks WHERE model_version = ?').get(MODEL_VERSION);
  const n = Number(total?.c ?? 0) || 0;
  if (n === 0) return { migrated: 0 };

  console.log('[LanceDB] migrando', n, 'chunks desde SQLite…');
  const rows = sqlite
    .prepare(
      `SELECT c.id, c.resource_id, c.chunk_index, c.text, c.embedding, c.model_version,
              c.char_start, c.char_end, c.page_number, r.title AS res_title, r.type AS res_type, r.project_id
       FROM resource_chunks c
       INNER JOIN resources r ON r.id = c.resource_id
       WHERE c.model_version = ?`,
    )
    .all(MODEL_VERSION);
  const { blobToFloats } = require('./embeddings.service.cjs');
  /** @type {Map<string, any[]>} */
  const byRes = new Map();
  for (const row of rows) {
    let vec;
    try {
      vec = blobToFloats(row.embedding);
    } catch {
      continue;
    }
    const rid = String(row.resource_id);
    const item = {
      chunk_index: Number(row.chunk_index),
      text: String(row.text || ''),
      vector: vec,
      char_start: row.char_start ?? -1,
      char_end: row.char_end ?? -1,
      page_number: row.page_number ?? -1,
      res_title: String(row.res_title || ''),
      res_type: String(row.res_type || ''),
      project_id: String(row.project_id || ''),
    };
    if (!byRes.has(rid)) byRes.set(rid, []);
    byRes.get(rid).push(item);
  }
  let migrated = 0;
  for (const [rid, list] of byRes) {
    list.sort((a, b) => a.chunk_index - b.chunk_index);
    await replaceResourceChunks(rid, list);
    migrated += list.length;
  }
  try {
    sqlite.prepare('DELETE FROM resource_chunks WHERE model_version = ?').run(MODEL_VERSION);
  } catch (e) {
    console.warn('[LanceDB] no se pudo vaciar resource_chunks tras migración:', e?.message || e);
  }
  console.log('[LanceDB] migración completada, filas:', migrated);
  return { migrated };
}

/**
 * Rellena `resource_lex` desde SQLite si está vacío.
 * @param {import('better-sqlite3').Database} sqlite
 */
async function bootstrapLexFromSqliteIfNeeded(sqlite) {
  assertReady();
  const lc = await _lex.countRows();
  if (lc > 0) return { rows: 0 };
  const resources = sqlite
    .prepare(
      `SELECT id, title, type, project_id, content FROM resources
       WHERE type IN ('note','url','document','pdf','notebook','ppt','excel','image','artifact')`,
    )
    .all();
  let n = 0;
  for (const r of resources) {
    await upsertLexForResource({
      resource_id: r.id,
      title: r.title,
      type: r.type,
      project_id: r.project_id,
      content: r.content || '',
    });
    n += 1;
  }
  return { rows: n };
}

module.exports = {
  MODEL_VERSION,
  EMBED_DIM,
  CHUNKS_TABLE,
  LEX_TABLE,
  init,
  deleteChunksForResource,
  replaceResourceChunks,
  searchSemanticVector,
  getChunkById,
  countChunksForModel,
  countIndexedResources,
  countChunksForResource,
  sampleVectorsForCentroid,
  listIndexedResourceIdsExcluding,
  deleteLexForResource,
  upsertLexForResource,
  searchLexResources,
  migrateChunksFromSqliteIfNeeded,
  bootstrapLexFromSqliteIfNeeded,
};
