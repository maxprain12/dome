import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { createBaseSchema } = require('../core/db/schema.cjs');
const { applyMigrations } = require('../core/db/migrations.cjs');
const { runDrizzleMigrations, LEGACY_SCHEMA_VERSION } = require('../core/db/drizzle-bridge.cjs');
const { LEGACY_SCHEMA_VERSION: PKG_VERSION } = require('@dome/db');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '.tmp-drizzle-bridge');

function openFreshDb(name) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, name);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

describe('drizzle-bridge', () => {
  it('LEGACY_SCHEMA_VERSION matches @dome/db', () => {
    assert.equal(LEGACY_SCHEMA_VERSION, PKG_VERSION);
    assert.equal(LEGACY_SCHEMA_VERSION, 53);
  });

  it('fresh install: legacy schema + drizzle baseline converge', () => {
    const db = openFreshDb('fresh.db');
    try {
      createBaseSchema(db);
      applyMigrations(db, 0, () => {});
      const result = runDrizzleMigrations(db);
      assert.equal(result.applied, true);
      const version = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
      assert.equal(parseInt(version.value, 10), LEGACY_SCHEMA_VERSION);
      const drizzleCount = db.prepare('SELECT COUNT(*) AS c FROM __drizzle_migrations').get();
      assert.ok(drizzleCount.c >= 1);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('existing v53: drizzle baseline seeds without error', () => {
    const db = openFreshDb('head.db');
    try {
      createBaseSchema(db);
      applyMigrations(db, 0, () => {});
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(String(LEGACY_SCHEMA_VERSION), Date.now());
      const first = runDrizzleMigrations(db);
      const second = runDrizzleMigrations(db);
      assert.equal(first.applied, true);
      assert.equal(second.applied, true);
      const drizzleCount = db.prepare('SELECT COUNT(*) AS c FROM __drizzle_migrations').get();
      assert.ok(drizzleCount.c >= 1);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
