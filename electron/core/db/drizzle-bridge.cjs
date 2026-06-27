/* eslint-disable no-console */
/**
 * Drizzle migration bridge — runs after legacy migrations (schema v53).
 * FTS5 virtual tables and triggers remain raw SQL (see fts-schema.cjs).
 */
const fs = require('fs');
const {
  createDrizzle,
  getMigrationsFolder,
  runDrizzleMigrate,
  LEGACY_SCHEMA_VERSION,
} = require('@dome/db');
const { ensureFtsSchema } = require('./fts-schema.cjs');

let _drizzle = null;

/**
 * @param {import('better-sqlite3').Database} sqlite
 */
function getDrizzle(sqlite) {
  if (!_drizzle) {
    _drizzle = createDrizzle(sqlite);
  }
  return _drizzle;
}

function invalidateDrizzle() {
  _drizzle = null;
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function readLegacySchemaVersion(db) {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
    return row ? parseInt(String(row.value), 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function drizzleMigrationCount(db) {
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM __drizzle_migrations').get();
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Apply Drizzle SQL migrations (no-op baseline + future deltas).
 * Requires legacy schema_version >= LEGACY_SCHEMA_VERSION.
 *
 * @param {import('better-sqlite3').Database} db
 */
function runDrizzleMigrations(db) {
  const legacyVersion = readLegacySchemaVersion(db);
  if (legacyVersion < LEGACY_SCHEMA_VERSION) {
    console.log(
      `[DB] Skipping Drizzle migrations until legacy schema reaches v${LEGACY_SCHEMA_VERSION} (current v${legacyVersion})`,
    );
    return { applied: false, reason: 'legacy_behind' };
  }

  const migrationsFolder = getMigrationsFolder();
  if (!fs.existsSync(migrationsFolder)) {
    console.warn('[DB] Drizzle migrations folder missing:', migrationsFolder);
    return { applied: false, reason: 'missing_folder' };
  }

  invalidateDrizzle();
  getDrizzle(db);
  const before = drizzleMigrationCount(db);
  runDrizzleMigrate(db);
  const after = drizzleMigrationCount(db);

  ensureFtsSchema(db);

  if (after > before) {
    console.log(`[DB] Drizzle migrations applied (${after - before} new)`);
  } else if (before === 0 && after > 0) {
    console.log('[DB] Drizzle baseline seeded');
  }

  return { applied: true, before, after };
}

module.exports = {
  getDrizzle,
  invalidateDrizzle,
  runDrizzleMigrations,
  readLegacySchemaVersion,
  LEGACY_SCHEMA_VERSION,
};
