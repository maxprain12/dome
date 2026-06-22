/* eslint-disable no-console */
/**
 * Database Module - Main Process (DuckDB)
 *
 * Migrated from better-sqlite3 to DuckDB (`@duckdb/node-api`). The low-level
 * async connection wrapper lives in `db/duckdb.cjs`; the schema is built by the
 * domain-organized migration runner (`db/migrate.cjs` + `db/migrations/*`); the
 * prepared-statement map is built by `db/queries.cjs` (each statement exposes
 * async `.get/.all/.run`).
 *
 * Because DuckDB's binding is async-only, the data accessors (`db.get/all/run`,
 * `queries.*.get/all/run`, cascade helpers) return Promises. `initDatabase()`
 * must be awaited at startup before `getDB()`/`getQueries()` are used.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { openDuckDb } = require('./db/duckdb.cjs');
const { buildQueries } = require('./db/queries.cjs');
const { applyMigrations } = require('./db/migrate.cjs');
const { reindexFts } = require('./db/fts.cjs');

let _db = null;
let _queries = null;
let _initPromise = null;
let _schemaInitialized = false;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'dome.duckdb');
}

/**
 * Get the active DuckDB connection. Throws if the database has not been
 * initialized yet — callers must `await initDatabase()` during startup first.
 * @returns {import('./db/duckdb.cjs').DuckDbConnection}
 */
function getDB() {
  if (!_db) {
    throw new Error('Database not initialized — call (and await) initDatabase() first');
  }
  return _db;
}

/**
 * Initialize the database: open the connection, run migrations, create the
 * default project, and build queries.
 * Idempotent and safe to call concurrently (work is deduped via a shared promise).
 *
 * NOTE (v2.7): the old SQLite database (`dome.db`) is NOT migrated into DuckDB.
 * Automatic import via DuckDB's `sqlite_scanner` crashed the native binding
 * (SIGTRAP in a libuv worker) on real data, so v2.7 is a deliberately
 * destructive upgrade: it starts with a fresh DuckDB. The old `dome.db` file is
 * left untouched on disk as a manual backup, and `legacyDbNoticeState()` lets
 * the main process warn the user once. See `notifyDestructiveUpgradeIfNeeded`.
 */
async function initDatabase() {
  if (_schemaInitialized) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const dbPath = getDbPath();
    const userDataPath = path.dirname(dbPath);
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    _db = await openDuckDb(dbPath);
    console.log('✅ DuckDB database opened at:', dbPath);

    // Apply domain-organized migrations (idempotent).
    await applyMigrations(_db);

    // Default project.
    await createDefaultProject(_db);

    // Build the prepared-statement map.
    _queries = buildQueries(_db);

    _schemaInitialized = true;
    console.log('✅ Database schema initialized');
  })();
  try {
    await _initPromise;
  } finally {
    _initPromise = null;
  }
}

const LEGACY_NOTICE_KEY = 'legacy_db_destructive_notice_v2_7_shown';

/**
 * Whether a pre-v2.7 SQLite database (`dome.db`) is present and the one-time
 * "your old data is not migrated" notice has not been shown yet. Used by the
 * main process to warn the user once on startup. Best-effort; never throws.
 * @returns {Promise<{ legacyPresent: boolean, noticeShown: boolean, legacyPath: string }>}
 */
async function legacyDbNoticeState() {
  const legacyPath = path.join(path.dirname(getDbPath()), 'dome.db');
  const legacyPresent = fs.existsSync(legacyPath);
  let noticeShown = false;
  try {
    const row = await getDB().get('SELECT value FROM settings WHERE key = ?', [LEGACY_NOTICE_KEY]);
    noticeShown = row?.value === '1';
  } catch {
    /* settings unavailable — treat as not shown */
  }
  return { legacyPresent, noticeShown, legacyPath };
}

/** Persist that the destructive-upgrade notice has been shown (idempotent). */
async function markLegacyDbNoticeShown() {
  try {
    await getDB().run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      [LEGACY_NOTICE_KEY, '1', Date.now()],
    );
  } catch (err) {
    console.warn('[DB] Could not stamp legacy notice flag:', err?.message || err);
  }
}

/**
 * Create the default project if it doesn't exist.
 * @param {import('./db/duckdb.cjs').DuckDbConnection} db
 */
async function createDefaultProject(db) {
  try {
    const existing = await db.get('SELECT id FROM projects WHERE id = ?', ['default']);
    if (!existing) {
      const now = Date.now();
      await db.run(
        'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['default', 'Dome', 'Default workspace', now, now],
      );
      console.log('[DB] Default project created');
    }
  } catch (error) {
    console.error('[DB] Error creating default project:', error.message);
  }
}

/**
 * Get the prepared-statement map (lazy). Synchronous: building the map only
 * constructs lazy async statement wrappers; the statements themselves are awaited.
 */
