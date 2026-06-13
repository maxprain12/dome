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
const { applyMigrations } = require('./db/migrations.cjs');

let _db = null;
let _queries = null;
/** Avoid duplicate migration/schema work when initDatabase runs from main + init module */
let _schemaInitialized = false;

/**
 * Get database instance (lazy initialization)
 */
function getDB() {
  if (_db) return _db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'dome.db');

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  // Initialize database
  // Use better-sqlite3 for Electron (Node.js runtime)
  // bun:sqlite is only available in Bun runtime, not in Electron
  const Database = require('better-sqlite3');
  _db = new Database(dbPath);

  console.log('✅ SQLite database initialized at:', dbPath);
  return _db;
}

/**
 * Initialize database schema
 */
function initDatabase() {
  if (_schemaInitialized) {
    return;
  }

  const db = getDB();

  // Enable optimizations
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA temp_store = MEMORY');
  db.exec('PRAGMA mmap_size = 30000000000');

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Resources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('note', 'pdf', 'video', 'audio', 'image', 'url', 'document', 'folder', 'notebook')),
      title TEXT NOT NULL,
      content TEXT,
      file_path TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Sources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      resource_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('article', 'book', 'website', 'video', 'podcast', 'other')),
      title TEXT NOT NULL,
      authors TEXT,
      year INTEGER,
      doi TEXT,
      url TEXT,
      publisher TEXT,
      journal TEXT,
      volume TEXT,
      issue TEXT,
      pages TEXT,
      isbn TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
    )
  `);

  // Citations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS citations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      quote TEXT,
      page_number TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    )
  `);

  // Tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Resource-Tags relation
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_tags (
      resource_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (resource_id, tag_id),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Folders for organizing many_agents and canvas_workflows (hierarchy in app layer)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_folders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_folders_parent ON agent_folders(parent_id)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_folders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_folders_parent ON workflow_folders(parent_id)');

  // Dedicated tables for agent/runtime entities previously stored in settings blobs
  db.exec(`
    CREATE TABLE IF NOT EXISTS many_agents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      system_instructions TEXT,
      tool_ids TEXT NOT NULL DEFAULT '[]',
      mcp_server_ids TEXT NOT NULL DEFAULT '[]',
      skill_ids TEXT NOT NULL DEFAULT '[]',
      icon_index INTEGER NOT NULL DEFAULT 1,
      marketplace_id TEXT,
      folder_id TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES agent_folders(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_workflows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      nodes_json TEXT NOT NULL DEFAULT '[]',
      edges_json TEXT NOT NULL DEFAULT '[]',
      marketplace_json TEXT,
      folder_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES workflow_folders(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT 'default' REFERENCES projects(id) ON DELETE CASCADE,
      workflow_name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      entries_json TEXT NOT NULL DEFAULT '[]',
      node_outputs_json TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES canvas_workflows(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('stdio', 'http', 'sse')),
      command TEXT,
      args_json TEXT,
      url TEXT,
      headers_json TEXT,
      env_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      tools_json TEXT,
      enabled_tool_ids_json TEXT,
      last_discovery_at INTEGER,
      last_discovery_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_global_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    -- Legacy: one-time migration to ~/.dome/skills exports rows here; new runtime uses file SKILL.md (see electron/skills/*)
    CREATE TABLE IF NOT EXISTS ai_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_agent_installs (
      marketplace_id TEXT PRIMARY KEY,
      local_agent_id TEXT NOT NULL,
      version TEXT,
      author TEXT,
      source TEXT,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      resource_affinity_json TEXT NOT NULL DEFAULT '[]'
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_workflow_installs (
      template_id TEXT PRIMARY KEY,
      local_workflow_id TEXT NOT NULL,
      version TEXT,
      author TEXT,
      source TEXT,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      resource_affinity_json TEXT NOT NULL DEFAULT '[]'
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_template_mappings (
      template_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Dome provider OAuth session storage (desktop linking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dome_provider_sessions (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Resource Interactions table (notes, annotations, chat messages per resource)
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_interactions (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('note', 'annotation', 'chat')),
      content TEXT NOT NULL,
      position_data TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    )
  `);

  // Semantic chunk embeddings + relations (Nomic 768-d vectors in BLOB)
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_chunks (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB NOT NULL,
      model_version TEXT NOT NULL,
      char_start INTEGER,
      char_end INTEGER,
      page_number INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      UNIQUE(resource_id, chunk_index)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_relations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      similarity REAL NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('auto', 'manual', 'confirmed', 'rejected')),
      label TEXT,
      detected_at INTEGER NOT NULL,
      confirmed_at INTEGER,
      FOREIGN KEY (source_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES resources(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id)
    )
  `);

  // Search Index Cache (precomputed search metadata)
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_index (
      id TEXT PRIMARY KEY,
      resource_id TEXT UNIQUE NOT NULL,
      combined_text TEXT,
      keywords TEXT,
      last_indexed INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    )
  `);

  // Artifacts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL UNIQUE,
      artifact_type TEXT NOT NULL CHECK(artifact_type IN ('task-tracker', 'chart', 'custom')),
      template TEXT,
      state TEXT NOT NULL DEFAULT '{}',
      linked_resource_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_resource_id) REFERENCES resources(id) ON DELETE SET NULL
    )
  `);

  // Indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_resource ON artifacts(resource_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(artifact_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(source_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_citations_resource ON citations(resource_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sources_resource ON sources(resource_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_interactions_resource ON resource_interactions(resource_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_interactions_type ON resource_interactions(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_resource_chunks_resource ON resource_chunks(resource_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_resource_chunks_model ON resource_chunks(model_version)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_semantic_source ON semantic_relations(source_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_semantic_target ON semantic_relations(target_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_semantic_sim ON semantic_relations(similarity DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_search_index_resource ON search_index(resource_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_many_agents_marketplace_id ON many_agents(marketplace_id)');
  // project_id indexes: must run AFTER runMigrations — existing DBs keep old table DDL until migration 23 adds columns
  // folder_id indexes: created in migration 20 after ALTER ADD COLUMN (existing DBs lack column until then)
  db.exec('CREATE INDEX IF NOT EXISTS idx_canvas_workflows_updated_at ON canvas_workflows(updated_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at ON workflow_executions(started_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ai_skills_enabled ON ai_skills(enabled)');

  // Full-text search - STANDALONE FTS tables (no external content)
  // This avoids SQLITE_CORRUPT_VTAB errors that occur with external content tables
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
      resource_id,
      title,
      content
    )
  `);

  // FTS triggers - use resource_id instead of rowid for standalone tables
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS resources_ai AFTER INSERT ON resources BEGIN
      INSERT INTO resources_fts(resource_id, title, content)
      VALUES (new.id, new.title, COALESCE(new.content, ''));
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
      VALUES (new.id, new.title, COALESCE(new.content, ''));
    END
  `);

  // FTS for resource interactions (notes, annotations, chat) - STANDALONE
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
      interaction_id,
      content
    )
  `);

  // Interactions FTS triggers
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

  console.log('✅ Database schema initialized');
  _schemaInitialized = true;
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
  const { backupDatabaseBeforeMigrations, restoreDatabaseFromBackup } = require('./migration-backup.cjs');

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
    applyMigrations(db, version);
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
      } else {
        console.error('[DB] ❌ Failed to repair database corruption with all methods');
        return false;
      }
    }
  }
  
  return false;
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
    _db.close();
    _db = null;
    _queries = null;
    _schemaInitialized = false;
    console.log('✅ Database closed');
  }
}

module.exports = {
  getDB,
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
};
