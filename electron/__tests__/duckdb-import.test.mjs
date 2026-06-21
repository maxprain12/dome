import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { openDuckDb } = require('../core/db/duckdb.cjs');
const { applyMigrations } = require('../core/db/migrate.cjs');
const { importLegacySqlite } = require('../core/db/legacy-import.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '.tmp-duckdb-import');

function cleanup() {
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
}

function makeLegacySqlite() {
  fs.mkdirSync(tmpDir, { recursive: true });
  const sqlPath = path.join(tmpDir, 'dome.db');
  execFileSync('sqlite3', [sqlPath,
    "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);",
    "CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, description TEXT, created_at INTEGER, updated_at INTEGER);",
    "INSERT INTO settings VALUES ('alpha', 'one', 1000);",
    "INSERT INTO projects VALUES ('p1', 'Legacy', 'from sqlite', NULL, 1000, 1000);",
  ]);
  return sqlPath;
}

describe('legacy-import (sqlite_scanner)', () => {
  it('imports tables column-name-aware and is idempotent', async () => {
    cleanup();
    makeLegacySqlite();
    const duckPath = path.join(tmpDir, 'dome.duckdb');
    fs.rmSync(duckPath, { force: true });
    fs.rmSync(duckPath + '.wal', { force: true });

    const db = await openDuckDb(duckPath);
    await applyMigrations(db);

    const result = await importLegacySqlite(db, duckPath);
    assert.equal(result.imported, true);
    assert.ok(result.tables >= 2, 'expected >= 2 tables copied');

    const setting = await db.get('SELECT value FROM settings WHERE key = ?', ['alpha']);
    assert.equal(setting.value, 'one');

    const project = await db.get('SELECT * FROM projects WHERE id = ?', ['p1']);
    assert.equal(project.name, 'Legacy');

    // Idempotency
    const guard = await db.get('SELECT value FROM settings WHERE key = ?', ['legacy_sqlite_imported']);
    assert.equal(guard.value, '1');
    const result2 = await importLegacySqlite(db, duckPath);
    assert.equal(result2.reason, 'already_imported');

    await db.close();
    cleanup();
  });

  it('no-ops when legacy file is absent', async () => {
    cleanup();
    const duckPath = path.join(tmpDir, 'dome.duckdb');
    fs.rmSync(duckPath, { force: true });
    const db = await openDuckDb(duckPath);
    await applyMigrations(db);

    const result = await importLegacySqlite(db, duckPath);
    assert.equal(result.reason, 'no_legacy_file');
    await db.close();
    cleanup();
  });
});

describe('duckdb boot path', () => {
  it('opens, runs 15 migrations, and queries work', async () => {
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