function getQueries() {
  if (_queries) return _queries;
  _queries = buildQueries(getDB());
  return _queries;
}

/** Invalidate the cached statement map (forces a rebuild on next getQueries). */
function invalidateQueries() {
  _queries = null;
  console.log('[DB] Query cache invalidated');
}

/**
 * Lightweight integrity probe. DuckDB has no PRAGMA integrity_check; a trivial
 * read confirms the connection is healthy and the catalog is readable.
 * @returns {Promise<{ ok: boolean, errors: string[] }>}
 */
async function checkIntegrity() {
  try {
    await getDB().get('SELECT COUNT(*) AS c FROM projects');
    return { ok: true, errors: [] };
  } catch (error) {
    console.error('[DB] Integrity probe failed:', error?.message || error);
    return { ok: false, errors: [error.message] };
  }
}

/**
 * Rebuild the DuckDB FTS indexes (replaces the old SQLite FTS-virtual-table
 * repair). Returns true on success.
 * @returns {Promise<boolean>}
 */
async function repairFTSTables() {
  const db = getDB();
  try {
    await reindexFts(db, 'resources');
    await reindexFts(db, 'resource_interactions');
    invalidateQueries();
    console.log('[DB] ✅ FTS indexes rebuilt');
    return true;
  } catch (error) {
    console.error('[DB] ❌ Failed to rebuild FTS indexes:', error?.message || error);
    return false;
  }
}

/**
 * Aggressive recovery: checkpoint the WAL and rebuild FTS indexes.
 * @returns {Promise<boolean>}
 */
async function attemptFullDatabaseRepair() {
  console.log('[DB] Attempting full database repair...');
  try {
    invalidateQueries();
    try {
      await getDB().exec('CHECKPOINT');
    } catch (e) {
      console.warn('[DB] CHECKPOINT failed (best-effort):', e.message);
    }
    return await repairFTSTables();
  } catch (error) {
    console.error('[DB] Error during full database repair:', error);
    return false;
  }
}

/**
 * Handle a database corruption error by rebuilding FTS indexes / checkpointing.
 * Kept for API compatibility with the SQLite era.
 * @param {Error} error
 * @returns {Promise<boolean>}
 */
async function handleCorruptionError(error) {
  const msg = String(error?.code || error?.message || '');
  if (!isCorruptionError(error)) return false;
  console.warn('[DB] ⚠️ Possible database corruption detected:', msg);
  invalidateQueries();
  if (await repairFTSTables()) return true;
  return attemptFullDatabaseRepair();
}

/** Heuristic: does this error look like an I/O failure? */
function isSqliteIoError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code.startsWith('SQLITE_IOERR') || /disk I\/O error|IO Error/i.test(message);
}

/** Heuristic: does this error look like corruption? */
function isCorruptionError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return /CORRUPT/i.test(code) || /corrupt|malformed/i.test(message);
}

/**
 * Remove DuckDB WAL sidecar for the given db path (best-effort).
 * @param {string} dbPath
 */
