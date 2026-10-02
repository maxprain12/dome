'use strict';

/* eslint-disable no-console */
const textIndexScheduler = require('../storage/text-index-scheduler.cjs');

/**
 * After mutating SQLite artifact rows, reschedule FTS text.
 * @param {import('../core/database.cjs')} database
 * @param {string} resourceId
 */
function afterArtifactMutation(database, resourceId) {
  if (!database || !resourceId) return;
  try {
    textIndexScheduler.init(database);
    textIndexScheduler.scheduleTextIndex(resourceId);
  } catch (e) {
    console.warn('[artifact-index-sync]', e?.message || e);
  }
}

module.exports = { afterArtifactMutation };
