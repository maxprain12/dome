/**
 * 0002_projects — projects
 */
module.exports = {
  id: '0002_projects',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        parent_id TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        vault_root TEXT
      );
    `);
  },
};
