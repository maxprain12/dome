/* eslint-disable no-console */
/**
 * Schedules automatic dome.db snapshots (periodic + startup + quit).
 */
const { createAutomaticBackup, MIN_BACKUP_INTERVAL_MS } = require('./db-backup.cjs');

const AUTO_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let _intervalId = null;
let _database = null;

function runBackup(reason, opts = {}) {
  if (!_database) return null;
  try {
    const dbPath = _database.getDbPath?.();
    if (!dbPath) return null;
    const db = _database.getDB?.();
    return createAutomaticBackup(db, dbPath, reason, opts);
  } catch (err) {
    console.warn(`[DB] ${reason} backup skipped:`, err?.message || err);
    return null;
  }
}

function init(database) {
  _database = database;
  stop();
  _intervalId = setInterval(() => {
    runBackup('periodic');
  }, AUTO_BACKUP_INTERVAL_MS);
  // First periodic-equivalent backup after startup grace (post-init, non-blocking).
  setTimeout(() => {
    runBackup('startup');
  }, 30_000);
}

function backupOnQuit() {
  return runBackup('quit', { force: true });
}

function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = {
  init,
  stop,
  backupOnQuit,
  runBackup,
  AUTO_BACKUP_INTERVAL_MS,
  MIN_BACKUP_INTERVAL_MS,
};
