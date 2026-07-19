import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { applyMigrations, SCHEMA_HEAD } = require('../core/db/migrations.cjs');
const { ensureSocialPostEventCardIndex } = require('../core/db/schema.cjs');

describe('social event cards migration', () => {
  it('adds event card fields and advances SQLite to v70', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE social_posts (id TEXT PRIMARY KEY, body TEXT NOT NULL DEFAULT '');
      INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '69', 0);
    `);
    assert.doesNotThrow(() => ensureSocialPostEventCardIndex(db));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_social_posts_event_card'").get().count, 0);
    applyMigrations(db, 69);
    ensureSocialPostEventCardIndex(db);
    const columns = db.prepare("PRAGMA table_info('social_posts')").all().map((column) => column.name);
    assert.ok(columns.includes('event_card_id'));
    assert.ok(columns.includes('event_card_public_url'));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_social_posts_event_card'").get().count, 1);
    assert.equal(Number(db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value), SCHEMA_HEAD);
    db.close();
  });
});
