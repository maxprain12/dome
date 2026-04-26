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
 */

const path = require('path');
const { app } = require('electron');

const CHECKPOINT_DB_FILENAME = 'dome-checkpoints.db';

let saver = null;

/** @returns {string} */
function getCheckpointDbPath() {
  return path.join(app.getPath('userData'), CHECKPOINT_DB_FILENAME);
}

/**
 * Lazily build & cache the singleton checkpointer.
 * @returns {import('@langchain/langgraph-checkpoint-sqlite').SqliteSaver}
 */
function getDomeCheckpointer() {
  if (saver) return saver;
  const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');
  const dbPath = getCheckpointDbPath();
  saver = SqliteSaver.fromConnString(dbPath);
  console.log('[Checkpointer] SqliteSaver opened at', dbPath);
  return saver;
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
  CHECKPOINT_DB_FILENAME,
};
