import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { applyMigrations, SCHEMA_HEAD } = require('../core/db/migrations.cjs');

describe('social migration 77', () => {
  it('adds explorations and creator suggestion tables', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
      CREATE TABLE social_accounts (id TEXT PRIMARY KEY, provider TEXT);
      CREATE TABLE social_reports (id TEXT PRIMARY KEY, title TEXT);
      INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '76', 0);
    `);
    applyMigrations(db, 76);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'social_explorations'").get().c, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'social_creator_suggestions'").get().c, 1);
    assert.equal(Number(db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value), SCHEMA_HEAD);
    assert.equal(SCHEMA_HEAD, 77);
    db.close();
  });
});
