/* eslint-disable no-console */
'use strict';
const { createIndexer, shouldIndexResourceType } = require('../services/text-indexing.cjs');
let database = null;
let indexer = null;
const timers = new Map();
function init(value) { database = value; }
function getIndexer() {
  if (!database) throw new Error('Text index requires a database');
  indexer ||= createIndexer({ getQueries: () => database.getQueries(), getDB: () => database.getDB() });
  return indexer;
}
function scheduleTextIndex(resourceId) {
  if (!resourceId || typeof resourceId !== 'string') return;
  clearTimeout(timers.get(resourceId));
  timers.set(resourceId, setTimeout(() => {
    timers.delete(resourceId);
    getIndexer().indexResource(resourceId).catch((error) => console.warn('[TextIndex]', error.message));
  }, 1500));
}
function shouldIndex(resource) { return !!resource && shouldIndexResourceType(resource.type); }
function stop() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
module.exports = { init, getIndexer, scheduleTextIndex, shouldIndex, scheduleIndexing: scheduleTextIndex, stop };
