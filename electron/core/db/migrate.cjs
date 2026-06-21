/* eslint-disable no-console */
/**
 * DuckDB migration runner (DuckDB migration — Fase 2/3).
 *
 * Discovers domain-grouped migration modules in ./migrations/ and applies any
 * that have not yet been recorded in the `schema_migrations` meta table. Each
 * migration's `up` plus its bookkeeping insert run inside a single transaction
 * so a failure rolls back cleanly.
 *
 * Migration module shape:
 *   module.exports = { id: '0001_core', up: async (db) => { ... } };
 *
 * `db` is a connection returned by `openDuckDb()` (see duckdb.cjs).
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_FILE_RE = /^\d{4}_.*\.cjs$/;

/**
 * Load every migration module, sorted ascending by filename.
 * @returns {{ id: string, up: (db: any) => Promise<void>, file: string }[]}
 */
function loadMigrations() {
  let entries = [];
  try {
    entries = fs.readdirSync(MIGRATIONS_DIR);
  } catch (err) {
    console.warn('[DB] No migrations directory found:', err?.message || err);
    return [];
  }
  const files = entries.filter((f) => MIGRATION_FILE_RE.test(f)).sort();
  return files.map((file) => {
    const mod = require(path.join(MIGRATIONS_DIR, file));
    if (!mod || typeof mod.id !== 'string' || typeof mod.up !== 'function') {
      throw new Error(`Invalid migration module "${file}": must export { id, up }`);
    }
    return { id: mod.id, up: mod.up, file };
  });
}

/**
 * Apply all pending migrations against `db`.
 * @param {import('./duckdb.cjs').DuckDbConnection} db
 */
async function applyMigrations(db) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)',
  );

  const appliedRows = await db.all('SELECT id FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.id));

  const migrations = loadMigrations();
  let count = 0;

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await db.transaction(async (tx) => {
      await migration.up(tx);
      await tx.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
        migration.id,
        Date.now(),
      ]);
    });
    count += 1;
    console.log(`[DB] Applied migration ${migration.id}`);
  }

  if (count === 0) {
    console.log('[DB] No pending migrations');
  } else {
    console.log(`[DB] ${count} migration(s) applied`);
  }
  return { applied: count };
}

module.exports = { applyMigrations };