function removeWalSidecars(dbPath) {
  for (const suffix of ['.wal']) {
    try {
      const p = `${dbPath}${suffix}`;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Restore from the newest backup and re-init. Full backup/restore is handled by
 * db-backup.cjs (rewritten for DuckDB); if unavailable this is a safe no-op.
 * @returns {Promise<{ restored: boolean, backupPath: string|null, reason?: string }>}
 */
async function restoreFromLatestBackupAndReinit() {
  let backup;
  try {
    backup = require('./db-backup.cjs');
  } catch {
    return { restored: false, backupPath: null, reason: 'backup_module_unavailable' };
  }
  const dbPath = getDbPath();
  await closeDB();
  removeWalSidecars(dbPath);
  const result = (backup.restoreFromLatestBackup && await backup.restoreFromLatestBackup(dbPath)) || {
    restored: false,
    backupPath: null,
  };
  if (!result.restored) return result;
  _schemaInitialized = false;
  invalidateQueries();
  try {
    await initDatabase();
  } catch (err) {
    console.error('[DB] Re-init after backup restore failed:', err?.message || err);
    return { ...result, restored: false, reason: 'reinit_failed' };
  }
  return result;
}

/**
 * Count entities tied to a project (for critical delete confirmation UI).
 * @param {string} projectId
 * @returns {Promise<{ success: boolean, data?: Record<string, number>, error?: string }>}
 */
async function getProjectDeletionImpact(projectId) {
  if (!projectId || typeof projectId !== 'string') {
    return { success: false, error: 'Invalid project id' };
  }
  try {
    const db = getDB();
    const count = async (sql) => (await db.get(sql, [projectId]))?.c ?? 0;
    const data = {
      resources: await count('SELECT COUNT(*) AS c FROM resources WHERE project_id = ?'),
      chatSessions: await count('SELECT COUNT(*) AS c FROM chat_sessions WHERE project_id = ?'),
      agents: await count('SELECT COUNT(*) AS c FROM many_agents WHERE project_id = ?'),
      workflows: await count('SELECT COUNT(*) AS c FROM canvas_workflows WHERE project_id = ?'),
      automations: await count('SELECT COUNT(*) AS c FROM automation_definitions WHERE project_id = ?'),
      runs: await count('SELECT COUNT(*) AS c FROM automation_runs WHERE project_id = ?'),
      flashcardDecks: await count('SELECT COUNT(*) AS c FROM flashcard_decks WHERE project_id = ?'),
      studioOutputs: await count('SELECT COUNT(*) AS c FROM studio_outputs WHERE project_id = ?'),
      agentFolders: await count('SELECT COUNT(*) AS c FROM agent_folders WHERE project_id = ?'),
      workflowFolders: await count('SELECT COUNT(*) AS c FROM workflow_folders WHERE project_id = ?'),
    };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Permanently delete a project and all scoped content (irreversible). Cascades
 * are done explicitly in code (DuckDB FKs don't support ON DELETE CASCADE).
 * @param {string} projectId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function deleteProjectWithContent(projectId) {
  if (!projectId || typeof projectId !== 'string') {
    return { success: false, error: 'Invalid project id' };
  }
  if (projectId === 'default') {
    return { success: false, error: 'Cannot delete the default Dome project' };
  }
  const db = getDB();
  try {
    await db.transaction(async (tx) => {
      const del = (sql) => tx.run(sql, [projectId]);
      const runRows = await tx.all('SELECT id FROM automation_runs WHERE project_id = ?', [projectId]);
      for (const { id: rid } of runRows) {
        await tx.run('DELETE FROM automation_run_steps WHERE run_id = ?', [rid]);
        await tx.run('DELETE FROM automation_run_links WHERE run_id = ?', [rid]);
      }
      await del('DELETE FROM automation_runs WHERE project_id = ?');
      await del('DELETE FROM chat_sessions WHERE project_id = ?');
      await del('DELETE FROM automation_definitions WHERE project_id = ?');
      await del('DELETE FROM canvas_workflows WHERE project_id = ?');
      await del('DELETE FROM many_agents WHERE project_id = ?');
      await del('DELETE FROM agent_folders WHERE project_id = ?');
      await del('DELETE FROM workflow_folders WHERE project_id = ?');
      await del('DELETE FROM flashcard_decks WHERE project_id = ?');
      await del('DELETE FROM studio_outputs WHERE project_id = ?');
      await del('DELETE FROM workflow_executions WHERE project_id = ?');
      await del('DELETE FROM resources WHERE project_id = ?');
      await tx.run('DELETE FROM projects WHERE id = ?', [projectId]);
    });
    invalidateQueries();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete an agent folder: move agents and child folders to the deleted folder's
 * parent, then remove the row.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function deleteAgentFolderCascade(folderId) {
  const db = getDB();
  const queries = getQueries();
  const folder = await queries.getAgentFolderById.get(folderId);
  if (!folder) return { success: false, error: 'Folder not found' };
  const parentId = folder.parent_id ?? null;
  const now = Date.now();
  await db.transaction(async () => {
    await queries.moveManyAgentsFolder.run(parentId, now, folderId);
    await queries.reparentAgentFolders.run(parentId, now, folderId);
    await queries.deleteAgentFolder.run(folderId);
  });
  return { success: true };
}

/**
 * Delete a workflow folder: move workflows and child folders to parent, then
 * remove the row.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function deleteWorkflowFolderCascade(folderId) {
  const db = getDB();
  const queries = getQueries();
  const folder = await queries.getWorkflowFolderById.get(folderId);
  if (!folder) return { success: false, error: 'Folder not found' };
  const parentId = folder.parent_id ?? null;
  const now = Date.now();
  await db.transaction(async () => {
    await queries.moveCanvasWorkflowsFolder.run(parentId, now, folderId);
    await queries.reparentWorkflowFolders.run(parentId, now, folderId);
    await queries.deleteWorkflowFolder.run(folderId);
  });
  return { success: true };
}

/** Close the database connection. */
async function closeDB() {
  if (_db) {
    await _db.close();
    _db = null;
    _queries = null;
    _schemaInitialized = false;
    console.log('✅ Database closed');
  }
}

module.exports = {
  getDB,
  getDbPath,
  initDatabase,
  getQueries,
  closeDB,
  checkIntegrity,
  repairFTSTables,
  handleCorruptionError,
  invalidateQueries,
  attemptFullDatabaseRepair,
  deleteAgentFolderCascade,
  deleteWorkflowFolderCascade,
  getProjectDeletionImpact,
  deleteProjectWithContent,
  removeWalSidecars,
  isSqliteIoError,
  restoreFromLatestBackupAndReinit,
  legacyDbNoticeState,
  markLegacyDbNoticeShown,
};
