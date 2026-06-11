/* eslint-disable no-console */
/**
 * Backup dome.db before running schema migrations.
 */
const fs = require('fs');
const path = require('path');

const LATEST_SCHEMA_VERSION = 42;
const MAX_BACKUPS = 3;

function backupDatabaseBeforeMigrations(dbPath, currentVersion) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  if (currentVersion >= LATEST_SCHEMA_VERSION) return null;

  const dir = path.dirname(dbPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dir, `dome.db.backup-v${currentVersion}-${stamp}`);

  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log('[DB] Pre-migration backup created:', backupPath);
    pruneOldBackups(dir);
    return backupPath;
  } catch (err) {
    console.error('[DB] Pre-migration backup failed:', err?.message);
    return null;
  }
}

function pruneOldBackups(dir) {
  try {
    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('dome.db.backup-v'))
      .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of backups.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(dir, old.f));
    }
  } catch {
    /* ignore */
  }
}

function restoreDatabaseFromBackup(dbPath, backupPath) {
  if (!dbPath || !backupPath || !fs.existsSync(backupPath)) return false;
  try {
    fs.copyFileSync(backupPath, dbPath);
    // Stale WAL/SHM files would override the restored main db on next open.
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = dbPath + suffix;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    console.error('[DB] Database restored from pre-migration backup:', backupPath);
    return true;
  } catch (err) {
    console.error('[DB] Restore from backup failed:', err?.message);
    return false;
  }
}

module.exports = {
  backupDatabaseBeforeMigrations,
  restoreDatabaseFromBackup,
  LATEST_SCHEMA_VERSION,
};
