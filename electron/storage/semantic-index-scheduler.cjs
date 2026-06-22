/* eslint-disable no-console */
'use strict';

const { createIndexer, shouldIndexResourceType, reindexAllInFlight } = require('../services/indexing.pipeline.cjs');
const { isConfigured: isEmbeddingsConfigured } = require('../services/embeddings.service.cjs');
const lancedb = require('../services/lancedb-semantic.cjs');
const { reindexFts } = require('../core/db/fts.cjs');

/** @type {import('../services/indexing.pipeline.cjs').createIndexer extends (a: any) => infer R ? R : never} */
let _indexer = null;

/** @type {import('../core/database.cjs') | null} */
let _database = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const _timers = new Map();

/** Handle for the hourly sweep interval (cleared on app quit). */
let _sweepInterval = null;

/**
 * Handle for the debounced FTS rebuild. DuckDB's `fts` extension does NOT keep
 * its index in sync with table writes (unlike SQLite's FTS5 triggers), so the
 * `fts_main_resources` index must be rebuilt after resources change or searches
 * return stale/empty results. We coalesce bursts of writes into a single rebuild.
 */
let _ftsTimer = null;
const FTS_REINDEX_DEBOUNCE_MS = 2500;

/**
 * Schedule a debounced rebuild of the resources FTS index. Safe to call on every
 * resource mutation; bursts collapse into one rebuild after the writes settle.
 */
function scheduleFtsReindex() {
  if (!_database) return;
  if (_ftsTimer) clearTimeout(_ftsTimer);
  _ftsTimer = setTimeout(() => {
    _ftsTimer = null;
    try {
      const db = _database.getDB();
      reindexFts(db, 'resources').catch((e) =>
        console.warn('[fts-reindex]', e?.message || e),
      );
    } catch (e) {
      console.warn('[fts-reindex]', e?.message || e);
    }
  }, FTS_REINDEX_DEBOUNCE_MS);
}

/** Máx. recursos encolados por barrido automático (evita ráfaga concurrente hacia Lance). */
const AUTO_INDEX_MAX_SCHEDULE_PER_SWEEP = 8;

/**
 * @param {typeof import('../core/database.cjs')} database
 */
function init(database) {
  _database = database;
}

function getIndexer() {
  if (!_database) {
    throw new Error('semantic-index-scheduler: init(database) first');
  }
  if (!_indexer) {
    _indexer = createIndexer({ getQueries: () => _database.getQueries() });
  }
  return _indexer;
}

/**
 * @param {string} resourceId
 */
function scheduleSemanticReindex(resourceId) {
  if (!resourceId || typeof resourceId !== 'string') return;
  // Keep the FTS index in sync regardless of embeddings configuration: this hook
  // fires from every resource write path (IPC, vault-watcher, tools, transcripts).
  scheduleFtsReindex();
  const prev = _timers.get(resourceId);
  if (prev) {
    clearTimeout(prev);
  }
  const t = setTimeout(() => {
    _timers.delete(resourceId);
    getIndexer()
      .indexResource(resourceId)
      .catch((e) => console.warn('[semantic-index-scheduler]', e?.message || e));
  }, 1500);
  _timers.set(resourceId, t);
}

/**
 * @param {{ type?: string } | null} resource
 */
function shouldIndex(resource) {
  return !!(resource && resource.type && shouldIndexResourceType(resource.type));
}

/** Alias for scheduleSemanticReindex — replaces legacy resource-indexer.scheduleIndexing */
function scheduleIndexing(resourceId) {
  scheduleSemanticReindex(resourceId);
}

/**
 * Remove semantic chunks/transcripts for a resource (before delete, if needed without CASCADE).
 * @param {string} resourceId
 */
async function deleteSemanticIndexArtifacts(resourceId) {
  if (!_database || !resourceId) return;
  try {
    const q = _database.getQueries();
    await q.deleteChunksByResource.run(resourceId);
    await q.deleteSemanticAutoFromSource.run(resourceId);
    await q.deleteResourceTranscripts.run(resourceId);
    scheduleFtsReindex();
    void lancedb.deleteChunksForResource(resourceId).catch((e) => {
      console.warn('[semantic-index-scheduler] lance delete', e?.message || e);
    });
    void lancedb.deleteLexForResource(resourceId).catch(() => {});
  } catch (e) {
    console.warn('[semantic-index-scheduler] deleteSemanticIndexArtifacts', e?.message || e);
  }
}

async function indexMissingResources() {
  if (!_database) return;
  if (!await isEmbeddingsConfigured()) return;
  // Don't schedule while a full reindex is running to avoid ONNX worker contention.
  if (reindexAllInFlight) {
    console.log('[AutoIndex] reindexAll in progress — skipping sweep');
    return;
  }
  try {
    const db = _database.getDB();
    const rows = await db.all(`
      SELECT r.id FROM resources r
      WHERE r.type IN ('note','url','document','pdf','notebook','ppt','excel','image','artifact')
      LIMIT 500
    `);
    let scheduled = 0;
    for (const row of rows) {
      if (scheduled >= AUTO_INDEX_MAX_SCHEDULE_PER_SWEEP) break;
      try {
        const n = await lancedb.countChunksForResource(row.id);
        if (!n) {
          scheduleSemanticReindex(row.id);
          scheduled += 1;
        }
      } catch {
        scheduleSemanticReindex(row.id);
        scheduled += 1;
      }
    }
  } catch (e) {
    console.warn('[semantic-index-scheduler] indexMissingResources', e?.message || e);
  }
}

function startAutoIndexing() {
  // One-time FTS rebuild on boot so existing rows are searchable immediately
  // (DuckDB FTS indexes don't persist row changes between sessions).
  setTimeout(() => {
    if (!_database) return;
    try {
      const db = _database.getDB();
      reindexFts(db, 'resources').catch(() => {});
      reindexFts(db, 'resource_interactions').catch(() => {});
    } catch { /* non-fatal */ }
  }, 5_000);
  setTimeout(() => {
    indexMissingResources().catch(() => {});
  }, 15_000);
  _sweepInterval = setInterval(() => {
    indexMissingResources().catch(() => {});
  }, 60 * 60 * 1000);
  console.log('[AutoIndex] Semantic chunk sweep scheduled (startup +15s, hourly)');
}

function stopAutoIndexing() {
  if (_sweepInterval) {
    clearInterval(_sweepInterval);
    _sweepInterval = null;
  }
}

module.exports = {
  init,
  getIndexer,
  scheduleSemanticReindex,
  shouldIndex,
  scheduleIndexing,
  deleteSemanticIndexArtifacts,
  indexMissingResources,
  startAutoIndexing,
  stopAutoIndexing,
};
