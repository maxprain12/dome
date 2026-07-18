'use strict';

/**
 * Pipeline item event logger — shared by the IPC layer and the pipeline runner.
 * Writes a row to `pipeline_item_events` (migration 53) so the activity feed
 * in the card detail modal can show a chronological history of what happened
 * to a card: created, moved, run started, run completed, run failed, etc.
 */

let _queries = null;

function init(database) {
  _queries = database.getQueries();
}

function logEvent(itemId, eventType, { actor, summary, detail, runId } = {}) {
  if (!_queries || !_queries.createPipelineItemEvent) return;
  try {
    const item = _queries.getPipelineItemById.get(itemId);
    if (!item) return;
    const crypto = require('node:crypto');
    const id = crypto.randomUUID();
    const projectId = item.project_id || 'default';
    _queries.createPipelineItemEvent.run(
      id, itemId, projectId, eventType,
      actor || null,
      summary || null,
      detail ? JSON.stringify(detail) : null,
      runId || null,
      Date.now(),
    );
  } catch {
    // Event logging must never break the caller (run trigger, move, etc.)
  }
}

module.exports = { init, logEvent };