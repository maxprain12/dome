/**
 * social_posts.notes migration (node:sqlite).
 * Run: node --experimental-sqlite --test electron/__tests__/social-post-notes.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { applyMigrations, SCHEMA_HEAD } = require('../core/db/migrations.cjs');

describe('social post notes', () => {
  it('adds notes column and advances SQLite to schema head', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE social_posts (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL DEFAULT '',
        event_card_id TEXT,
        event_card_public_url TEXT
      );
      INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '70', 0);
      INSERT INTO social_posts (id, body) VALUES ('sp-1', 'hello');
    `);
    applyMigrations(db, 70);
    const columns = db.prepare("PRAGMA table_info('social_posts')").all().map((column) => column.name);
    assert.ok(columns.includes('notes'));
    assert.equal(
      Number(db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value),
      SCHEMA_HEAD,
    );

    db.prepare('UPDATE social_posts SET notes = ? WHERE id = ?').run('Follow up with María', 'sp-1');
    assert.equal(
      db.prepare('SELECT notes FROM social_posts WHERE id = ?').get('sp-1').notes,
      'Follow up with María',
    );
    db.close();
  });
});
