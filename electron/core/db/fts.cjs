/* eslint-disable no-console */
/**
 * DuckDB full-text-search helpers (DuckDB migration).
 *
 * The SQLite FTS5 virtual tables + sync triggers are replaced by DuckDB's `fts`
 * extension. `PRAGMA create_fts_index('<table>','<id_col>',<cols...>)` builds an
 * index named `fts_main_<table>`; search uses `fts_main_<table>.match_bm25(id, q)`.
 * Rebuilds use `overwrite=1`. The `fts` extension is loaded by `openDuckDb`.
 */

// table -> { id, columns } describing how to (re)build that table's FTS index.
const FTS_TABLES = {
  resources: { id: 'id', columns: ['title', 'content'] },
  resource_interactions: { id: 'id', columns: ['content'] },
};

function buildPragma(table, spec) {
  const cols = spec.columns.map((c) => `'${c}'`).join(', ');
  return `PRAGMA create_fts_index('${table}', '${spec.id}', ${cols}, overwrite=1)`;
}

/**
 * Create (or rebuild) all FTS indexes. Defensive: a failure on one table logs a
 * warning instead of throwing, so an empty/partial DB still finishes migrating.
 * @param {import('./duckdb.cjs').DuckDbConnection} db
 */
async function createFtsIndexes(db) {
  for (const [table, spec] of Object.entries(FTS_TABLES)) {
    try {
      await db.exec(buildPragma(table, spec));
    } catch (err) {
      console.warn(`[DB] Could not create FTS index for ${table}:`, err?.message || err);
    }
  }
}

/**
 * Rebuild the FTS index for a single table ('resources' | 'resource_interactions').
 * @param {import('./duckdb.cjs').DuckDbConnection} db
 * @param {string} table
 */
async function reindexFts(db, table) {
  const spec = FTS_TABLES[table];
  if (!spec) {
    console.warn(`[DB] reindexFts: unknown FTS table "${table}"`);
    return;
  }
  try {
    await db.exec(buildPragma(table, spec));
  } catch (err) {
    console.warn(`[DB] Could not reindex FTS for ${table}:`, err?.message || err);
  }
}

module.exports = { createFtsIndexes, reindexFts };
