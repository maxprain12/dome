'use strict';

/**
 * Stable per-installation device id for Domain Sync (anti-echo + LWW tiebreak).
 * Canonical backing: settings table (key `device_id`). Reads fall back to the
 * legacy `dome_cloud_sync` row (bundle sync v3) so upgrades keep the same id;
 * the v65 bridge migration copies it over before dropping that table.
 */

const crypto = require('crypto');

const SETTINGS_KEY = 'device_id';

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {string | null}
 */
function readFromSettings(db) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY);
    return row?.value || null;
  } catch {
    return null;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {string | null}
 */
function readFromLegacyTable(db) {
  try {
    const row = db.prepare('SELECT device_id FROM dome_cloud_sync WHERE id = 1').get();
    return row?.device_id || null;
  } catch {
    return null;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 */
function persistToSettings(db, id) {
  try {
    db.prepare(
      `
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
    ).run(SETTINGS_KEY, id, Date.now());
  } catch {
    // settings table missing (should not happen post-baseline); keep the in-memory id
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getOrCreateDeviceId(db) {
  const fromSettings = readFromSettings(db);
  if (fromSettings) return fromSettings;

  const legacy = readFromLegacyTable(db);
  if (legacy) {
    persistToSettings(db, legacy);
    return legacy;
  }

  const id = crypto.randomUUID();
  persistToSettings(db, id);
  return id;
}

module.exports = { getOrCreateDeviceId, DEVICE_ID_SETTINGS_KEY: SETTINGS_KEY };
