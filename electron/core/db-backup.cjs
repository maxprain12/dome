/* eslint-disable no-console */
/**
 * Automatic DuckDB backups + unified restore for dome.duckdb.
 *
 * Backup types:
 *   - dome.duckdb.auto-{reason}-{iso}  — periodic / startup / quit snapshots
 *   - dome.duckdb.backup-v{N}-{iso}    — pre-migration (legacy name kept)
 *
 * DuckDB has no WAL sidecars to clean up (single file + optional .wal which is
 * safe to drop after a CHECKPOINT). Verification opens the file read-only via
 * the DuckDB binding instead of better-sqlite3's PRAGMA quick_check.
 */
const fs = require('fs');
const path = require('path');

const LATEST_SCHEMA_VERSION = 42;
const MAX_AUTO_BACKUPS = 5;
const MAX_MIGRATION_BACKUPS = 3;
/** Skip auto snapshots when the live DB exceeds this (prevents copying multi-GB bloat on Windows). */
const MAX_AUTO_BACKUP_SOURCE_BYTES = 250 * 1024 * 1024;
/** Prefer restore candidates under this size; larger verified backups are a last resort. */
const MAX_PREFERRED_RESTORE_BYTES = 400 * 1024 * 1024;
/** Do not create another auto backup within this window (startup + quit). */
const MIN_BACKUP_INTERVAL_MS = 60 * 60 * 1000;
const AUTO_BACKUP_PREFIX = 'dome.duckdb.auto-';
const MIGRATION_BACKUP_PREFIX = 'dome.duckdb.backup-v';
/** Legacy prefixes from the SQLite era — still recognised for restore discovery
 *  so users upgrading from better-sqlite3 don't lose their old backups. */
const LEGACY_AUTO_BACKUP_PREFIX = 'dome.db.auto-';
const LEGACY_MIGRATION_BACKUP_PREFIX = 'dome.db.backup-v';

let _lastAutoBackupAt = 0;

function isSqliteIoError(err) {
  // Kept for API compatibility with callers (handleCorruptionError etc.).
  // DuckDB I/O errors don't use the SQLITE_* codes, but the heuristic message
  // match catches the equivalent "disk I/O error" / "could not open file" cases.
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  return code.startsWith('SQLITE_IOERR') || /disk I\/O error|IO Error|could not (open|read|write)/i.test(message);
}

function isCorruptionError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  return /CORRUPT/i.test(code) || /corrupt|malformed|not a database/i.test(message);
}

/** Remove stale DuckDB WAL sidecar (common after Task Manager kill on Windows). */
function removeWalSidecars(dbPath) {
  if (!dbPath) return 0;
  let removed = 0;
  for (const suffix of ['.wal']) {
    const sidecar = dbPath + suffix;
    if (!fs.existsSync(sidecar)) continue;
    try {
      fs.unlinkSync(sidecar);
      removed += 1;
      console.warn('[DB] Removed stale DuckDB WAL sidecar:', sidecar);
    } catch (err) {
      console.warn('[DB] Could not remove DuckDB WAL sidecar:', sidecar, err?.message || err);
    }
  }
  return removed;
}

