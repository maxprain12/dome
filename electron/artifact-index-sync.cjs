'use strict';

/* eslint-disable no-console */
const semanticIndexScheduler = require('./semantic-index-scheduler.cjs');

/**
 * After mutating SQLite artifact rows, reschedule embeddings + FTS.
 * @param {import('./database.cjs')} database
 * @param {string} resourceId
 */
function afterArtifactMutation(database, resourceId) {
  if (!database || !resourceId) return;
  try {
    semanticIndexScheduler.init(database);
    semanticIndexScheduler.scheduleSemanticReindex(resourceId);
  } catch (e) {
    console.warn('[artifact-index-sync]', e?.message || e);
  }
}

module.exports = { afterArtifactMutation };
