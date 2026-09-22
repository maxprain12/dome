import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { applyMigrations, SCHEMA_HEAD } = require('../core/db/migrations.cjs');

test('migration 78 adds plugin grants and durable publication receipts', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '77', 0);
  `);
  applyMigrations(db, 77);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'plugin_%' ORDER BY name").all();
  assert.deepEqual(tables.map((row) => row.name), ['plugin_grants', 'plugin_publications']);
  assert.equal(Number(db.prepare("SELECT value FROM settings WHERE key='schema_version'").get().value), SCHEMA_HEAD);
  db.close();
});

