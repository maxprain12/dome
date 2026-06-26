/* eslint-disable no-console */
/**
 * SQLite space maintenance (ELECTRON-7 follow-up).
 *
 * Large, unbounded tool-result rows (run metadata/steps, chat messages) that are
 * later replaced or purged leave behind free pages. With `auto_vacuum = NONE`
 * (the historical default for Dome DBs) those pages are NEVER returned to the OS,
 * so the file only ever grows — real-world installs ballooned to ~6.4GB while
 * holding only a few MB of live data.
 *
 * - `reclaimSpaceIfBloated(db)`: one-time `VACUUM` (after switching to
 *   `auto_vacuum = INCREMENTAL`) when free space exceeds a threshold. Cheap here
 *   because VACUUM only copies live pages (a few MB), not the free ones.
 * - `incrementalVacuum(db)`: return already-freed pages to the OS without a full
 *   rebuild. Safe to call often (e.g. after retention purges).
 *
 * Pure-ish: only depends on the better-sqlite3 handle passed in + the logger.
 */

const logger = require('./logger.cjs');

/** Reclaim once free space crosses ~200MB — well below any healthy working set. */
const RECLAIM_FREE_BYTES_THRESHOLD = 200 * 1024 * 1024;

const AUTO_VACUUM_INCREMENTAL = 2;

function readPageStats(db) {
  const pageSize = Number(db.pragma('page_size', { simple: true })) || 0;
  const pageCount = Number(db.pragma('page_count', { simple: true })) || 0;
  const freelistCount = Number(db.pragma('freelist_count', { simple: true })) || 0;
  const autoVacuum = Number(db.pragma('auto_vacuum', { simple: true })) || 0;
  return {
    pageSize,
    pageCount,
    freelistCount,
    autoVacuum,
    freeBytes: pageSize * freelistCount,
    fileBytes: pageSize * pageCount,
  };
}

/**
 * Run a one-time VACUUM when the DB file is mostly free pages. Switches the DB to
 * INCREMENTAL auto-vacuum first so future deletes can be reclaimed cheaply.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ thresholdBytes?: number }} [opts]
 * @returns {{ ran: boolean, reason?: string, before?: object, after?: object, error?: string }}
 */
function reclaimSpaceIfBloated(db, opts = {}) {
  if (!db || typeof db.pragma !== 'function') return { ran: false, reason: 'no_db' };
  const threshold =
    typeof opts.thresholdBytes === 'number' && opts.thresholdBytes >= 0
      ? opts.thresholdBytes
      : RECLAIM_FREE_BYTES_THRESHOLD;

  let before;
  try {
    before = readPageStats(db);
  } catch (err) {
    return { ran: false, reason: 'pragma_failed', error: err?.message };
  }

  if (before.freeBytes <= threshold) {
    return { ran: false, reason: 'below_threshold', before };
  }

  logger.warn('db-maintenance', 'Excessive free space — reclaiming with VACUUM', {
    freeMB: Math.round(before.freeBytes / 1e6),
    fileMB: Math.round(before.fileBytes / 1e6),
    autoVacuum: before.autoVacuum,
  });

  try {
    // VACUUM rewrites the file; setting auto_vacuum first makes the rebuilt DB
    // INCREMENTAL so incrementalVacuum() works for future deletes. A VACUUM
    // cannot run inside a transaction — callers must invoke this outside one.
    if (before.autoVacuum !== AUTO_VACUUM_INCREMENTAL) {
      db.pragma('auto_vacuum = INCREMENTAL');
    }
    const startedAt = Date.now();
    db.exec('VACUUM');
    const after = readPageStats(db);
    logger.info('db-maintenance', 'VACUUM complete', {
      ms: Date.now() - startedAt,
      beforeMB: Math.round(before.fileBytes / 1e6),
      afterMB: Math.round(after.fileBytes / 1e6),
      reclaimedMB: Math.round((before.fileBytes - after.fileBytes) / 1e6),
    });
    return { ran: true, before, after };
  } catch (err) {
    logger.error('db-maintenance', 'VACUUM failed', { error: err?.message });
    return { ran: false, reason: 'vacuum_failed', error: err?.message };
  }
}

/**
 * Return already-freed pages to the OS (no full rebuild). No-op unless the DB is
 * in INCREMENTAL auto-vacuum mode.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ ran: boolean, reason?: string, error?: string }}
 */
function incrementalVacuum(db) {
  if (!db || typeof db.pragma !== 'function') return { ran: false, reason: 'no_db' };
  try {
    const autoVacuum = Number(db.pragma('auto_vacuum', { simple: true })) || 0;
    if (autoVacuum !== AUTO_VACUUM_INCREMENTAL) {
      return { ran: false, reason: 'not_incremental' };
    }
    db.exec('PRAGMA incremental_vacuum');
    return { ran: true };
  } catch (err) {
    return { ran: false, reason: 'failed', error: err?.message };
  }
}

module.exports = {
  reclaimSpaceIfBloated,
  incrementalVacuum,
  readPageStats,
  RECLAIM_FREE_BYTES_THRESHOLD,
};
