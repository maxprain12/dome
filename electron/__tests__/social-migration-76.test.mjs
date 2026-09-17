import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { applyMigrations, SCHEMA_HEAD } = require('../core/db/migrations.cjs');

describe('social migration 76', () => {
  it('adds avatar_url and reference tables', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
      CREATE TABLE social_accounts (id TEXT PRIMARY KEY, provider TEXT);
      CREATE TABLE social_reports (id TEXT PRIMARY KEY, title TEXT);
      INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '75', 0);
    `);
    applyMigrations(db, 75);
    const accountCols = db.prepare("PRAGMA table_info('social_accounts')").all().map((column) => column.name);
    assert.ok(accountCols.includes('avatar_url'));
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'social_references'").get().c, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'social_watchlists'").get().c, 1);
    assert.equal(Number(db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value), SCHEMA_HEAD);
    db.close();
  });
});
