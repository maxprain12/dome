'use strict';

/**
 * Local tombstone queue for Domain Sync v1 (contract: domain-sync-v1.md §2.3).
 * Deletes enqueue a tombstone; domain-sync pushes unsynced rows then marks synced.
 */

/** @type {Record<string, string[]>} */
const DOMAIN_TABLES = {
  social: ['social_accounts', 'social_posts', 'social_metrics', 'social_account_metrics'],
  pipelines: [
    'pipelines',
    'pipeline_stages',
    'pipeline_sources',
    'pipeline_items',
    'pipeline_item_events',
  ],
  calendar: ['calendar_events', 'calendar_event_links'],
};

const ALL_TABLES = new Set(Object.values(DOMAIN_TABLES).flat());

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @param {string} rowId
 * @param {number} [deletedAt]
 */
function recordTombstone(db, tableName, rowId, deletedAt = Date.now()) {
  if (!db || !tableName || !rowId || !ALL_TABLES.has(tableName)) return;
  db.prepare(`
    INSERT INTO sync_tombstones (table_name, row_id, deleted_at, synced)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(table_name, row_id) DO UPDATE SET
      deleted_at = MAX(sync_tombstones.deleted_at, excluded.deleted_at),
      synced = 0
  `).run(tableName, rowId, deletedAt);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} domain
 * @returns {Array<{ table: string, id: string, deletedAt: number }>}
 */
function getPendingTombstones(db, domain) {
  const tables = DOMAIN_TABLES[domain];
  if (!tables?.length) return [];
  const placeholders = tables.map(() => '?').join(',');
  const rows = db
    .prepare(
      `
        SELECT table_name, row_id, deleted_at
        FROM sync_tombstones
        WHERE synced = 0 AND table_name IN (${placeholders})
      `,
    )
    .all(...tables);
  return rows.map((r) => ({
    table: r.table_name,
    id: r.row_id,
    deletedAt: r.deleted_at,
  }));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{ table: string, id: string }>} tombstones
 */
function markTombstonesSynced(db, tombstones) {
  if (!tombstones?.length) return;
  const stmt = db.prepare(
    'UPDATE sync_tombstones SET synced = 1 WHERE table_name = ? AND row_id = ?',
  );
  const tx = db.transaction((items) => {
    for (const t of items) stmt.run(t.table, t.id);
  });
  tx(tombstones);
}

/**
 * Apply a remote tombstone: delete the local row and drop any pending local tombstone.
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @param {string} rowId
 */
function applyRemoteTombstone(db, tableName, rowId) {
  if (!ALL_TABLES.has(tableName)) return;
  try {
    db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(rowId);
  } catch {
    /* table may not exist on older installs */
  }
  try {
    db.prepare('DELETE FROM sync_tombstones WHERE table_name = ? AND row_id = ?').run(
      tableName,
      rowId,
    );
  } catch {
    /* ignore */
  }
}

/**
 * Tombstone an entire pipeline subtree before CASCADE delete.
 * @param {import('better-sqlite3').Database} db
 * @param {object} queries
 * @param {string} pipelineId
 */
function recordPipelineTreeTombstones(db, queries, pipelineId) {
  const items = queries.listItemsByPipeline.all(pipelineId);
  for (const item of items) recordTombstone(db, 'pipeline_items', item.id);
  const stages = queries.listStagesByPipeline.all(pipelineId);
  for (const stage of stages) recordTombstone(db, 'pipeline_stages', stage.id);
  const sources = queries.listSourcesByPipeline.all(pipelineId);
  for (const source of sources) recordTombstone(db, 'pipeline_sources', source.id);
  recordTombstone(db, 'pipelines', pipelineId);
}

module.exports = {
  DOMAIN_TABLES,
  ALL_TABLES,
  recordTombstone,
  getPendingTombstones,
  markTombstonesSynced,
  applyRemoteTombstone,
  recordPipelineTreeTombstones,
};