function listAllBackups(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) =>
        f.startsWith(AUTO_BACKUP_PREFIX) ||
        f.startsWith(MIGRATION_BACKUP_PREFIX) ||
        f.startsWith(LEGACY_AUTO_BACKUP_PREFIX) ||
        f.startsWith(LEGACY_MIGRATION_BACKUP_PREFIX),
      )
      .map((f) => {
        const full = path.join(dir, f);
        return { path: full, name: f, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

function looksLikeDuckDbFile(filePath) {
  // DuckDB files start with the magic bytes "DUCK" (0x44 0x55 0x43 0x4B).
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    return buf.toString('utf8', 0, 4) === 'DUCK';
  } catch {
    return false;
  }
}

async function findLatestBackup(dir, opts = {}) {
  const backups = listAllBackups(dir);
  const allowOversized = opts.allowOversized === true;

  for (const passOversized of [false, allowOversized]) {
    for (const backup of backups) {
      let size = 0;
      try {
        size = fs.statSync(backup.path).size;
      } catch {
        continue;
      }
      if (!passOversized && size > MAX_PREFERRED_RESTORE_BYTES) continue;
      const check = await verifyDatabaseFile(backup.path);
      if (check.ok) return backup.path;
    }
    if (allowOversized) break;
  }

  // Fallback: newest reasonably-sized file with a DuckDB header.
  for (const backup of backups) {
    const size = fs.statSync(backup.path).size;
    if (size > MAX_PREFERRED_RESTORE_BYTES) continue;
    if (looksLikeDuckDbFile(backup.path)) return backup.path;
  }
  return null;
}

/** @deprecated use findLatestBackup */
function findLatestPreMigrationBackup(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  try {
    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(MIGRATION_BACKUP_PREFIX) || f.startsWith(LEGACY_MIGRATION_BACKUP_PREFIX))
      .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return backups.length > 0 ? path.join(dir, backups[0].f) : null;
  } catch {
    return null;
  }
}

function pruneBackupsByPrefix(dir, prefix, maxKeep) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(prefix))
      .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(maxKeep)) {
      fs.unlinkSync(path.join(dir, old.f));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Checkpoint the DuckDB WAL into the main file before a file-copy backup.
 * @param {import('./db/duckdb.cjs').DuckDbConnection|null} db
 */
async function checkpointWal(db) {
  if (!db) return;
  try {
    await db.exec('CHECKPOINT');
  } catch {
    /* best-effort */
  }
}

function copyDatabaseFile(dbPath, backupPath) {
  fs.copyFileSync(dbPath, backupPath);
}

function restoreDatabaseFromBackup(dbPath, backupPath) {
  if (!dbPath || !backupPath || !fs.existsSync(backupPath)) return false;
  try {
    copyDatabaseFile(backupPath, dbPath);
    removeWalSidecars(dbPath);
    console.warn('[DB] Database restored from backup:', backupPath);
    return true;
  } catch (err) {
    console.error('[DB] Restore from backup failed:', err?.message);
    return false;
  }
}

async function restoreFromLatestBackup(dbPath) {
  const dir = path.dirname(dbPath);
  const backupPath = await findLatestBackup(dir);
  if (!backupPath) {
    return { restored: false, backupPath: null, reason: 'no_backup' };
  }
  const restored = restoreDatabaseFromBackup(dbPath, backupPath);
  return { restored, backupPath, reason: restored ? 'ok' : 'restore_failed' };
}

/**
 * Create a consistent snapshot (WAL checkpoint + file copy).
 * @param {import('./db/duckdb.cjs').DuckDbConnection|null} db
 * @param {string} dbPath
 * @param {string} reason
 * @param {{ force?: boolean }} [opts]
 */
async function createAutomaticBackup(db, dbPath, reason = 'scheduled', opts = {}) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;

  let sourceBytes = 0;
  try {
    sourceBytes = fs.statSync(dbPath).size;
  } catch {
    return null;
  }
  if (sourceBytes > MAX_AUTO_BACKUP_SOURCE_BYTES) {
    console.warn(
      `[DB] Skipping auto backup (${reason}): database is ${(sourceBytes / 1024 / 1024).toFixed(0)} MB`
      + ` — restore from an older backup (pnpm run restore:db) before snapshotting.`,
    );
    return null;
  }

  const now = Date.now();
  if (!opts.force && now - _lastAutoBackupAt < MIN_BACKUP_INTERVAL_MS) {
    return null;
  }

  const dir = path.dirname(dbPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dir, `${AUTO_BACKUP_PREFIX}${reason}-${stamp}`);

  try {
    await checkpointWal(db);
    copyDatabaseFile(dbPath, backupPath);
    pruneBackupsByPrefix(dir, AUTO_BACKUP_PREFIX, MAX_AUTO_BACKUPS);
    _lastAutoBackupAt = now;
    console.log('[DB] Automatic backup created:', backupPath);
    return backupPath;
  } catch (err) {
    console.error('[DB] Automatic backup failed:', err?.message);
    return null;
  }
}

function backupDatabaseBeforeMigrations(dbPath, currentVersion) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  if (currentVersion >= LATEST_SCHEMA_VERSION) return null;

  const dir = path.dirname(dbPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dir, `${MIGRATION_BACKUP_PREFIX}${currentVersion}-${stamp}`);

  try {
    copyDatabaseFile(dbPath, backupPath);
    console.log('[DB] Pre-migration backup created:', backupPath);
    pruneBackupsByPrefix(dir, MIGRATION_BACKUP_PREFIX, MAX_MIGRATION_BACKUPS);
    return backupPath;
  } catch (err) {
    console.error('[DB] Pre-migration backup failed:', err?.message);
    return null;
  }
}

/**
 * Open dbPath read-only via the DuckDB binding and probe the catalog. Replaces
 * the old better-sqlite3 `PRAGMA quick_check` probe. Returns { ok, errors }.
 *
 * This function is synchronous-friendly (used by the preflight restore path
 * before the main DB is open) but performs async I/O internally — callers must
 * `await` it.
 */
async function verifyDatabaseFile(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { ok: false, errors: ['database file missing'] };
  }
  let conn = null;
  try {
    const { openDuckDb } = require('./db/duckdb.cjs');
    conn = await openDuckDb(dbPath);
    // Trivial catalog probe: a corrupt/empty file will throw here.
    await conn.get('SELECT COUNT(*) AS c FROM information_schema.tables');
    return { ok: true, errors: [] };
  } catch (err) {
    return { ok: false, errors: [err?.message || String(err)] };
  } finally {
    try {
      if (conn) await conn.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * If dome.duckdb fails the catalog probe or cannot open, restore from latest
 * backup. Async (DuckDB probe is async). Returns true if a restore was performed.
 */
async function preflightRestoreIfCorrupt(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) return false;

  removeWalSidecars(dbPath);
  const check = await verifyDatabaseFile(dbPath);
  if (check.ok) return false;

  console.warn('[DB] Preflight check failed:', check.errors.join('; '));
  const { restored, backupPath } = restoreFromLatestBackup(dbPath);
  if (restored) {
    console.warn('[DB] Preflight restored database from:', backupPath);
    return true;
  }
  console.error('[DB] Preflight found corruption but no usable backup to restore');
  return false;
}

module.exports = {
  LATEST_SCHEMA_VERSION,
  MAX_AUTO_BACKUPS,
  MAX_AUTO_BACKUP_SOURCE_BYTES,
  MAX_PREFERRED_RESTORE_BYTES,
  MIN_BACKUP_INTERVAL_MS,
  AUTO_BACKUP_PREFIX,
  MIGRATION_BACKUP_PREFIX,
  isSqliteIoError,
  isCorruptionError,
  removeWalSidecars,
  listAllBackups,
  findLatestBackup,
  findLatestPreMigrationBackup,
  createAutomaticBackup,
  backupDatabaseBeforeMigrations,
  restoreDatabaseFromBackup,
  restoreFromLatestBackup,
  verifyDatabaseFile,
  preflightRestoreIfCorrupt,
  checkpointWal,
};
