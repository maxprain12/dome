/* eslint-disable no-console */
'use strict';

const { createIndexer, shouldIndexResourceType } = require('./services/indexing.pipeline.cjs');
const { MODEL_VERSION } = require('./services/embeddings.service.cjs');

/** @type {import('./services/indexing.pipeline.cjs').createIndexer extends (a: any) => infer R ? R : never} */
let _indexer = null;

/** @type {import('./database.cjs') | null} */
let _database = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const _timers = new Map();

/**
 * @param {typeof import('./database.cjs')} database
 */
function init(database) {
  _database = database;
  _indexer = null;
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
  } catch (e) {
    console.warn('[semantic-index-scheduler] deleteSemanticIndexArtifacts', e?.message || e);
  }
}

async function indexMissingResources() {
  if (!_database) return;
  try {
    const db = _database.getDB();
    const rows = db
      .prepare(
        `
      SELECT r.id FROM resources r
      WHERE r.type IN ('note','url','document','pdf','notebook','ppt','excel','image')
      AND NOT EXISTS (
        SELECT 1 FROM resource_chunks c WHERE c.resource_id = r.id AND c.model_version = ?
      )
      LIMIT 500
    `,
      )
      .all(MODEL_VERSION);
    for (const row of rows) {
      scheduleSemanticReindex(row.id);
    }
  } catch (e) {
    console.warn('[semantic-index-scheduler] indexMissingResources', e?.message || e);
  }
}

function startAutoIndexing() {
  setTimeout(() => {
    indexMissingResources().catch(() => {});
  }, 15_000);
  setInterval(() => {
    indexMissingResources().catch(() => {});
  }, 60 * 60 * 1000);
  console.log('[AutoIndex] Semantic chunk sweep scheduled (startup +15s, hourly)');
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
};
