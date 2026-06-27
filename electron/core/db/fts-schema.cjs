/* eslint-disable no-console */
/**
 * FTS5 virtual tables and triggers — not modeled in Drizzle.
 * Idempotent DDL extracted from schema.cjs for post-migration ensure.
 */

function applyJournalMode(db) {
  try {
    const mode = db.pragma('journal_mode = WAL', { simple: true });
    if (String(mode || '').toLowerCase() !== 'wal') {
      console.warn('[DB] Requested WAL journal_mode but SQLite returned:', mode);
    }
  } catch (err) {
    const code = String(err?.code || '');
    const message = String(err?.message || '');
    const isIo = code.startsWith('SQLITE_IOERR') || message.includes('disk I/O error');
    if (!isIo) throw err;
    console.warn('[DB] WAL journal_mode I/O error, falling back to DELETE:', message);
    db.pragma('journal_mode = DELETE');
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function ensureFtsSchema(db) {
  applyJournalMode(db);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
      resource_id,
      title,
      content
    )
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS resources_ai AFTER INSERT ON resources BEGIN
      INSERT INTO resources_fts(resource_id, title, content)
      VALUES (new.id, new.title, COALESCE(new.content_text, new.content, ''));
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS resources_ad AFTER DELETE ON resources BEGIN
      DELETE FROM resources_fts WHERE resource_id = old.id;
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS resources_au AFTER UPDATE ON resources BEGIN
      DELETE FROM resources_fts WHERE resource_id = old.id;
      INSERT INTO resources_fts(resource_id, title, content)
      VALUES (new.id, new.title, COALESCE(new.content_text, new.content, ''));
    END
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
      interaction_id,
      content
    )
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON resource_interactions BEGIN
      INSERT INTO interactions_fts(interaction_id, content)
      VALUES (
        new.id,
        COALESCE(new.content, '') || ' ' || COALESCE(json_extract(new.position_data, '$.selectedText'), '')
      );
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON resource_interactions BEGIN
      DELETE FROM interactions_fts WHERE interaction_id = old.id;
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS interactions_au AFTER UPDATE ON resource_interactions BEGIN
      DELETE FROM interactions_fts WHERE interaction_id = old.id;
      INSERT INTO interactions_fts(interaction_id, content)
      VALUES (
        new.id,
        COALESCE(new.content, '') || ' ' || COALESCE(json_extract(new.position_data, '$.selectedText'), '')
      );
    END
  `);
}

module.exports = { ensureFtsSchema };
