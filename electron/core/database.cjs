/* eslint-disable no-console */
/**
 * Database Module - Main Process
 * Handles all SQLite operations using better-sqlite3
 * Note: Electron runs on Node.js, not Bun, so we use better-sqlite3 instead of bun:sqlite
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const { buildQueries } = require('./db/queries.cjs');
const { createSettingsRepo, createTagsRepo } = require('./db/drizzle-repos.cjs');
const { applyMigrations } = require('./db/migrations.cjs');
const { runDrizzleMigrations, invalidateDrizzle } = require('./db/drizzle-bridge.cjs');
const { invalidateDrizzleRepos } = require('./db/drizzle-repos.cjs');
const { createBaseSchema } = require('./db/schema.cjs');
const { reclaimSpaceIfBloated, repairBloatedCalendarReminders } = require('./db-maintenance.cjs');
const {
  removeWalSidecars,
  findLatestBackup,
  restoreDatabaseFromBackup,
  restoreFromLatestBackup,
  preflightRestoreIfCorrupt,
  isSqliteIoError,
  isCorruptionError,
  createAutomaticBackup,
} = require('./db-backup.cjs');

let _db = null;
let _queries = null;
/** Avoid duplicate migration/schema work when initDatabase runs from main + init module */
let _schemaInitialized = false;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'dome.db');
}

function openDatabaseAt(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  return db;
}

/**
 * Get database instance (lazy initialization)
 */
function getDB() {
  if (_db) return _db;

  const dbPath = getDbPath();
  const userDataPath = path.dirname(dbPath);

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  try {
    _db = openDatabaseAt(dbPath);
  } catch (err) {
    if (!isSqliteIoError(err)) throw err;
    console.warn('[DB] Open failed with I/O error, clearing WAL sidecars and retrying:', err?.message || err);
    removeWalSidecars(dbPath);
    _db = openDatabaseAt(dbPath);
  }

  console.log('✅ SQLite database initialized at:', dbPath);
  return _db;
}

function recoverDatabaseFromIoError(attempt) {
  const dbPath = getDbPath();
  closeDB();
  removeWalSidecars(dbPath);

  if (attempt >= 1) {
    const { restored, backupPath } = restoreFromLatestBackup(dbPath);
    if (restored) {
      console.warn('[DB] Restored database from latest backup after I/O error:', backupPath);
    }
  }
}

