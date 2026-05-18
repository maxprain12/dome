/* eslint-disable no-console */
/**
 * IPC handlers for LangGraph thread lifecycle management.
 *
 * Exposes the SqliteSaver checkpointer's thread/checkpoint data to the renderer
 * so the UI can implement time-travel, HITL inspection, and thread pruning.
 *
 * Channels:
 *   threads:list         — list thread IDs and their latest metadata
 *   threads:get-state    — get current state for a thread_id
 *   threads:get-history  — get full checkpoint history for a thread_id
 *   threads:delete       — delete all checkpoints for a thread_id
 *   threads:update-state — inject state into a thread (time-travel fork)
 */

const { getDomeCheckpointer } = require('../checkpointer.cjs');

function register({ ipcMain, windowManager, validateSender }) {
  /**
   * threads:list
   * Returns an array of { threadId, createdAt, updatedAt, metadata }
   * by querying the checkpoints table directly.
   */
  ipcMain.handle('threads:list', async (event, opts = {}) => {
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized' };
    try {
      const cp = getDomeCheckpointer();
      const db = cp.db;
      if (!db) return { threads: [] };
      const limit = Math.min(Number(opts.limit ?? 100), 500);
      const rows = db.prepare(`
        SELECT thread_id,
               MIN(checkpoint_id) AS created_checkpoint,
               MAX(checkpoint_id) AS latest_checkpoint,
               COUNT(*) AS checkpoint_count,
               metadata
        FROM checkpoints
        GROUP BY thread_id
        ORDER BY MAX(checkpoint_id) DESC
        LIMIT ?
      `).all(limit);
      const threads = rows.map((row) => {
        let meta = {};
        try { meta = JSON.parse(row.metadata ?? '{}'); } catch { /* ok */ }
        return {
          threadId: row.thread_id,
          checkpointCount: row.checkpoint_count,
          latestCheckpointId: row.latest_checkpoint,
          metadata: meta,
        };
      });
      return { threads };
    } catch (err) {
      console.error('[threads:list]', err?.message);
      return { error: err?.message ?? 'Unknown error', threads: [] };
    }
  });

  /**
   * threads:get-state
   * Returns the current (latest) checkpoint state for a thread_id.
   */
  ipcMain.handle('threads:get-state', async (event, { threadId } = {}) => {
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized' };
    if (!threadId) return { error: 'threadId required' };
    try {
      const cp = getDomeCheckpointer();
      const config = { configurable: { thread_id: threadId } };
      const state = await cp.getTuple(config);
      if (!state) return { state: null };
      return {
        state: {
          threadId,
          checkpointId: state.config?.configurable?.checkpoint_id,
          checkpoint: state.checkpoint,
          metadata: state.metadata,
          createdAt: state.checkpoint?.ts,
        },
      };
    } catch (err) {
      console.error('[threads:get-state]', err?.message);
      return { error: err?.message ?? 'Unknown error', state: null };
    }
  });

  /**
   * threads:get-history
   * Returns the ordered list of checkpoint tuples for a thread.
   * Useful for time-travel UI.
   */
  ipcMain.handle('threads:get-history', async (event, { threadId, limit: rawLimit } = {}) => {
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized' };
    if (!threadId) return { error: 'threadId required' };
    try {
      const cp = getDomeCheckpointer();
      const config = { configurable: { thread_id: threadId } };
      const limit = Math.min(Number(rawLimit ?? 50), 200);
      const history = [];
      for await (const tuple of cp.list(config, { limit })) {
        history.push({
          checkpointId: tuple.config?.configurable?.checkpoint_id,
          parentId: tuple.parentConfig?.configurable?.checkpoint_id ?? null,
          metadata: tuple.metadata,
          createdAt: tuple.checkpoint?.ts,
          channel_values: tuple.checkpoint?.channel_values,
        });
      }
      return { threadId, history };
    } catch (err) {
      console.error('[threads:get-history]', err?.message);
      return { error: err?.message ?? 'Unknown error', history: [] };
    }
  });

  /**
   * threads:delete
   * Removes all checkpoints for a given thread_id.
   * Irreversible — used for pruning old threads or resetting agent state.
   */
  ipcMain.handle('threads:delete', async (event, { threadId } = {}) => {
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized' };
    if (!threadId) return { error: 'threadId required' };
    try {
      const cp = getDomeCheckpointer();
      const db = cp.db;
      if (!db) return { deleted: 0 };
      const result = db.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(threadId);
      // Also remove from writes table if present
      try {
        db.prepare('DELETE FROM checkpoint_writes WHERE thread_id = ?').run(threadId);
      } catch { /* table may not exist in older schema */ }
      console.log(`[threads:delete] removed ${result.changes} checkpoints for thread ${threadId}`);
      return { deleted: result.changes };
    } catch (err) {
      console.error('[threads:delete]', err?.message);
      return { error: err?.message ?? 'Unknown error', deleted: 0 };
    }
  });

  /**
   * threads:update-state
   * Injects values into a thread's state — enables time-travel forks.
   * Writes a new checkpoint with the provided values merged into the current state.
   */
  ipcMain.handle('threads:update-state', async (event, { threadId, values, asNode } = {}) => {
    if (validateSender && !validateSender(event.sender)) return { error: 'Unauthorized' };
    if (!threadId) return { error: 'threadId required' };
    if (!values || typeof values !== 'object') return { error: 'values object required' };
    try {
      const cp = getDomeCheckpointer();
      const config = { configurable: { thread_id: threadId } };
      const updateConfig = await cp.updateState(
        config,
        values,
        asNode ?? null,
      );
      return { success: true, config: updateConfig };
    } catch (err) {
      console.error('[threads:update-state]', err?.message);
      return { error: err?.message ?? 'Unknown error' };
    }
  });
}

module.exports = { register };
