/**
 * 0015_fts — create the DuckDB FTS indexes (replaces SQLite FTS5 virtual tables
 * + sync triggers). See fts.cjs.
 */
module.exports = {
  id: '0015_fts',
  up: async (db) => {
    const { createFtsIndexes } = require('../fts.cjs');
    await createFtsIndexes(db);
  },
};
