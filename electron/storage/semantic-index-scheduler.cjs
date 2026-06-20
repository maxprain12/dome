/* eslint-disable no-console */
'use strict';

const { createIndexer, shouldIndexResourceType, reindexAllInFlight } = require('../services/indexing.pipeline.cjs');
const { isConfigured: isEmbeddingsConfigured } = require('../services/embeddings.service.cjs');
const lancedb = require('../services/lancedb-semantic.cjs');

/** @type {import('../services/indexing.pipeline.cjs').createIndexer extends (a: any) => infer R ? R : never} */
let _indexer = null;

/** @type {import('../core/database.cjs') | null} */
let _database = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const _timers = new Map();

/** Handle for the hourly sweep interval (cleared on app quit). */
let _sweepInterval = null;

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
function deleteSemanticIndexArtifacts(resourceId) {
  if (!_database || !resourceId) return;
  try {
    const q = _database.getQueries();
    q.deleteChunksByResource.run(resourceId);
    q.deleteSemanticAutoFromSource.run(resourceId);
    q.deleteResourceTranscripts.run(resourceId);
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
  if (!isEmbeddingsConfigured()) return;
  // Don't schedule while a full reindex is running to avoid ONNX worker contention.
  if (reindexAllInFlight) {
    console.log('[AutoIndex] reindexAll in progress — skipping sweep');
    return;
  }
  try {
    const db = _database.getDB();
    const rows = db
      .prepare(
        `
      SELECT r.id FROM resources r
      WHERE r.type IN ('note','url','document','pdf','notebook','ppt','excel','image','artifact')
      LIMIT 500
    `,
      )
      .all();
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
