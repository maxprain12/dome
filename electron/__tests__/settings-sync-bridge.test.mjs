import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const {
  isSyncableSettingKey,
  SYNCABLE_SETTING_KEYS,
  reconcileSyncedSettingsFromLocal,
} = require('../storage/settings-sync-bridge.cjs');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
  db.exec(`
    CREATE TABLE synced_settings (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      device_id TEXT,
      deleted_at INTEGER
    )
  `);
  return db;
}

describe('settings-sync-bridge', () => {
  it('allows known AI preference keys', () => {
    assert.equal(SYNCABLE_SETTING_KEYS.has('ai_provider'), true);
    assert.equal(isSyncableSettingKey('ai_model'), true);
  });

  it('rejects secret-like keys', () => {
    assert.equal(isSyncableSettingKey('ai_api_key'), false);
    assert.equal(isSyncableSettingKey('openai_api_key'), false);
    assert.equal(isSyncableSettingKey('embeddings_api_key'), false);
  });

  it('rejects unknown non-secret keys by default', () => {
    assert.equal(isSyncableSettingKey('random_feature_flag'), false);
  });

  it('reconcile mirrors pre-existing local settings into synced_settings', () => {
    const db = makeDb();
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('ai_provider', 'openai', 111);
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('app_theme', 'dark', 111);
    // Non-syncable keys must never be mirrored.
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('ai_api_key', 'sk-secret', 111);

    const changed = reconcileSyncedSettingsFromLocal(db);
    assert.equal(changed, 2);
    const rows = db.prepare('SELECT id, value FROM synced_settings ORDER BY id').all();
    assert.deepEqual(
      rows.map((r) => [r.id, r.value]),
      [['ai_provider', 'openai'], ['app_theme', 'dark']],
    );
  });

  it('reconcile is idempotent and only re-mirrors real divergence', () => {
    const db = makeDb();
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('ai_model', 'dome/auto', 111);

    assert.equal(reconcileSyncedSettingsFromLocal(db), 1);
    assert.equal(reconcileSyncedSettingsFromLocal(db), 0);

    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('openai/gpt-5-nano', 'ai_model');
    assert.equal(reconcileSyncedSettingsFromLocal(db), 1);
    const row = db.prepare('SELECT value FROM synced_settings WHERE id = ?').get('ai_model');
    assert.equal(row.value, 'openai/gpt-5-nano');
  });

  it('reconcile revives a tombstoned mirror when the setting exists locally', () => {
    const db = makeDb();
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('user_role', 'researcher', 111);
    db.prepare(
      'INSERT INTO synced_settings (id, value, updated_at, device_id, deleted_at) VALUES (?, ?, ?, ?, ?)',
    ).run('user_role', 'researcher', 100, 'dev-1', 200);

    assert.equal(reconcileSyncedSettingsFromLocal(db), 1);
    const row = db.prepare('SELECT deleted_at FROM synced_settings WHERE id = ?').get('user_role');
    assert.equal(row.deleted_at, null);
  });
});
