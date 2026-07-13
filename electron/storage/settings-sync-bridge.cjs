'use strict';

/**
 * Mirrors allowlisted local settings rows into synced_settings for Domain Sync v1.
 * Secrets (API keys) are never mirrored — they stay in settings-secrets / provider-keys.
 */

const { getOrCreateDeviceId } = require('./device-id.cjs');

/** @type {ReadonlySet<string>} */
const SYNCABLE_SETTING_KEYS = new Set([
  'ai_provider',
  'ai_model',
  'ai_billing_mode',
  'ai_embedding_model',
  'ai_base_url',
  'ollama_base_url',
  'ollama_model',
  'embeddings_provider',
  'embeddings_model',
  'embeddings_base_url',
  'app_theme',
  'app_citation_style',
  'app_auto_save',
  'app_auto_backup',
  'user_role',
  'onboarding_completed',
]);

/**
 * @param {string} key
 */
function isSyncableSettingKey(key) {
  if (SYNCABLE_SETTING_KEYS.has(key)) return true;
  const lower = String(key).toLowerCase();
  if (lower.includes('api_key') || lower.includes('secret') || lower.includes('token')) return false;
  if (lower.includes('password') || lower.includes('credential')) return false;
  return false;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} key
 * @param {string} value
 */
function mirrorSettingChange(db, key, value) {
  if (!isSyncableSettingKey(key)) return;
  const deviceId = getOrCreateDeviceId(db);
  const now = Date.now();
  db.prepare(
    `
      INSERT INTO synced_settings (id, value, updated_at, device_id, deleted_at)
      VALUES (?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        device_id = excluded.device_id,
        deleted_at = NULL
    `,
  ).run(key, String(value ?? ''), now, deviceId);
}

/**
 * Reconcile the synced_settings mirror from the live settings table.
 * mirrorSettingChange only covers a handful of renderer IPC paths; settings
 * written before the mirror existed (or directly in the main process via
 * queries.setSetting) would otherwise never reach the cloud. Called before
 * every settings-domain push so any divergence is picked up within a cycle.
 * @param {import('better-sqlite3').Database} db
 * @returns {number} rows mirrored
 */
function reconcileSyncedSettingsFromLocal(db) {
  const getLocal = db.prepare('SELECT value FROM settings WHERE key = ?');
  const getMirror = db.prepare('SELECT value, deleted_at FROM synced_settings WHERE id = ?');
  let changed = 0;
  for (const key of SYNCABLE_SETTING_KEYS) {
    const local = getLocal.get(key);
    if (!local || local.value == null) continue;
    const value = String(local.value);
    const mirror = getMirror.get(key);
    if (mirror && mirror.deleted_at == null && mirror.value === value) continue;
    mirrorSettingChange(db, key, value);
    changed += 1;
  }
  return changed;
}

/**
 * Copy synced_settings mirror rows into the live settings table.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [windowManager]
 * @returns {string[]}
 */
function applySyncedSettingsToLocal(db, windowManager) {
  const rows = db
    .prepare('SELECT id, value FROM synced_settings WHERE deleted_at IS NULL')
    .all();
  if (!rows.length) return [];

  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const keys = [];
  for (const row of rows) {
    upsert.run(row.id, row.value, now);
    keys.push(row.id);
  }
  if (keys.length) {
    windowManager?.broadcast?.('settings:cloud-updated', { keys });
  }
  return keys;
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function countSyncedSettings(db) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM synced_settings WHERE deleted_at IS NULL').get();
  return Number(row?.n ?? 0);
}

module.exports = {
  SYNCABLE_SETTING_KEYS,
  isSyncableSettingKey,
  mirrorSettingChange,
  reconcileSyncedSettingsFromLocal,
  applySyncedSettingsToLocal,
  countSyncedSettings,
};
