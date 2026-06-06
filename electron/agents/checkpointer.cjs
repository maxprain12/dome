/* eslint-disable no-console */
/**
 * Durable LangGraph checkpointer for Dome.
 *
 * Wraps `SqliteSaver` from `@langchain/langgraph-checkpoint-sqlite` so HITL
 * interrupts (calendar / writer / data approvals) survive process restarts.
 * Replaces the previous in-memory `MemorySaver`, which dropped pending
 * interrupts when the app quit.
 *
 * The DB lives at `userData/dome-checkpoints.db` — separate from `dome.db`
 * so the schema migrations in `database.cjs` don't collide with the saver's
 * own setup, and the file can be deleted to reset agent state without
 * touching user content.
 *
 * Schema versioning (2.13):
 *   A `dome_checkpoint_meta` table tracks the Dome-specific schema version.
 *   When the version is outdated, we apply migrations before opening the saver
 *   without interfering with SqliteSaver's own tables.
 *   Current version: 1 (initial)
 */

const path = require('path');
const { app } = require('electron');

const CHECKPOINT_DB_FILENAME = 'dome-checkpoints.db';

/** Bump when `dome_checkpoint_meta` structure changes. */
const DOME_CHECKPOINT_SCHEMA_VERSION = 1;

let saver = null;

/** @returns {string} */
function getCheckpointDbPath() {
  return path.join(app.getPath('userData'), CHECKPOINT_DB_FILENAME);
}

/**
 * Apply Dome-specific migrations to the checkpoint DB.
 * Runs before SqliteSaver opens, so our meta table is always present.
 */
function applyCheckpointMeta(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dome_checkpoint_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    const row = db.prepare('SELECT value FROM dome_checkpoint_meta WHERE key = ?').get('schema_version');
    const currentVersion = row ? parseInt(row.value, 10) : 0;

    if (currentVersion < 1) {
      db.prepare(
        `INSERT INTO dome_checkpoint_meta (key, value) VALUES ('schema_version', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'`,
      ).run();
      console.log('[Checkpointer] dome_checkpoint_meta initialized at schema_version=1');
    }
    // Future versions: add `if (currentVersion < N)` blocks here.
  } catch (err) {
    console.warn('[Checkpointer] applyCheckpointMeta failed:', err?.message);
  }
}

/**
 * Lazily build & cache the singleton checkpointer.
 * @returns {import('@langchain/langgraph-checkpoint-sqlite').SqliteSaver}
 */
function getDomeCheckpointer() {
  if (saver) return saver;
  const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');
  const Database = require('better-sqlite3');
  const dbPath = getCheckpointDbPath();

  // Apply Dome metadata migrations before SqliteSaver opens its own tables.
  try {
    const metaDb = new Database(dbPath);
    applyCheckpointMeta(metaDb);
    metaDb.close();
  } catch (err) {
    console.warn('[Checkpointer] Meta DB open failed:', err?.message);
  }

  saver = SqliteSaver.fromConnString(dbPath);
  console.log('[Checkpointer] SqliteSaver opened at', dbPath, `(schema_version=${DOME_CHECKPOINT_SCHEMA_VERSION})`);
  return saver;
}

/**
 * Read the current Dome checkpoint schema version from the DB.
 * Returns 0 if not yet initialized.
 */
function getCheckpointSchemaVersion() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(getCheckpointDbPath(), { readonly: true });
    const row = db.prepare('SELECT value FROM dome_checkpoint_meta WHERE key = ?').get('schema_version');
    db.close();
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

/** Close the underlying SQLite handle on app quit. Idempotent. */
function closeDomeCheckpointer() {
  if (!saver) return;
  try {
    saver.db?.close?.();
    console.log('[Checkpointer] SqliteSaver closed');
  } catch (err) {
    console.warn('[Checkpointer] close failed:', err?.message);
  } finally {
    saver = null;
  }
}

module.exports = {
  getDomeCheckpointer,
  closeDomeCheckpointer,
  getCheckpointDbPath,
  getCheckpointSchemaVersion,
  CHECKPOINT_DB_FILENAME,
  DOME_CHECKPOINT_SCHEMA_VERSION,
};
