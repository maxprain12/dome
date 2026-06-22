import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { openDuckDb } = require('../core/db/duckdb.cjs');
const { applyMigrations } = require('../core/db/migrate.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '.tmp-duckdb-import');

function cleanup() {
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
}

// NOTE (v2.7): legacy SQLite import was removed — DuckDB's sqlite_scanner crashed
// the native binding on real data, so v2.7 is a fresh-start (destructive) upgrade.
// This suite now only covers the DuckDB boot path (open + migrations + queries + FTS).

describe('duckdb boot path', () => {
  it('opens, runs migrations, and queries work', async () => {
    cleanup();
    fs.mkdirSync(tmpDir, { recursive: true });
    const duckPath = path.join(tmpDir, 'fresh.duckdb');
    fs.rmSync(duckPath, { force: true });

    const db = await openDuckDb(duckPath);
    await applyMigrations(db);

    // Insert + read via prepared statement
    const { buildQueries } = require('../core/db/queries.cjs');
    const q = buildQueries(db);
    await db.run(
      'INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['t', 'Test', Date.now(), Date.now()],
    );
    const p = await q.getProjectById.get('t');
    assert.equal(p?.name, 'Test');

    // FTS index creation
    const { createFtsIndexes } = require('../core/db/fts.cjs');
    await createFtsIndexes(db);

    await db.close();
    cleanup();
  });
});