function doInitDatabaseSchema() {
  const db = getDB();

  // Base schema (PRAGMAs + tables/indexes/FTS/triggers) — idempotent.
  createBaseSchema(db);

  // Populate FTS tables with existing data (important for external content FTS tables)
  populateFTSTables(db);

  // Run migrations
  runMigrations(db);

  // Indexes on project_id (safe after migration 23 backfill; idempotent for fresh installs)
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_many_agents_project_id ON many_agents(project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_folders_project_id ON agent_folders(project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_folders_project_id ON workflow_folders(project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_canvas_workflows_project_id ON canvas_workflows(project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_executions_project_id ON workflow_executions(project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_automation_definitions_project ON automation_definitions(project_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_automation_runs_project ON automation_runs(project_id)');
  } catch (e) {
    console.warn('[DB] Could not ensure project_id indexes (tables/columns may still be migrating):', e.message);
  }

  // Create default project if it doesn't exist
  createDefaultProject(db);
}

/**
 * Initialize database schema
 */
function initDatabase() {
  if (_schemaInitialized) {
    return;
  }

  const dbPath = getDbPath();
  preflightRestoreIfCorrupt(dbPath);

  const MAX_ATTEMPTS = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      doInitDatabaseSchema();

      const integrity = checkIntegrity(true);
      if (!integrity.ok) {
        throw Object.assign(new Error(`Database quick_check failed: ${integrity.errors.join('; ')}`), {
          code: 'SQLITE_CORRUPT',
        });
      }

      console.log('✅ Database schema initialized');
      _schemaInitialized = true;

      scheduleDeferredDbMaintenance();
      return;
    } catch (err) {
      lastError = err;
      const recoverable = isSqliteIoError(err) || isCorruptionError(err);
      if (!recoverable || attempt === MAX_ATTEMPTS) {
        break;
      }
      console.warn(
        `[DB] Schema init failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        err?.message || err,
      );
      recoverDatabaseFromIoError(attempt);
    }
  }

  throw lastError;
}

/**
 * Defer heavy maintenance so initDatabase returns before VACUUM/repair work.
 */
function scheduleDeferredDbMaintenance() {
  setImmediate(() => {
    if (!_db) return;
    try {
      const repair = repairBloatedCalendarReminders(_db);
      if (repair.repaired > 0) {
        console.log(`[DB] Repaired ${repair.repaired} bloated calendar reminder row(s)`);
      }
    } catch (repairErr) {
      console.warn('[DB] Calendar reminders repair skipped:', repairErr?.message || repairErr);
    }
    try {
      reclaimSpaceIfBloated(_db);
    } catch (maintErr) {
      console.warn('[DB] Space reclaim skipped:', maintErr?.message || maintErr);
    }
    try {
      _db.pragma('optimize');
    } catch (optErr) {
      console.warn('[DB] PRAGMA optimize skipped:', optErr?.message || optErr);
    }
  });
}

/**
 * Populate FTS tables with existing data
 * For standalone FTS tables, we need to sync data from the main tables
 * @param {import('better-sqlite3').Database} db
 */
function populateFTSTables(db) {
  try {
    // Check if resources_fts needs to be populated
    const resourcesCount = db.prepare('SELECT COUNT(*) as count FROM resources').get();
    const resourcesFtsCount = db.prepare('SELECT COUNT(*) as count FROM resources_fts').get();
    
    if (resourcesCount.count > 0 && resourcesFtsCount.count === 0) {
      console.log('[DB] Populating resources_fts with existing data...');
      db.exec(`
        INSERT INTO resources_fts(resource_id, title, content)
        SELECT id, title, COALESCE(content, '') FROM resources
      `);
      console.log(`[DB] Populated resources_fts with ${resourcesCount.count} records`);
    }
    
    // Check if interactions_fts needs to be populated
    const interactionsCount = db.prepare('SELECT COUNT(*) as count FROM resource_interactions').get();
    const interactionsFtsCount = db.prepare('SELECT COUNT(*) as count FROM interactions_fts').get();
    
    if (interactionsCount.count > 0 && interactionsFtsCount.count === 0) {
      console.log('[DB] Populating interactions_fts with existing data...');
      db.exec(`
        INSERT INTO interactions_fts(interaction_id, content)
        SELECT 
          id, 
          COALESCE(content, '') || ' ' || COALESCE(json_extract(position_data, '$.selectedText'), '')
        FROM resource_interactions
      `);
      console.log(`[DB] Populated interactions_fts with ${interactionsCount.count} records`);
    }
  } catch (error) {
    console.error('[DB] Error populating FTS tables:', error.message);
  }
}

/**
 * Create default project if it doesn't exist
 * @param {import('better-sqlite3').Database} db
 */
function createDefaultProject(db) {
  try {
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get('default');
    if (!existing) {
      const now = Date.now();
      db.prepare(`
        INSERT INTO projects (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('default', 'Dome', 'Default workspace', now, now);
      console.log('[DB] Default project created');
    }
  } catch (error) {
    console.error('[DB] Error creating default project:', error.message);
  }
}

/**
 * Run database migrations: backup, apply ordered migrations, restore on failure.
 */
function runMigrations(db) {
  const { backupDatabaseBeforeMigrations, restoreDatabaseFromBackup } = require('./db-backup.cjs');

  // Get current schema version
  let version = 0;
  try {
    const result = db.prepare('SELECT value FROM settings WHERE key = ?').get('schema_version');
    if (result) {
      version = parseInt(result.value, 10);
    }
  } catch {
    // Settings table might not exist yet
  }

  let backupPath = null;
  if (db.name) {
    // Flush the WAL so the file copy captures a consistent snapshot.
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      /* checkpoint is best-effort */
    }
    backupPath = backupDatabaseBeforeMigrations(db.name, version);
  }

  // Migrations toggle PRAGMA foreign_keys (a no-op inside SQLite transactions),
  // so whole-run atomicity is provided by restoring the pre-migration backup on failure.
  try {
    applyMigrations(db, version, invalidateQueries);
    runDrizzleMigrations(db);
  } catch (err) {
    console.error(`[DB] Migration failed (upgrading from schema v${version}):`, err?.message);
    if (backupPath && db.name) {
      const dbPath = db.name;
      try {
        db.close();
      } catch {
        /* ignore */
      }
      if (restoreDatabaseFromBackup(dbPath, backupPath)) {
        throw new Error(
          `Database migration from schema v${version} failed and the database was restored from the pre-migration backup (${backupPath}). Original error: ${err?.message}`,
        );
      }
    }
    throw err;
  }
}

/**
 * Get prepared queries (lazy initialization)
 */
function getQueries() {
  if (_queries) return _queries;
  _queries = buildQueries(getDB());
  return _queries;
}

/**
 * Check database integrity
 * @param {boolean} quick - If true, use quick_check (faster but less thorough)
 * @returns {Object} { ok: boolean, errors: string[] }
 */
function checkIntegrity(quick = false) {
  const db = getDB();
  try {
    const pragma = quick ? 'PRAGMA quick_check' : 'PRAGMA integrity_check';
    const result = db.prepare(pragma).all();
    // Collect all error rows (not just the first one).
    const errors = result
      .map((r) => r.integrity_check || r.quick_check)
      .filter((v) => v && v !== 'ok');
    if (errors.length === 0) {
      return { ok: true, errors: [] };
    }
    return { ok: false, errors };
  } catch (error) {
    console.error('[DB] Error checking integrity:', error);
    return { ok: false, errors: [error.message] };
  }
}

/**
 * Attempt to repair the entire database using SQLite's recovery mechanisms
 * This is a more aggressive repair that tries to fix the database file itself
 * @returns {boolean} - True if repair was attempted, false if not possible
 */
function attemptFullDatabaseRepair() {
  console.log('[DB] Attempting full database repair...');
  
  try {
    // Invalidate all queries first
    invalidateQueries();
    
    const db = getDB();
    
    // Try to run VACUUM to rebuild the database
    // This can sometimes fix corruption issues
    try {
      console.log('[DB] Running VACUUM to rebuild database...');
      db.exec('VACUUM');
      console.log('[DB] VACUUM completed');
    } catch (vacuumError) {
      console.warn('[DB] VACUUM failed (may be due to active transactions):', vacuumError.message);
    }
    
    // Try integrity check again
    const integrity = checkIntegrity(true);
    if (integrity.ok) {
      console.log('[DB] ✅ Database integrity restored after VACUUM');
      return true;
    }
    
    // If still corrupt, try to repair FTS tables again
    console.log('[DB] Integrity still failing, retrying FTS repair...');
    return repairFTSTables();
  } catch (error) {
    console.error('[DB] Error during full database repair:', error);
    return false;
  }
}

/**
 * Invalidate query cache - forces queries to be regenerated
 */
function invalidateQueries() {
  _queries = null;
  invalidateDrizzle();
  invalidateDrizzleRepos();
  console.log('[DB] Query cache invalidated');
}

/**
 * Repair FTS tables if they are corrupted
 * This function recreates the FTS tables and repopulates them
 * After repair, invalidates query cache to ensure fresh queries
 */
function repairFTSTables() {
  const db = getDB();
  console.log('[DB] Attempting to repair FTS tables...');

  try {
    // Ensure no cached statements reference the tables we are about to DROP.
    invalidateQueries();

    // Disable foreign-key enforcement during structural repair to avoid
    // constraint violations while tables/triggers are in an intermediate state.
    db.exec('PRAGMA foreign_keys = OFF');

    // Start transaction
    db.exec('BEGIN TRANSACTION');
    
    // Drop existing triggers first
    db.exec('DROP TRIGGER IF EXISTS resources_ai');
    db.exec('DROP TRIGGER IF EXISTS resources_ad');
    db.exec('DROP TRIGGER IF EXISTS resources_au');
    db.exec('DROP TRIGGER IF EXISTS interactions_ai');
    db.exec('DROP TRIGGER IF EXISTS interactions_ad');
    db.exec('DROP TRIGGER IF EXISTS interactions_au');
    
    // Repair resources_fts
    try {
      // Drop corrupted table
      db.exec('DROP TABLE IF EXISTS resources_fts');
      
      // Recreate table - STANDALONE (no external content)
      db.exec(`
        CREATE VIRTUAL TABLE resources_fts USING fts5(
          resource_id,
          title,
          content
        )
      `);
      
      // Recreate triggers for standalone FTS
      db.exec(`
        CREATE TRIGGER resources_ai AFTER INSERT ON resources BEGIN
          INSERT INTO resources_fts(resource_id, title, content)
          VALUES (new.id, new.title, COALESCE(new.content, ''));
        END
      `);
      
      db.exec(`
        CREATE TRIGGER resources_ad AFTER DELETE ON resources BEGIN
          DELETE FROM resources_fts WHERE resource_id = old.id;
        END
      `);
      
      db.exec(`
        CREATE TRIGGER resources_au AFTER UPDATE ON resources BEGIN
          DELETE FROM resources_fts WHERE resource_id = old.id;
          INSERT INTO resources_fts(resource_id, title, content)
          VALUES (new.id, new.title, COALESCE(new.content, ''));
        END
      `);
      
      // Repopulate from existing resources
      db.exec(`
        INSERT INTO resources_fts(resource_id, title, content)
        SELECT id, title, COALESCE(content, '') FROM resources
      `);
      
      console.log('[DB] resources_fts table repaired');
    } catch (error) {
      console.error('[DB] Error repairing resources_fts:', error.message);
      throw error;
    }
    
    // Repair interactions_fts
    try {
      // Drop corrupted table
      db.exec('DROP TABLE IF EXISTS interactions_fts');
      
      // Recreate table - STANDALONE (no external content)
      db.exec(`
        CREATE VIRTUAL TABLE interactions_fts USING fts5(
          interaction_id,
          content
        )
      `);
      
      // Recreate triggers for standalone FTS
      db.exec(`
        CREATE TRIGGER interactions_ai AFTER INSERT ON resource_interactions BEGIN
          INSERT INTO interactions_fts(interaction_id, content)
          VALUES (
            new.id, 
            COALESCE(new.content, '') || ' ' || COALESCE(json_extract(new.position_data, '$.selectedText'), '')
          );
        END
      `);
      
      db.exec(`
        CREATE TRIGGER interactions_ad AFTER DELETE ON resource_interactions BEGIN
          DELETE FROM interactions_fts WHERE interaction_id = old.id;
        END
      `);
      
      db.exec(`
        CREATE TRIGGER interactions_au AFTER UPDATE ON resource_interactions BEGIN
          DELETE FROM interactions_fts WHERE interaction_id = old.id;
          INSERT INTO interactions_fts(interaction_id, content)
          VALUES (
            new.id, 
            COALESCE(new.content, '') || ' ' || COALESCE(json_extract(new.position_data, '$.selectedText'), '')
          );
        END
      `);
      
      // Repopulate from existing interactions
      db.exec(`
        INSERT INTO interactions_fts(interaction_id, content)
        SELECT 
          id, 
          COALESCE(content, '') || ' ' || COALESCE(json_extract(position_data, '$.selectedText'), '')
        FROM resource_interactions
      `);
      
      console.log('[DB] interactions_fts table repaired');
    } catch (error) {
      console.error('[DB] Error repairing interactions_fts:', error.message);
      throw error;
    }
    
    // Pre-commit verification
    try {
      console.log('[DB] Running pre-commit verification...');
      db.prepare('SELECT COUNT(*) FROM resources_fts').get();
      db.prepare('SELECT COUNT(*) FROM interactions_fts').get();
      console.log('[DB] ✅ Pre-commit verification passed');
    } catch (verifyError) {
      console.error('[DB] ❌ Pre-commit verification failed:', verifyError.message);
      throw verifyError;
    }
    
    // Commit transaction
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');

    // Invalidate queries after repair
    invalidateQueries();

    // Force SQLite to rebuild FTS indexes (optional for standalone tables)
    try {
      db.exec("INSERT INTO resources_fts(resources_fts) VALUES('rebuild')");
    } catch (rebuildError) {
      console.log('[DB] FTS rebuild skipped (table may be empty)');
    }

    try {
      db.exec("INSERT INTO interactions_fts(interactions_fts) VALUES('rebuild')");
    } catch (rebuildError) {
      console.log('[DB] Interactions FTS rebuild skipped (table may be empty)');
    }

    // Post-repair verification - simple count check
    try {
      console.log('[DB] Running post-repair FTS verification...');
      db.prepare('SELECT COUNT(*) FROM resources_fts').get();
      db.prepare('SELECT COUNT(*) FROM interactions_fts').get();
      console.log('[DB] ✅ Post-repair verification passed');
    } catch (verifyError) {
      console.error('[DB] ⚠️ Post-repair FTS verification failed:', verifyError.message);
      return false;
    }

    console.log('[DB] ✅ FTS tables repaired successfully');
    return true;
  } catch (error) {
    // Rollback on error and restore FK enforcement.
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] Error during rollback:', rollbackError.message);
    }
    try {
      db.exec('PRAGMA foreign_keys = ON');
    } catch (_) { /* ignore */ }
    console.error('[DB] ❌ Failed to repair FTS tables:', error.message);
    invalidateQueries();
    return false;
  }
}

/**
 * Handle database corruption errors
 * Attempts to repair FTS tables if the error is SQLITE_CORRUPT_VTAB
 * Falls back to full database repair if FTS repair fails
 * @param {Error} error - The error to handle
 * @returns {boolean} - True if error was handled, false otherwise
 */
function handleCorruptionError(error) {
  // Check if it's a corruption error
  if (error.code === 'SQLITE_CORRUPT' || error.code === 'SQLITE_CORRUPT_VTAB') {
    console.warn('[DB] ⚠️ Database corruption detected:', error.code);
    
    // Invalidate queries first to clear any stale references
    invalidateQueries();
    
    // Try to repair FTS tables first (less invasive)
    const repaired = repairFTSTables();
    
    if (repaired) {
      console.log('[DB] ✅ Database corruption repaired, queries invalidated');
      return true;
    } else {
      // If FTS repair failed, try more aggressive repair
      console.warn('[DB] FTS repair failed, attempting full database repair...');
      const fullRepaired = attemptFullDatabaseRepair();
      
      if (fullRepaired) {
        console.log('[DB] ✅ Full database repair completed');
        return true;
      }

      console.warn('[DB] All repair methods failed, restoring from latest backup...');
      const restored = restoreFromLatestBackupAndReinit();
      if (restored.restored) {
        console.log('[DB] ✅ Database restored from backup:', restored.backupPath);
        return true;
      }

      console.error('[DB] ❌ Failed to repair database corruption with all methods');
      return false;
    }
  }
  
  return false;
}

/**
 * Close connection, restore dome.db from the newest backup, and re-run schema init.
 * @returns {{ restored: boolean, backupPath: string|null, reason?: string }}
 */
function restoreFromLatestBackupAndReinit() {
  const dbPath = getDbPath();
  closeDB();
  removeWalSidecars(dbPath);
  const result = restoreFromLatestBackup(dbPath);
  if (!result.restored) {
    return result;
  }
  _schemaInitialized = false;
  invalidateQueries();
  try {
    initDatabase();
  } catch (err) {
    console.error('[DB] Re-init after backup restore failed:', err?.message || err);
    return { ...result, restored: false, reason: 'reinit_failed' };
  }
  return result;
}

/**
 * Count entities tied to a project (for critical delete confirmation UI).
 * @param {string} projectId
 * @returns {{ success: boolean, data?: Record<string, number>, error?: string }}
 */
function getProjectDeletionImpact(projectId) {
  if (!projectId || typeof projectId !== 'string') {
    return { success: false, error: 'Invalid project id' };
  }
  try {
    const db = getDB();
    const count = (sql) => db.prepare(sql).get(projectId)?.c ?? 0;
    const data = {
      resources: count('SELECT COUNT(*) AS c FROM resources WHERE project_id = ?'),
      chatSessions: count('SELECT COUNT(*) AS c FROM chat_sessions WHERE project_id = ?'),
      agents: count('SELECT COUNT(*) AS c FROM many_agents WHERE project_id = ?'),
      workflows: count('SELECT COUNT(*) AS c FROM canvas_workflows WHERE project_id = ?'),
      automations: count('SELECT COUNT(*) AS c FROM automation_definitions WHERE project_id = ?'),
      runs: count('SELECT COUNT(*) AS c FROM automation_runs WHERE project_id = ?'),
      flashcardDecks: count('SELECT COUNT(*) AS c FROM flashcard_decks WHERE project_id = ?'),
      studioOutputs: count('SELECT COUNT(*) AS c FROM studio_outputs WHERE project_id = ?'),
      agentFolders: count('SELECT COUNT(*) AS c FROM agent_folders WHERE project_id = ?'),
      workflowFolders: count('SELECT COUNT(*) AS c FROM workflow_folders WHERE project_id = ?'),
    };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Permanently delete a project and all scoped content (irreversible).
 * @param {string} projectId
 * @returns {{ success: boolean, error?: string }}
 */
function deleteProjectWithContent(projectId) {
  if (!projectId || typeof projectId !== 'string') {
    return { success: false, error: 'Invalid project id' };
  }
  if (projectId === 'default') {
    return { success: false, error: 'Cannot delete the default Dome project' };
  }
  const db = getDB();
  const del = (sql, ...params) => db.prepare(sql).run(...params);
  try {
    const tx = db.transaction(() => {
      const runIds = db.prepare('SELECT id FROM automation_runs WHERE project_id = ?').all(projectId).map((r) => r.id);
      for (const rid of runIds) {
        del('DELETE FROM automation_run_steps WHERE run_id = ?', rid);
        del('DELETE FROM automation_run_links WHERE run_id = ?', rid);
      }
      del('DELETE FROM automation_runs WHERE project_id = ?', projectId);
      del('DELETE FROM chat_sessions WHERE project_id = ?', projectId);
      del('DELETE FROM automation_definitions WHERE project_id = ?', projectId);
      del('DELETE FROM canvas_workflows WHERE project_id = ?', projectId);
      del('DELETE FROM many_agents WHERE project_id = ?', projectId);
      del('DELETE FROM agent_folders WHERE project_id = ?', projectId);
      del('DELETE FROM workflow_folders WHERE project_id = ?', projectId);
      try {
        del('DELETE FROM flashcard_decks WHERE project_id = ?', projectId);
      } catch {
        /* table may be absent in minimal DBs */
      }
      try {
        del('DELETE FROM studio_outputs WHERE project_id = ?', projectId);
      } catch {
        /* ignore */
      }
      try {
        del('DELETE FROM workflow_executions WHERE project_id = ?', projectId);
      } catch {
        /* ignore */
      }
      del('DELETE FROM resources WHERE project_id = ?', projectId);
      del('DELETE FROM projects WHERE id = ?', projectId);
    });
    tx();
    invalidateQueries();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete an agent folder: move agents and child folders to the deleted folder's parent, then remove row.
 */
function deleteAgentFolderCascade(folderId) {
  const db = getDB();
  const queries = getQueries();
  const folder = queries.getAgentFolderById.get(folderId);
  if (!folder) return { success: false, error: 'Folder not found' };
  const parentId = folder.parent_id;
  const now = Date.now();
  const tx = db.transaction(() => {
    queries.moveManyAgentsFolder.run(parentId ?? null, now, folderId);
    queries.reparentAgentFolders.run(parentId ?? null, now, folderId);
    queries.deleteAgentFolder.run(folderId);
  });
  tx();
  return { success: true };
}

/**
 * Delete a workflow folder: move workflows and child folders to parent, then remove row.
 */
function deleteWorkflowFolderCascade(folderId) {
  const db = getDB();
  const queries = getQueries();
  const folder = queries.getWorkflowFolderById.get(folderId);
  if (!folder) return { success: false, error: 'Folder not found' };
  const parentId = folder.parent_id;
  const now = Date.now();
  const tx = db.transaction(() => {
    queries.moveCanvasWorkflowsFolder.run(parentId ?? null, now, folderId);
    queries.reparentWorkflowFolders.run(parentId ?? null, now, folderId);
    queries.deleteWorkflowFolder.run(folderId);
  });
  tx();
  return { success: true };
}

/**
 * Close database connection
 */
function closeDB() {
  if (_db) {
    try {
      _db.pragma('optimize');
    } catch {
      /* best-effort */
    }
    _db.close();
    _db = null;
    _queries = null;
    _schemaInitialized = false;
    console.log('✅ Database closed');
  }
}


/**
 * Drizzle-backed settings repository (pilot).
 */
function getSettingsRepo() {
  return createSettingsRepo(getDB());
}

/**
 * Drizzle-backed tags repository (pilot).
 */
function getTagsRepo() {
  return createTagsRepo(getDB());
}

module.exports = {
  getDB,
  getDbPath,
  initDatabase,
  getQueries,
  getSettingsRepo,
  getTagsRepo,
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
};
