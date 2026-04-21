/* eslint-disable no-console */
/**
 * Database Module - Main Process
 * Handles all SQLite operations using better-sqlite3
 * Note: Electron runs on Node.js, not Bun, so we use better-sqlite3 instead of bun:sqlite
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let _db = null;
let _queries = null;

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

  // Indexes
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

function parseJsonValue(raw, fallback) {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeServerId(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function extractLegacyMcpServers(raw) {
  const parsed = parseJsonValue(raw, []);
  if (Array.isArray(parsed)) {
    return parsed.filter((server) => server && typeof server.name === 'string');
  }
  if (parsed && typeof parsed === 'object' && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
    return Object.entries(parsed.mcpServers).map(([name, value]) => ({
      ...(value && typeof value === 'object' ? value : {}),
      name,
    }));
  }
  return [];
}

/**
 * Run database migrations
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
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

  // Migration 1: Add internal file storage columns to resources
  if (version < 1) {
    console.log('[DB] Running migration 1: Add internal file storage columns');

    // Check if columns already exist (for safety)
    const tableInfo = db.prepare('PRAGMA table_info(resources)').all();
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    if (!existingColumns.has('internal_path')) {
      db.exec('ALTER TABLE resources ADD COLUMN internal_path TEXT');
    }
    if (!existingColumns.has('file_mime_type')) {
      db.exec('ALTER TABLE resources ADD COLUMN file_mime_type TEXT');
    }
    if (!existingColumns.has('file_size')) {
      db.exec('ALTER TABLE resources ADD COLUMN file_size INTEGER');
    }
    if (!existingColumns.has('file_hash')) {
      db.exec('ALTER TABLE resources ADD COLUMN file_hash TEXT');
    }
    if (!existingColumns.has('thumbnail_data')) {
      db.exec('ALTER TABLE resources ADD COLUMN thumbnail_data TEXT');
    }
    if (!existingColumns.has('original_filename')) {
      db.exec('ALTER TABLE resources ADD COLUMN original_filename TEXT');
    }

    // Create index on file_hash for deduplication
    db.exec('CREATE INDEX IF NOT EXISTS idx_resources_file_hash ON resources(file_hash)');
    // Create index on internal_path for quick lookups
    db.exec('CREATE INDEX IF NOT EXISTS idx_resources_internal_path ON resources(internal_path)');

    // Update schema version
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at
    `).run(Date.now());

    console.log('[DB] Migration 1 complete');
  }

  // Migration 2: Update resources table CHECK constraint to include 'folder' type
  // ALWAYS check if migration is needed by testing the actual constraint
  let needsFolderConstraintUpdate = false;

  try {
    // Test if we can insert a folder type - this will fail if constraint doesn't include 'folder'
    const testStmt = db.prepare(`
      INSERT INTO resources (id, project_id, type, title, created_at, updated_at)
      VALUES ('__test_folder__', 'default', 'folder', 'Test', 0, 0)
    `);
    testStmt.run();
    // If we got here, constraint already includes 'folder' - delete test row
    db.exec("DELETE FROM resources WHERE id = '__test_folder__'");
    console.log('[DB] Folder type constraint already exists');
  } catch (testError) {
    // Constraint doesn't include 'folder' - we need to update
    needsFolderConstraintUpdate = true;
    console.log('[DB] Folder type constraint missing, migration needed');
  }

  if (needsFolderConstraintUpdate) {
    console.log('[DB] Running migration 2: Update resources type constraint to include folder');

    // SQLite doesn't support altering constraints, so we need to recreate the table
    try {
      // First check which columns exist
      const tableInfo = db.prepare('PRAGMA table_info(resources)').all();
      const existingColumns = new Set(tableInfo.map((col) => col.name));
      console.log('[DB] Existing columns:', Array.from(existingColumns).join(', '));

      // Drop temp table if exists from previous failed attempt
      db.exec('DROP TABLE IF EXISTS resources_new');

      // Create new table with folder type in constraint
      db.exec(`
        CREATE TABLE resources_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('note', 'pdf', 'video', 'audio', 'image', 'url', 'document', 'folder', 'notebook')),
          title TEXT NOT NULL,
          content TEXT,
          file_path TEXT,
          internal_path TEXT,
          file_mime_type TEXT,
          file_size INTEGER,
          file_hash TEXT,
          thumbnail_data TEXT,
          original_filename TEXT,
          folder_id TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (folder_id) REFERENCES resources_new(id) ON DELETE SET NULL
        )
      `);

      // Build column list based on what exists
      const baseColumns = ['id', 'project_id', 'type', 'title', 'content', 'file_path', 'metadata', 'created_at', 'updated_at'];
      const optionalColumns = ['internal_path', 'file_mime_type', 'file_size', 'file_hash', 'thumbnail_data', 'original_filename', 'folder_id'];

      const columnsToCopy = [...baseColumns];
      for (const col of optionalColumns) {
        if (existingColumns.has(col)) {
          columnsToCopy.push(col);
        }
      }

      const columnsStr = columnsToCopy.join(', ');
      console.log('[DB] Copying columns:', columnsStr);

      // Copy data from old table to new
      db.exec(`INSERT INTO resources_new (${columnsStr}) SELECT ${columnsStr} FROM resources`);

      // Drop old table
      db.exec('DROP TABLE resources');

      // Rename new table
      db.exec('ALTER TABLE resources_new RENAME TO resources');

      // Recreate indexes
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_file_hash ON resources(file_hash)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_internal_path ON resources(internal_path)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_folder ON resources(folder_id)');

      // Recreate FTS triggers (they were dropped with the old table) - standalone FTS
      try {
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
      } catch (triggerError) {
        console.log('[DB] FTS triggers skipped (FTS table may not exist):', triggerError.message);
      }

      console.log('[DB] Migration 2 complete - folder type constraint added');
    } catch (error) {
      console.error('[DB] Migration 2 FAILED:', error.message);
      console.error('[DB] Stack:', error.stack);
      // Don't update version if migration failed
      throw error;
    }
  }

  // Update schema version to 2 only if migration succeeded or wasn't needed
  if (version < 2) {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '2', ?)
      ON CONFLICT(key) DO UPDATE SET value = '2', updated_at = excluded.updated_at
    `).run(Date.now());
  }

  // Migration 3: Add folder_id column for folder containment
  // Check if folder_id column exists (it may have been added by migration 2)
  const tableInfoM3 = db.prepare('PRAGMA table_info(resources)').all();
  const existingColumnsM3 = new Set(tableInfoM3.map((col) => col.name));

  if (!existingColumnsM3.has('folder_id')) {
    console.log('[DB] Running migration 3: Add folder_id column for folder containment');

    try {
      db.exec('ALTER TABLE resources ADD COLUMN folder_id TEXT REFERENCES resources(id) ON DELETE SET NULL');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_folder ON resources(folder_id)');
      console.log('[DB] Migration 3 complete - folder_id column added');
    } catch (error) {
      console.error('[DB] Migration 3 error:', error.message);
    }
  } else {
    console.log('[DB] folder_id column already exists, skipping migration 3');
  }

  // Update schema version to 3
  if (version < 3) {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '3', ?)
      ON CONFLICT(key) DO UPDATE SET value = '3', updated_at = excluded.updated_at
    `).run(Date.now());
  }

  // Migration 4: Add tables for auth profiles and WhatsApp
  if (version < 4) {
    console.log('[DB] Running migration 4: Add auth and WhatsApp tables');

    try {
      // Auth profiles table - stores encrypted credentials for AI providers
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_profiles (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('api_key', 'oauth', 'token')),
          credentials TEXT NOT NULL,
          is_default INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_auth_profiles_provider ON auth_profiles(provider)');

      // WhatsApp sessions table
      db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
          id TEXT PRIMARY KEY,
          phone_number TEXT,
          status TEXT NOT NULL CHECK(status IN ('active', 'disconnected', 'pending')),
          auth_data TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      // WhatsApp messages table - tracks processed messages
      db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT,
          from_number TEXT NOT NULL,
          message_type TEXT NOT NULL,
          content TEXT,
          media_path TEXT,
          processed INTEGER DEFAULT 0,
          resource_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_session ON whatsapp_messages(session_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from ON whatsapp_messages(from_number)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_processed ON whatsapp_messages(processed)');

      // Gmail tables removed - functionality deprecated
      // Tables are kept for backward compatibility with existing databases

      // Many memory table - stores conversation context and learnings
      db.exec(`
        CREATE TABLE IF NOT EXISTS martin_memory (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('conversation', 'learning', 'preference', 'context')),
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_martin_memory_type ON martin_memory(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_martin_memory_key ON martin_memory(key)');

      console.log('[DB] Migration 4 complete - auth and WhatsApp tables added');
    } catch (error) {
      console.error('[DB] Migration 4 error:', error.message);
    }

    // Update schema version to 4
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '4', ?)
      ON CONFLICT(key) DO UPDATE SET value = '4', updated_at = excluded.updated_at
    `).run(Date.now());
  }

  // Migration 5: Add knowledge graph tables (nodes and edges)
  if (version < 5) {
    console.log('[DB] Running migration 5: Add knowledge graph tables');

    try {
      // Graph nodes table - represents entities in the knowledge graph
      db.exec(`
        CREATE TABLE IF NOT EXISTS graph_nodes (
          id TEXT PRIMARY KEY,
          resource_id TEXT,
          label TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('resource', 'concept', 'person', 'location', 'event', 'topic')),
          properties TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_graph_nodes_resource ON graph_nodes(resource_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_graph_nodes_label ON graph_nodes(label)');

      // Graph edges table - represents relationships between nodes
      db.exec(`
        CREATE TABLE IF NOT EXISTS graph_edges (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relation TEXT NOT NULL,
          weight REAL DEFAULT 1.0,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (source_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_graph_edges_relation ON graph_edges(relation)');

      // Create trigger to auto-create graph nodes for existing resources
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS auto_create_graph_node
        AFTER INSERT ON resources
        BEGIN
          INSERT INTO graph_nodes (id, resource_id, label, type, properties, created_at, updated_at)
          VALUES (
            'node-' || NEW.id,
            NEW.id,
            NEW.title,
            'resource',
            json_object('resource_type', NEW.type),
            NEW.created_at,
            NEW.updated_at
          );
        END
      `);

      // Sync existing resources to graph_nodes
      console.log('[DB] Syncing existing resources to graph_nodes...');
      db.exec(`
        INSERT OR IGNORE INTO graph_nodes (id, resource_id, label, type, properties, created_at, updated_at)
        SELECT
          'node-' || id,
          id,
          title,
          'resource',
          json_object('resource_type', type),
          created_at,
          updated_at
        FROM resources
      `);

      console.log('[DB] Migration 5 complete - knowledge graph tables added');
    } catch (error) {
      console.error('[DB] Migration 5 error:', error.message);
    }

    // Update schema version to 5
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '5', ?)
      ON CONFLICT(key) DO UPDATE SET value = '5', updated_at = excluded.updated_at
    `).run(Date.now());
  }

  // Migration 6: Add flashcard tables for spaced repetition study
  if (version < 6) {
    console.log('[DB] Running migration 6: Add flashcard tables');

    try {
      // Flashcard decks table
      db.exec(`
        CREATE TABLE IF NOT EXISTS flashcard_decks (
          id TEXT PRIMARY KEY,
          resource_id TEXT,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          card_count INTEGER DEFAULT 0,
          tags TEXT,
          settings TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_flashcard_decks_project ON flashcard_decks(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_flashcard_decks_resource ON flashcard_decks(resource_id)');

      // Individual flashcards with SM-2 spaced repetition fields
      db.exec(`
        CREATE TABLE IF NOT EXISTS flashcards (
          id TEXT PRIMARY KEY,
          deck_id TEXT NOT NULL,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          difficulty TEXT DEFAULT 'medium',
          tags TEXT,
          metadata TEXT,
          ease_factor REAL DEFAULT 2.5,
          interval INTEGER DEFAULT 0,
          repetitions INTEGER DEFAULT 0,
          next_review_at INTEGER,
          last_reviewed_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_flashcards_next_review ON flashcards(next_review_at)');

      // Study sessions tracking
      db.exec(`
        CREATE TABLE IF NOT EXISTS flashcard_sessions (
          id TEXT PRIMARY KEY,
          deck_id TEXT NOT NULL,
          cards_studied INTEGER DEFAULT 0,
          cards_correct INTEGER DEFAULT 0,
          cards_incorrect INTEGER DEFAULT 0,
          duration_ms INTEGER DEFAULT 0,
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_flashcard_sessions_deck ON flashcard_sessions(deck_id)');

      console.log('[DB] Migration 6 complete - flashcard tables added');
    } catch (error) {
      console.error('[DB] Migration 6 error:', error.message);
    }

    // Update schema version to 6
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '6', ?)
      ON CONFLICT(key) DO UPDATE SET value = '6', updated_at = excluded.updated_at
    `).run(Date.now());
  }

  // Migration 7: Add studio_outputs table
  if (version < 7) {
    console.log('[DB] Running migration 7: Add studio_outputs table');

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS studio_outputs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          source_ids TEXT,
          file_path TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);

      db.exec('CREATE INDEX IF NOT EXISTS idx_studio_outputs_project ON studio_outputs(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_studio_outputs_type ON studio_outputs(type)');

      console.log('[DB] Migration 7 complete - studio_outputs table added');
    } catch (error) {
      console.error('[DB] Migration 7 error:', error.message);
    }

    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '7', ?)
      ON CONFLICT(key) DO UPDATE SET value = '7', updated_at = excluded.updated_at
    `).run(Date.now());
  }

  // Migration 8: Studio-Flashcards unification (deck_id, resource_id, studio_output_id)
  if (version < 8) {
    console.log('[DB] Running migration 8: Studio-Flashcards unification');

    try {
      const studioInfo = db.prepare('PRAGMA table_info(studio_outputs)').all();
      const studioColumns = new Set(studioInfo.map((col) => col.name));

      if (!studioColumns.has('deck_id')) {
        db.exec('ALTER TABLE studio_outputs ADD COLUMN deck_id TEXT');
      }
      if (!studioColumns.has('resource_id')) {
        db.exec('ALTER TABLE studio_outputs ADD COLUMN resource_id TEXT');
      }

      const deckInfo = db.prepare('PRAGMA table_info(flashcard_decks)').all();
      const deckColumns = new Set(deckInfo.map((col) => col.name));

      if (!deckColumns.has('studio_output_id')) {
        db.exec('ALTER TABLE flashcard_decks ADD COLUMN studio_output_id TEXT');
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_studio_outputs_deck ON studio_outputs(deck_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_studio_outputs_resource ON studio_outputs(resource_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_flashcard_decks_studio ON flashcard_decks(studio_output_id)');

      console.log('[DB] Migration 8 complete - studio-flashcards unification');
    } catch (error) {
      console.error('[DB] Migration 8 error:', error.message);
    }

    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '8', ?)
      ON CONFLICT(key) DO UPDATE SET value = '8', updated_at = excluded.updated_at
    `).run(Date.now());
  }

  // Migration 9: Add 'notebook' to resources type constraint
  let needsNotebookConstraint = false;
  try {
    const testStmt = db.prepare(`
      INSERT INTO resources (id, project_id, type, title, created_at, updated_at)
      VALUES ('__test_notebook__', 'default', 'notebook', 'Test', 0, 0)
    `);
    testStmt.run();
    db.exec("DELETE FROM resources WHERE id = '__test_notebook__'");
    console.log('[DB] Notebook type constraint already exists');
  } catch {
    needsNotebookConstraint = true;
    console.log('[DB] Notebook type constraint missing, migration needed');
  }

  if (needsNotebookConstraint && version < 9) {
    console.log('[DB] Running migration 9: Add notebook type to resources');

    try {
      const tableInfo = db.prepare('PRAGMA table_info(resources)').all();
      const existingColumns = new Set(tableInfo.map((col) => col.name));

      db.exec('DROP TABLE IF EXISTS resources_new');
      db.exec(`
        CREATE TABLE resources_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('note', 'pdf', 'video', 'audio', 'image', 'url', 'document', 'folder', 'notebook')),
          title TEXT NOT NULL,
          content TEXT,
          file_path TEXT,
          internal_path TEXT,
          file_mime_type TEXT,
          file_size INTEGER,
          file_hash TEXT,
          thumbnail_data TEXT,
          original_filename TEXT,
          folder_id TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (folder_id) REFERENCES resources_new(id) ON DELETE SET NULL
        )
      `);

      const baseColumns = ['id', 'project_id', 'type', 'title', 'content', 'file_path', 'metadata', 'created_at', 'updated_at'];
      const optionalColumns = ['internal_path', 'file_mime_type', 'file_size', 'file_hash', 'thumbnail_data', 'original_filename', 'folder_id'];
      const columnsToCopy = [...baseColumns];
      for (const col of optionalColumns) {
        if (existingColumns.has(col)) columnsToCopy.push(col);
      }
      const columnsStr = columnsToCopy.join(', ');
      db.exec(`INSERT INTO resources_new (${columnsStr}) SELECT ${columnsStr} FROM resources`);
      db.exec('DROP TABLE resources');
      db.exec('ALTER TABLE resources_new RENAME TO resources');

      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_file_hash ON resources(file_hash)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_internal_path ON resources(internal_path)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_folder ON resources(folder_id)');

      try {
        db.exec(`CREATE TRIGGER IF NOT EXISTS resources_ai AFTER INSERT ON resources BEGIN
          INSERT INTO resources_fts(resource_id, title, content)
          VALUES (new.id, new.title, COALESCE(new.content, ''));
        END`);
        db.exec(`CREATE TRIGGER IF NOT EXISTS resources_ad AFTER DELETE ON resources BEGIN
          DELETE FROM resources_fts WHERE resource_id = old.id;
        END`);
        db.exec(`CREATE TRIGGER IF NOT EXISTS resources_au AFTER UPDATE ON resources BEGIN
          DELETE FROM resources_fts WHERE resource_id = old.id;
          INSERT INTO resources_fts(resource_id, title, content)
          VALUES (new.id, new.title, COALESCE(new.content, ''));
        END`);
      } catch (triggerError) {
        console.log('[DB] FTS triggers skipped:', triggerError.message);
      }

      console.log('[DB] Migration 9 complete - notebook type added');
    } catch (error) {
      console.error('[DB] Migration 9 FAILED:', error.message);
      throw error;
    }

    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('schema_version', '9', ?)
      ON CONFLICT(key) DO UPDATE SET value = '9', updated_at = excluded.updated_at
    `).run(Date.now());
  }

  // Migration 10: Add 'excel' to resources type constraint
  let needsExcelConstraint = false;
  try {
    const testStmt = db.prepare(`
      INSERT INTO resources (id, project_id, type, title, created_at, updated_at)
      VALUES ('__test_excel__', 'default', 'excel', 'Test', 0, 0)
    `);
    testStmt.run();
    db.exec("DELETE FROM resources WHERE id = '__test_excel__'");
    console.log('[DB] Excel type constraint already exists');
  } catch {
    needsExcelConstraint = true;
    console.log('[DB] Excel type constraint missing, migration needed');
  }

  if (needsExcelConstraint) {
    const v = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?').get('schema_version')?.value ?? '0', 10);
    if (v < 10) {
      console.log('[DB] Running migration 10: Add excel type to resources');

      try {
        const tableInfo = db.prepare('PRAGMA table_info(resources)').all();
        const existingColumns = new Set(tableInfo.map((col) => col.name));

        db.exec('DROP TABLE IF EXISTS resources_new');
        db.exec(`
          CREATE TABLE resources_new (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('note', 'pdf', 'video', 'audio', 'image', 'url', 'document', 'folder', 'notebook', 'excel')),
            title TEXT NOT NULL,
            content TEXT,
            file_path TEXT,
            internal_path TEXT,
            file_mime_type TEXT,
            file_size INTEGER,
            file_hash TEXT,
            thumbnail_data TEXT,
            original_filename TEXT,
            folder_id TEXT,
            metadata TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (folder_id) REFERENCES resources_new(id) ON DELETE SET NULL
          )
        `);

        const baseColumns = ['id', 'project_id', 'type', 'title', 'content', 'file_path', 'metadata', 'created_at', 'updated_at'];
        const optionalColumns = ['internal_path', 'file_mime_type', 'file_size', 'file_hash', 'thumbnail_data', 'original_filename', 'folder_id'];
        const columnsToCopy = [...baseColumns];
        for (const col of optionalColumns) {
          if (existingColumns.has(col)) columnsToCopy.push(col);
        }
        const columnsStr = columnsToCopy.join(', ');
        db.exec(`INSERT INTO resources_new (${columnsStr}) SELECT ${columnsStr} FROM resources`);
        db.exec('DROP TABLE resources');
        db.exec('ALTER TABLE resources_new RENAME TO resources');

        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_file_hash ON resources(file_hash)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_internal_path ON resources(internal_path)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_folder ON resources(folder_id)');

        try {
          db.exec(`CREATE TRIGGER IF NOT EXISTS resources_ai AFTER INSERT ON resources BEGIN
            INSERT INTO resources_fts(resource_id, title, content)
            VALUES (new.id, new.title, COALESCE(new.content, ''));
          END`);
          db.exec(`CREATE TRIGGER IF NOT EXISTS resources_ad AFTER DELETE ON resources BEGIN
            DELETE FROM resources_fts WHERE resource_id = old.id;
          END`);
          db.exec(`CREATE TRIGGER IF NOT EXISTS resources_au AFTER UPDATE ON resources BEGIN
            DELETE FROM resources_fts WHERE resource_id = old.id;
            INSERT INTO resources_fts(resource_id, title, content)
            VALUES (new.id, new.title, COALESCE(new.content, ''));
          END`);
        } catch (triggerError) {
          console.log('[DB] FTS triggers skipped:', triggerError.message);
        }

        console.log('[DB] Migration 10 complete - excel type added');
      } catch (error) {
        console.error('[DB] Migration 10 FAILED:', error.message);
        throw error;
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '10', ?)
        ON CONFLICT(key) DO UPDATE SET value = '10', updated_at = excluded.updated_at
      `).run(Date.now());
    }
  }

  // Migration 11: Add 'ppt' to resources type constraint
  let needsPptConstraint = false;
  try {
    const testStmt = db.prepare(`
      INSERT INTO resources (id, project_id, type, title, created_at, updated_at)
      VALUES ('__test_ppt__', 'default', 'ppt', 'Test', 0, 0)
    `);
    testStmt.run();
    db.exec("DELETE FROM resources WHERE id = '__test_ppt__'");
    console.log('[DB] PPT type constraint already exists');
  } catch {
    needsPptConstraint = true;
    console.log('[DB] PPT type constraint missing, migration needed');
  }

  if (needsPptConstraint) {
    const v = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?').get('schema_version')?.value ?? '0', 10);
    if (v < 11) {
      console.log('[DB] Running migration 11: Add ppt type to resources');

      try {
        const tableInfo = db.prepare('PRAGMA table_info(resources)').all();
        const existingColumns = new Set(tableInfo.map((col) => col.name));

        db.exec('DROP TABLE IF EXISTS resources_new');
        db.exec(`
          CREATE TABLE resources_new (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('note', 'pdf', 'video', 'audio', 'image', 'url', 'document', 'folder', 'notebook', 'excel', 'ppt')),
            title TEXT NOT NULL,
            content TEXT,
            file_path TEXT,
            internal_path TEXT,
            file_mime_type TEXT,
            file_size INTEGER,
            file_hash TEXT,
            thumbnail_data TEXT,
            original_filename TEXT,
            folder_id TEXT,
            metadata TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (folder_id) REFERENCES resources_new(id) ON DELETE SET NULL
          )
        `);

        const baseColumns = ['id', 'project_id', 'type', 'title', 'content', 'file_path', 'metadata', 'created_at', 'updated_at'];
        const optionalColumns = ['internal_path', 'file_mime_type', 'file_size', 'file_hash', 'thumbnail_data', 'original_filename', 'folder_id'];
        const columnsToCopy = [...baseColumns];
        for (const col of optionalColumns) {
          if (existingColumns.has(col)) columnsToCopy.push(col);
        }
        const columnsStr = columnsToCopy.join(', ');
        db.exec(`INSERT INTO resources_new (${columnsStr}) SELECT ${columnsStr} FROM resources`);
        db.exec('DROP TABLE resources');
        db.exec('ALTER TABLE resources_new RENAME TO resources');

        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_file_hash ON resources(file_hash)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_internal_path ON resources(internal_path)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_resources_folder ON resources(folder_id)');

        try {
          db.exec(`CREATE TRIGGER IF NOT EXISTS resources_ai AFTER INSERT ON resources BEGIN
            INSERT INTO resources_fts(resource_id, title, content)
            VALUES (new.id, new.title, COALESCE(new.content, ''));
          END`);
          db.exec(`CREATE TRIGGER IF NOT EXISTS resources_ad AFTER DELETE ON resources BEGIN
            DELETE FROM resources_fts WHERE resource_id = old.id;
          END`);
          db.exec(`CREATE TRIGGER IF NOT EXISTS resources_au AFTER UPDATE ON resources BEGIN
            DELETE FROM resources_fts WHERE resource_id = old.id;
            INSERT INTO resources_fts(resource_id, title, content)
            VALUES (new.id, new.title, COALESCE(new.content, ''));
          END`);
        } catch (triggerError) {
          console.log('[DB] FTS triggers skipped:', triggerError.message);
        }

        console.log('[DB] Migration 11 complete - ppt type added');
      } catch (error) {
        console.error('[DB] Migration 11 FAILED:', error.message);
        throw error;
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '11', ?)
        ON CONFLICT(key) DO UPDATE SET value = '11', updated_at = excluded.updated_at
      `).run(Date.now());
    }
  }

  // Migration 12: Add calendar tables
  // Also run if schema_version was incorrectly set or tables have wrong schema (e.g. from failed partial migration)
  const calendarSchemaValid = (() => {
    try {
      db.prepare('SELECT 1 FROM calendar_accounts LIMIT 1').get();
      const cols = db.prepare('PRAGMA table_info(calendar_calendars)').all();
      const hasAccountId = cols.some((c) => c.name === 'account_id');
      return hasAccountId;
    } catch {
      return false;
    }
  })();

  if (version < 12 || !calendarSchemaValid) {
    console.log('[DB] Running migration 12: Add calendar tables');

    try {
      // Drop existing tables if schema may be inconsistent (e.g. from failed partial migration)
      db.exec('DROP TABLE IF EXISTS calendar_notifications');
      db.exec('DROP TABLE IF EXISTS calendar_event_links');
      db.exec('DROP TABLE IF EXISTS calendar_events');
      db.exec('DROP TABLE IF EXISTS calendar_calendars');
      db.exec('DROP TABLE IF EXISTS calendar_accounts');

      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_accounts (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL CHECK(provider IN ('google', 'local')),
          account_email TEXT NOT NULL,
          credentials TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disconnected', 'error')),
          last_sync_at INTEGER,
          sync_token TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_accounts_provider ON calendar_accounts(provider)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_calendars (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          remote_id TEXT NOT NULL,
          title TEXT NOT NULL,
          color TEXT,
          is_selected INTEGER DEFAULT 1,
          is_default INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES calendar_accounts(id) ON DELETE CASCADE,
          UNIQUE(account_id, remote_id)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_calendars_account ON calendar_calendars(account_id)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id TEXT PRIMARY KEY,
          calendar_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          location TEXT,
          start_at INTEGER NOT NULL,
          end_at INTEGER NOT NULL,
          timezone TEXT,
          all_day INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'tentative', 'cancelled')),
          reminders TEXT,
          metadata TEXT,
          source TEXT DEFAULT 'local' CHECK(source IN ('local', 'google', 'manual')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (calendar_id) REFERENCES calendar_calendars(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar ON calendar_events(calendar_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_events_range ON calendar_events(start_at, end_at)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_event_links (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          remote_event_id TEXT NOT NULL,
          remote_calendar_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
          UNIQUE(provider, remote_event_id)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_event_links_event ON calendar_event_links(event_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_event_links_remote ON calendar_event_links(provider, remote_event_id)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_notifications (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          notify_at INTEGER NOT NULL,
          notified_at INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
          UNIQUE(event_id, notify_at)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_notifications_event ON calendar_notifications(event_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_notifications_pending ON calendar_notifications(notify_at, notified_at)');

      const now = Date.now();
      db.prepare(`
        INSERT OR IGNORE INTO calendar_accounts (id, provider, account_email, credentials, status, created_at, updated_at)
        VALUES ('local', 'local', '', '{}', 'active', ?, ?)
      `).run(now, now);
      db.prepare(`
        INSERT OR IGNORE INTO calendar_calendars (id, account_id, remote_id, title, is_selected, is_default, created_at, updated_at)
        VALUES ('local-default', 'local', 'local', 'Local', 1, 1, ?, ?)
      `).run(now, now);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '12', ?)
        ON CONFLICT(key) DO UPDATE SET value = '12', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 12 complete - calendar tables added');
    } catch (error) {
      console.error('[DB] Migration 12 error:', error.message);
      throw error;
    }
  }

  // Migration 14: Schema cleanup — drop dead tables, fix FKs, remove unused columns
  if (version < 14) {
    console.log('[DB] Running migration 14: Schema cleanup');

    try {
      db.exec('PRAGMA foreign_keys = OFF');

      // Drop tables that are defined but never used in code
      db.exec('DROP TABLE IF EXISTS citations');
      db.exec('DROP TABLE IF EXISTS martin_memory');
      db.exec('DROP TABLE IF EXISTS resources_new');

      // Remove unused columns (SQLite 3.35+ supports DROP COLUMN)
      try { db.exec('ALTER TABLE resource_links DROP COLUMN weight'); } catch { /* already gone */ }
      try { db.exec('ALTER TABLE flashcard_decks DROP COLUMN studio_output_id'); } catch { /* already gone */ }

      // Fix FK: sources.resource_id SET NULL → CASCADE
      // Orphaned sources (resource_id = NULL from prior deletions) are intentionally excluded
      db.exec(`
        CREATE TABLE sources_new (
          id TEXT PRIMARY KEY,
          resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
          type TEXT NOT NULL DEFAULT 'article',
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
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `);
      db.exec(`
        INSERT INTO sources_new
        SELECT id, resource_id, type, title, authors, year, doi, url, publisher, journal,
               volume, issue, pages, isbn, metadata, created_at, updated_at
        FROM sources WHERE resource_id IS NOT NULL
      `);
      db.exec('DROP TABLE sources');
      db.exec('ALTER TABLE sources_new RENAME TO sources');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sources_resource ON sources(resource_id)');

      // Fix FK: flashcard_decks.resource_id SET NULL → CASCADE
      // All decks are migrated (standalone decks with resource_id=NULL are preserved)
      db.exec(`
        CREATE TABLE flashcard_decks_new (
          id TEXT PRIMARY KEY,
          resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          card_count INTEGER NOT NULL DEFAULT 0,
          tags TEXT,
          settings TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec(`
        INSERT INTO flashcard_decks_new
        SELECT id, resource_id, project_id, title, description, card_count, tags, settings, created_at, updated_at
        FROM flashcard_decks
      `);
      db.exec('DROP TABLE flashcard_decks');
      db.exec('ALTER TABLE flashcard_decks_new RENAME TO flashcard_decks');
      db.exec('CREATE INDEX IF NOT EXISTS idx_flashcard_decks_project ON flashcard_decks(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_flashcard_decks_resource ON flashcard_decks(resource_id)');

      // Fix FK: whatsapp_messages SET NULL → CASCADE
      db.exec(`
        CREATE TABLE whatsapp_messages_new (
          id TEXT PRIMARY KEY,
          session_id TEXT REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
          resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
          from_number TEXT,
          to_number TEXT,
          content TEXT,
          processed INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )
      `);
      db.exec(`
        INSERT INTO whatsapp_messages_new (id, session_id, resource_id, from_number, content, processed, created_at)
        SELECT id, session_id, resource_id, from_number, content, processed, created_at
        FROM whatsapp_messages
      `);
      db.exec('DROP TABLE whatsapp_messages');
      db.exec('ALTER TABLE whatsapp_messages_new RENAME TO whatsapp_messages');
      db.exec('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_session ON whatsapp_messages(session_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from ON whatsapp_messages(from_number)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_processed ON whatsapp_messages(processed)');

      // Orphan cleanup: tags with no associated resources
      db.exec(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM resource_tags)`);

      db.exec('PRAGMA foreign_keys = ON');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '14', ?)
        ON CONFLICT(key) DO UPDATE SET value = '14', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 14 complete - schema cleanup done');
    } catch (error) {
      db.exec('PRAGMA foreign_keys = ON');
      console.error('[DB] Migration 14 error:', error.message);
      // Non-fatal: log but don't throw so app still starts
    }
  }

  // Migration 15: Chat sessions, messages, and traces for AI chat traceability
  if (version < 15) {
    console.log('[DB] Running migration 15 - chat sessions and traces');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          agent_id TEXT,
          resource_id TEXT,
          mode TEXT,
          context_id TEXT,
          thread_id TEXT,
          title TEXT,
          tool_ids TEXT,
          mcp_server_ids TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent ON chat_sessions(agent_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_resource ON chat_sessions(resource_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode ON chat_sessions(mode)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_context ON chat_sessions(context_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          tool_calls TEXT,
          thinking TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_traces (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          message_id TEXT,
          type TEXT NOT NULL CHECK(type IN ('tool_call', 'tool_result', 'decision', 'interrupt')),
          tool_name TEXT,
          tool_args TEXT,
          result TEXT,
          mcp_server_id TEXT,
          decision TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_traces_session ON chat_traces(session_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_traces_message ON chat_traces(message_id)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '15', ?)
        ON CONFLICT(key) DO UPDATE SET value = '15', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 15 complete - chat sessions and traces');
    } catch (error) {
      console.error('[DB] Migration 15 error:', error.message);
    }
  }

  if (version < 16) {
    console.log('[DB] Running migration 16 - enrich chat sessions metadata');
    try {
      const columns = db.prepare('PRAGMA table_info(chat_sessions)').all();
      const columnNames = new Set(columns.map((column) => column.name));

      if (!columnNames.has('mode')) {
        db.exec("ALTER TABLE chat_sessions ADD COLUMN mode TEXT");
      }
      if (!columnNames.has('context_id')) {
        db.exec("ALTER TABLE chat_sessions ADD COLUMN context_id TEXT");
      }
      if (!columnNames.has('title')) {
        db.exec("ALTER TABLE chat_sessions ADD COLUMN title TEXT");
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode ON chat_sessions(mode)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_context ON chat_sessions(context_id)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '16', ?)
        ON CONFLICT(key) DO UPDATE SET value = '16', updated_at = excluded.updated_at
      `).run(Date.now());
    } catch (error) {
      console.error('[DB] Migration 16 failed:', error);
    }
  }

  if (version < 17) {
    console.log('[DB] Running migration 17 - automation definitions and persistent runs');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS automation_definitions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          target_type TEXT NOT NULL CHECK(target_type IN ('many', 'agent', 'workflow')),
          target_id TEXT NOT NULL,
          trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual', 'schedule', 'contextual')),
          schedule_json TEXT,
          input_template_json TEXT,
          output_mode TEXT NOT NULL DEFAULT 'chat_only',
          enabled INTEGER NOT NULL DEFAULT 0,
          legacy_source TEXT,
          last_run_at INTEGER,
          last_run_status TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_definitions_target ON automation_definitions(target_type, target_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_definitions_trigger ON automation_definitions(trigger_type, enabled)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS automation_runs (
          id TEXT PRIMARY KEY,
          automation_id TEXT,
          owner_type TEXT NOT NULL CHECK(owner_type IN ('many', 'agent', 'workflow', 'automation')),
          owner_id TEXT NOT NULL,
          title TEXT,
          status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
          session_id TEXT,
          workflow_id TEXT,
          workflow_execution_id TEXT,
          thread_id TEXT,
          output_text TEXT,
          summary TEXT,
          error TEXT,
          metadata TEXT,
          started_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          finished_at INTEGER,
          last_heartbeat_at INTEGER,
          FOREIGN KEY (automation_id) REFERENCES automation_definitions(id) ON DELETE SET NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_runs_owner ON automation_runs(owner_type, owner_id, updated_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status, updated_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, updated_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_runs_session ON automation_runs(session_id, updated_at)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS automation_run_steps (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          parent_step_id TEXT,
          step_type TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'done',
          content TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_step_id) REFERENCES automation_run_steps(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_run_steps_run ON automation_run_steps(run_id, created_at)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS automation_run_links (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          link_type TEXT NOT NULL,
          link_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_run_links_run ON automation_run_links(run_id)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '17', ?)
        ON CONFLICT(key) DO UPDATE SET value = '17', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 17 complete - automation definitions and persistent runs');
    } catch (error) {
      console.error('[DB] Migration 17 failed:', error);
    }
  }

  // Migration 18: Resource images from Docling cloud conversion
  if (version < 18) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_images (
          id TEXT PRIMARY KEY,
          resource_id TEXT NOT NULL,
          internal_path TEXT NOT NULL,
          file_mime_type TEXT NOT NULL,
          image_index INTEGER NOT NULL,
          page_no INTEGER,
          caption TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_resource_images_resource ON resource_images(resource_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resource_images_page ON resource_images(resource_id, page_no)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '18', ?)
        ON CONFLICT(key) DO UPDATE SET value = '18', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 18 complete - resource images for Docling');
    } catch (error) {
      console.error('[DB] Migration 18 failed:', error);
    }
  }

  if (version < 19) {
    try {
      const now = Date.now();

      const manyAgentsCount = db.prepare('SELECT COUNT(*) as count FROM many_agents').get()?.count ?? 0;
      if (manyAgentsCount === 0) {
        const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('many_agents')?.value;
        const agents = parseJsonValue(raw, []);
        if (Array.isArray(agents) && agents.length > 0) {
          const stmt = db.prepare(`
            INSERT INTO many_agents (
              id, name, description, system_instructions, tool_ids, mcp_server_ids,
              skill_ids, icon_index, marketplace_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              system_instructions = excluded.system_instructions,
              tool_ids = excluded.tool_ids,
              mcp_server_ids = excluded.mcp_server_ids,
              skill_ids = excluded.skill_ids,
              icon_index = excluded.icon_index,
              marketplace_id = excluded.marketplace_id,
              updated_at = excluded.updated_at
          `);
          for (const agent of agents) {
            if (!agent || typeof agent.id !== 'string' || typeof agent.name !== 'string') continue;
            const createdAt = typeof agent.createdAt === 'number' ? agent.createdAt : now;
            const updatedAt = typeof agent.updatedAt === 'number' ? agent.updatedAt : createdAt;
            stmt.run(
              agent.id,
              agent.name,
              typeof agent.description === 'string' ? agent.description : '',
              typeof agent.systemInstructions === 'string' ? agent.systemInstructions : '',
              JSON.stringify(Array.isArray(agent.toolIds) ? agent.toolIds : []),
              JSON.stringify(Array.isArray(agent.mcpServerIds) ? agent.mcpServerIds : []),
              JSON.stringify(Array.isArray(agent.skillIds) ? agent.skillIds : []),
              typeof agent.iconIndex === 'number' ? agent.iconIndex : 1,
              typeof agent.marketplaceId === 'string' ? agent.marketplaceId : null,
              createdAt,
              updatedAt,
            );
          }
        }
      }

      const workflowsCount = db.prepare('SELECT COUNT(*) as count FROM canvas_workflows').get()?.count ?? 0;
      if (workflowsCount === 0) {
        const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('canvas_workflows')?.value;
        const workflows = parseJsonValue(raw, []);
        if (Array.isArray(workflows) && workflows.length > 0) {
          const stmt = db.prepare(`
            INSERT INTO canvas_workflows (
              id, name, description, nodes_json, edges_json, marketplace_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              nodes_json = excluded.nodes_json,
              edges_json = excluded.edges_json,
              marketplace_json = excluded.marketplace_json,
              updated_at = excluded.updated_at
          `);
          for (const workflow of workflows) {
            if (!workflow || typeof workflow.id !== 'string' || typeof workflow.name !== 'string') continue;
            const createdAt = typeof workflow.createdAt === 'number' ? workflow.createdAt : now;
            const updatedAt = typeof workflow.updatedAt === 'number' ? workflow.updatedAt : createdAt;
            stmt.run(
              workflow.id,
              workflow.name,
              typeof workflow.description === 'string' ? workflow.description : '',
              JSON.stringify(Array.isArray(workflow.nodes) ? workflow.nodes : []),
              JSON.stringify(Array.isArray(workflow.edges) ? workflow.edges : []),
              workflow.marketplace ? JSON.stringify(workflow.marketplace) : null,
              createdAt,
              updatedAt,
            );
          }
        }
      }

      const executionsCount = db.prepare('SELECT COUNT(*) as count FROM workflow_executions').get()?.count ?? 0;
      if (executionsCount === 0) {
        const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('canvas_executions')?.value;
        const executions = parseJsonValue(raw, []);
        if (Array.isArray(executions) && executions.length > 0) {
          const stmt = db.prepare(`
            INSERT INTO workflow_executions (
              id, workflow_id, workflow_name, started_at, finished_at, status, entries_json, node_outputs_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              workflow_id = excluded.workflow_id,
              workflow_name = excluded.workflow_name,
              started_at = excluded.started_at,
              finished_at = excluded.finished_at,
              status = excluded.status,
              entries_json = excluded.entries_json,
              node_outputs_json = excluded.node_outputs_json,
              updated_at = excluded.updated_at
          `);
          for (const execution of executions) {
            if (!execution || typeof execution.id !== 'string' || typeof execution.workflowId !== 'string') continue;
            const startedAt = typeof execution.startedAt === 'number' ? execution.startedAt : now;
            stmt.run(
              execution.id,
              execution.workflowId,
              typeof execution.workflowName === 'string' ? execution.workflowName : 'Workflow',
              startedAt,
              typeof execution.finishedAt === 'number' ? execution.finishedAt : null,
              typeof execution.status === 'string' ? execution.status : 'done',
              JSON.stringify(Array.isArray(execution.entries) ? execution.entries : []),
              execution.nodeOutputs ? JSON.stringify(execution.nodeOutputs) : null,
              typeof execution.finishedAt === 'number' ? execution.finishedAt : startedAt,
            );
          }
        }
      }

      const mcpServerCount = db.prepare('SELECT COUNT(*) as count FROM mcp_servers').get()?.count ?? 0;
      if (mcpServerCount === 0) {
        const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('mcp_servers')?.value;
        const servers = extractLegacyMcpServers(raw);
        if (servers.length > 0) {
          const stmt = db.prepare(`
            INSERT INTO mcp_servers (
              id, name, type, command, args_json, url, headers_json, env_json,
              enabled, tools_json, enabled_tool_ids_json, last_discovery_at,
              last_discovery_error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              type = excluded.type,
              command = excluded.command,
              args_json = excluded.args_json,
              url = excluded.url,
              headers_json = excluded.headers_json,
              env_json = excluded.env_json,
              enabled = excluded.enabled,
              tools_json = excluded.tools_json,
              enabled_tool_ids_json = excluded.enabled_tool_ids_json,
              last_discovery_at = excluded.last_discovery_at,
              last_discovery_error = excluded.last_discovery_error,
              updated_at = excluded.updated_at
          `);
          for (const server of servers) {
            const serverId = normalizeServerId(server.name) || `mcp_${Date.now()}`;
            stmt.run(
              serverId,
              server.name,
              server.type === 'http' || server.type === 'sse' ? server.type : 'stdio',
              typeof server.command === 'string' ? server.command : null,
              JSON.stringify(Array.isArray(server.args) ? server.args : []),
              typeof server.url === 'string' ? server.url : null,
              server.headers ? JSON.stringify(server.headers) : null,
              server.env ? JSON.stringify(server.env) : null,
              server.enabled === false ? 0 : 1,
              Array.isArray(server.tools) ? JSON.stringify(server.tools) : null,
              Array.isArray(server.enabledToolIds) ? JSON.stringify(server.enabledToolIds) : null,
              typeof server.lastDiscoveryAt === 'number' ? server.lastDiscoveryAt : null,
              typeof server.lastDiscoveryError === 'string' ? server.lastDiscoveryError : null,
              now,
              now,
            );
          }
        }
      }

      const mcpEnabledRaw = db.prepare('SELECT value FROM settings WHERE key = ?').get('mcp_enabled')?.value;
      db.prepare(`
        INSERT INTO mcp_global_settings (id, enabled, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(mcpEnabledRaw === 'false' ? 0 : 1, now);

      const skillsCount = db.prepare('SELECT COUNT(*) as count FROM ai_skills').get()?.count ?? 0;
      if (skillsCount === 0) {
        const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_skills')?.value;
        const skills = parseJsonValue(raw, []);
        if (Array.isArray(skills) && skills.length > 0) {
          const stmt = db.prepare(`
            INSERT INTO ai_skills (id, name, description, prompt, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              prompt = excluded.prompt,
              enabled = excluded.enabled,
              updated_at = excluded.updated_at
          `);
          for (const skill of skills) {
            if (!skill || typeof skill.id !== 'string' || typeof skill.name !== 'string') continue;
            stmt.run(
              skill.id,
              skill.name,
              typeof skill.description === 'string' ? skill.description : '',
              typeof skill.prompt === 'string' ? skill.prompt : '',
              skill.enabled === false ? 0 : 1,
              now,
              now,
            );
          }
        }
      }

      const agentInstallsCount = db.prepare('SELECT COUNT(*) as count FROM marketplace_agent_installs').get()?.count ?? 0;
      if (agentInstallsCount === 0) {
        const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('marketplace_agent_records')?.value;
        const records = parseJsonValue(raw, {});
        if (records && typeof records === 'object') {
          const stmt = db.prepare(`
            INSERT INTO marketplace_agent_installs (
              marketplace_id, local_agent_id, version, author, source,
              installed_at, updated_at, capabilities_json, resource_affinity_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(marketplace_id) DO UPDATE SET
              local_agent_id = excluded.local_agent_id,
              version = excluded.version,
              author = excluded.author,
              source = excluded.source,
              installed_at = excluded.installed_at,
              updated_at = excluded.updated_at,
              capabilities_json = excluded.capabilities_json,
              resource_affinity_json = excluded.resource_affinity_json
          `);
          for (const [marketplaceId, record] of Object.entries(records)) {
            if (!record || typeof record !== 'object' || typeof record.localAgentId !== 'string') continue;
            stmt.run(
              marketplaceId,
              record.localAgentId,
              typeof record.version === 'string' ? record.version : null,
              typeof record.author === 'string' ? record.author : null,
              typeof record.source === 'string' ? record.source : null,
              typeof record.installedAt === 'number' ? record.installedAt : now,
              typeof record.updatedAt === 'number' ? record.updatedAt : now,
              JSON.stringify(Array.isArray(record.capabilities) ? record.capabilities : []),
              JSON.stringify(Array.isArray(record.resourceAffinity) ? record.resourceAffinity : []),
            );
          }
        }
      }

      const workflowInstallsCount = db.prepare('SELECT COUNT(*) as count FROM marketplace_workflow_installs').get()?.count ?? 0;
      if (workflowInstallsCount === 0) {
        const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('marketplace_workflow_records')?.value;
        const records = parseJsonValue(raw, {});
        if (records && typeof records === 'object') {
          const stmt = db.prepare(`
            INSERT INTO marketplace_workflow_installs (
              template_id, local_workflow_id, version, author, source,
              installed_at, updated_at, capabilities_json, resource_affinity_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(template_id) DO UPDATE SET
              local_workflow_id = excluded.local_workflow_id,
              version = excluded.version,
              author = excluded.author,
              source = excluded.source,
              installed_at = excluded.installed_at,
              updated_at = excluded.updated_at,
              capabilities_json = excluded.capabilities_json,
              resource_affinity_json = excluded.resource_affinity_json
          `);
          for (const [templateId, record] of Object.entries(records)) {
            if (!record || typeof record !== 'object' || typeof record.localWorkflowId !== 'string') continue;
            stmt.run(
              templateId,
              record.localWorkflowId,
              typeof record.version === 'string' ? record.version : null,
              typeof record.author === 'string' ? record.author : null,
              typeof record.source === 'string' ? record.source : null,
              typeof record.installedAt === 'number' ? record.installedAt : now,
              typeof record.updatedAt === 'number' ? record.updatedAt : now,
              JSON.stringify(Array.isArray(record.capabilities) ? record.capabilities : []),
              JSON.stringify(Array.isArray(record.resourceAffinity) ? record.resourceAffinity : []),
            );
          }
        }
      }

      const mappingsCount = db.prepare('SELECT COUNT(*) as count FROM marketplace_template_mappings').get()?.count ?? 0;
      if (mappingsCount === 0) {
        const raw = db.prepare('SELECT value FROM settings WHERE key = ?').get('marketplace_template_to_workflow')?.value;
        const mapping = parseJsonValue(raw, {});
        if (mapping && typeof mapping === 'object') {
          const stmt = db.prepare(`
            INSERT INTO marketplace_template_mappings (template_id, workflow_id, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(template_id) DO UPDATE SET
              workflow_id = excluded.workflow_id,
              updated_at = excluded.updated_at
          `);
          for (const [templateId, workflowId] of Object.entries(mapping)) {
            if (typeof workflowId !== 'string') continue;
            stmt.run(templateId, workflowId, now);
          }
        }
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '19', ?)
        ON CONFLICT(key) DO UPDATE SET value = '19', updated_at = excluded.updated_at
      `).run(now);

      console.log('[DB] Migration 19 complete - dedicated runtime entity tables');
    } catch (error) {
      console.error('[DB] Migration 19 failed:', error);
    }
  }

  if (version < 20) {
    try {
      const now = Date.now();
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_folders (
          id TEXT PRIMARY KEY,
          parent_id TEXT,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_folders (
          id TEXT PRIMARY KEY,
          parent_id TEXT,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_agent_folders_parent ON agent_folders(parent_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_folders_parent ON workflow_folders(parent_id)');

      const manyCols = new Set(db.prepare('PRAGMA table_info(many_agents)').all().map((c) => c.name));
      if (!manyCols.has('folder_id')) {
        db.exec('ALTER TABLE many_agents ADD COLUMN folder_id TEXT REFERENCES agent_folders(id) ON DELETE SET NULL');
      }
      if (!manyCols.has('favorite')) {
        db.exec('ALTER TABLE many_agents ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
      }

      const wfCols = new Set(db.prepare('PRAGMA table_info(canvas_workflows)').all().map((c) => c.name));
      if (!wfCols.has('folder_id')) {
        db.exec(
          'ALTER TABLE canvas_workflows ADD COLUMN folder_id TEXT REFERENCES workflow_folders(id) ON DELETE SET NULL',
        );
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_many_agents_folder_id ON many_agents(folder_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_canvas_workflows_folder_id ON canvas_workflows(folder_id)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '20', ?)
        ON CONFLICT(key) DO UPDATE SET value = '20', updated_at = excluded.updated_at
      `).run(now);

      invalidateQueries();
      console.log('[DB] Migration 20 complete - agent/workflow folders + favorites');
    } catch (error) {
      console.error('[DB] Migration 20 failed:', error);
    }
  }

  // Migration 21: repair many_agents.favorite if schema_version reached 20 without the column
  // (e.g. partial/failed migration 20 or older builds that bumped version early)
  if (version < 21) {
    try {
      const now = Date.now();
      const manyCols = new Set(db.prepare('PRAGMA table_info(many_agents)').all().map((c) => c.name));
      if (!manyCols.has('favorite')) {
        db.exec('ALTER TABLE many_agents ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] Migration 21: added missing many_agents.favorite');
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '21', ?)
        ON CONFLICT(key) DO UPDATE SET value = '21', updated_at = excluded.updated_at
      `).run(now);
      invalidateQueries();
      console.log('[DB] Migration 21 complete - many_agents.favorite repair');
    } catch (error) {
      console.error('[DB] Migration 21 failed:', error);
    }
  }

  // Migration 22: repair folder_id / workflow folder schema if version advanced without migration 20
  // (e.g. only migration 21 ran, or partial DB state)
  if (version < 22) {
    try {
      const now = Date.now();
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_folders (
          id TEXT PRIMARY KEY,
          parent_id TEXT,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_folders (
          id TEXT PRIMARY KEY,
          parent_id TEXT,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_agent_folders_parent ON agent_folders(parent_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_folders_parent ON workflow_folders(parent_id)');

      const manyCols22 = new Set(db.prepare('PRAGMA table_info(many_agents)').all().map((c) => c.name));
      if (!manyCols22.has('folder_id')) {
        db.exec('ALTER TABLE many_agents ADD COLUMN folder_id TEXT REFERENCES agent_folders(id) ON DELETE SET NULL');
        console.log('[DB] Migration 22: added missing many_agents.folder_id');
      }
      if (!manyCols22.has('favorite')) {
        db.exec('ALTER TABLE many_agents ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
        console.log('[DB] Migration 22: added missing many_agents.favorite');
      }

      const wfCols22 = new Set(db.prepare('PRAGMA table_info(canvas_workflows)').all().map((c) => c.name));
      if (!wfCols22.has('folder_id')) {
        db.exec(
          'ALTER TABLE canvas_workflows ADD COLUMN folder_id TEXT REFERENCES workflow_folders(id) ON DELETE SET NULL',
        );
        console.log('[DB] Migration 22: added missing canvas_workflows.folder_id');
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_many_agents_folder_id ON many_agents(folder_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_canvas_workflows_folder_id ON canvas_workflows(folder_id)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '22', ?)
        ON CONFLICT(key) DO UPDATE SET value = '22', updated_at = excluded.updated_at
      `).run(now);
      invalidateQueries();
      console.log('[DB] Migration 22 complete - agent/workflow folder columns repair');
    } catch (error) {
      console.error('[DB] Migration 22 failed:', error);
    }
  }

  // Migration 23: project scope for agents, workflows, chat, automations, runs, folders, executions
  if (version < 23) {
    try {
      const now = Date.now();
      const DEFAULT_PID = 'default';

      db.prepare(`UPDATE projects SET name = 'Dome', description = 'Default workspace' WHERE id = ?`).run(DEFAULT_PID);

      const ensureCol = (table, col) => {
        const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
        if (!cols.has(col)) {
          db.exec(
            `ALTER TABLE ${table} ADD COLUMN ${col} TEXT NOT NULL DEFAULT '${DEFAULT_PID}'`,
          );
        }
      };

      ensureCol('agent_folders', 'project_id');
      ensureCol('workflow_folders', 'project_id');
      ensureCol('many_agents', 'project_id');
      ensureCol('canvas_workflows', 'project_id');
      ensureCol('workflow_executions', 'project_id');
      ensureCol('chat_sessions', 'project_id');
      ensureCol('automation_definitions', 'project_id');
      ensureCol('automation_runs', 'project_id');

      // Subqueries can yield NULL (orphan FK, missing row, or NULL project_id on parent) — NOT NULL on project_id would fail without COALESCE.
      db.exec(`
        UPDATE chat_sessions
        SET project_id = COALESCE((
          SELECT r.project_id FROM resources r WHERE r.id = chat_sessions.resource_id
        ), '${DEFAULT_PID}')
        WHERE resource_id IS NOT NULL
      `);
      db.exec(`
        UPDATE chat_sessions
        SET project_id = COALESCE((
          SELECT a.project_id FROM many_agents a WHERE a.id = chat_sessions.agent_id
        ), '${DEFAULT_PID}')
        WHERE agent_id IS NOT NULL AND resource_id IS NULL
      `);

      db.exec(`
        UPDATE workflow_executions
        SET project_id = COALESCE((
          SELECT w.project_id FROM canvas_workflows w WHERE w.id = workflow_executions.workflow_id
        ), '${DEFAULT_PID}')
        WHERE workflow_id IS NOT NULL
      `);

      db.exec(`
        UPDATE automation_runs
        SET project_id = COALESCE((
          SELECT d.project_id FROM automation_definitions d WHERE d.id = automation_runs.automation_id
        ), '${DEFAULT_PID}')
        WHERE automation_id IS NOT NULL
      `);
      db.exec(`
        UPDATE automation_runs
        SET project_id = COALESCE((
          SELECT s.project_id FROM chat_sessions s WHERE s.id = automation_runs.session_id
        ), '${DEFAULT_PID}')
        WHERE (automation_id IS NULL OR project_id IS NULL OR project_id = '${DEFAULT_PID}')
          AND session_id IS NOT NULL
      `);
      db.exec(`
        UPDATE automation_runs
        SET project_id = COALESCE((
          SELECT w.project_id FROM canvas_workflows w WHERE w.id = automation_runs.workflow_id
        ), '${DEFAULT_PID}')
        WHERE workflow_id IS NOT NULL
          AND (project_id IS NULL OR project_id = '${DEFAULT_PID}')
      `);
      db.exec(`
        UPDATE automation_runs
        SET project_id = COALESCE((
          SELECT a.project_id FROM many_agents a WHERE a.id = automation_runs.owner_id
        ), '${DEFAULT_PID}')
        WHERE owner_type IN ('agent', 'many') AND owner_id IS NOT NULL
          AND (project_id IS NULL OR project_id = '${DEFAULT_PID}')
      `);

      const tablesWithProjectId = [
        'chat_sessions',
        'many_agents',
        'canvas_workflows',
        'workflow_executions',
        'automation_definitions',
        'automation_runs',
        'agent_folders',
        'workflow_folders',
      ];
      for (const t of tablesWithProjectId) {
        try {
          db.exec(
            `UPDATE ${t} SET project_id = '${DEFAULT_PID}' WHERE project_id IS NULL OR TRIM(COALESCE(project_id, '')) = ''`,
          );
        } catch {
          /* table/column edge cases on very old DBs */
        }
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_many_agents_project_id ON many_agents(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_agent_folders_project_id ON agent_folders(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_folders_project_id ON workflow_folders(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_canvas_workflows_project_id ON canvas_workflows(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_executions_project_id ON workflow_executions(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_definitions_project ON automation_definitions(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_runs_project ON automation_runs(project_id)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '23', ?)
        ON CONFLICT(key) DO UPDATE SET value = '23', updated_at = excluded.updated_at
      `).run(now);

      invalidateQueries();
      console.log('[DB] Migration 23 complete - project scope for agents, workflows, chat, automations, runs');
    } catch (error) {
      console.error('[DB] Migration 23 failed:', error);
    }
  }

  // Migration 24: semantic_relations + note_embeddings replace resource_links
  if (version < 24) {
    try {
      const now = Date.now();
      db.exec(`
        CREATE TABLE IF NOT EXISTS note_embeddings (
          resource_id TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          model_version TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
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
      db.exec('CREATE INDEX IF NOT EXISTS idx_note_embeddings_updated ON note_embeddings(updated_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_semantic_source ON semantic_relations(source_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_semantic_target ON semantic_relations(target_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_semantic_sim ON semantic_relations(similarity DESC)');

      const hasOldLinks = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='resource_links'")
        .get();
      if (hasOldLinks) {
        db.exec('DROP TABLE IF EXISTS resource_links_legacy');
        db.exec('CREATE TABLE resource_links_legacy AS SELECT * FROM resource_links');

        const pairs = db
          .prepare(
            `
          SELECT source_id, target_id, created_at, link_type
          FROM resource_links r
          WHERE source_id != target_id
            AND r.rowid = (
              SELECT MIN(r2.rowid) FROM resource_links r2
              WHERE r2.source_id = r.source_id AND r2.target_id = r.target_id
            )
        `,
          )
          .all();

        const insertRel = db.prepare(`
          INSERT OR IGNORE INTO semantic_relations
            (id, source_id, target_id, similarity, relation_type, label, detected_at)
          VALUES (?, ?, ?, 1.0, 'manual', ?, ?)
        `);

        for (const row of pairs) {
          const ts = typeof row.created_at === 'number' ? row.created_at : now;
          const label =
            row.link_type && row.link_type !== 'related' ? String(row.link_type) : null;
          insertRel.run(`${row.source_id}__${row.target_id}`, row.source_id, row.target_id, label, ts);
          insertRel.run(`${row.target_id}__${row.source_id}`, row.target_id, row.source_id, label, ts);
        }

        db.exec('DROP TABLE resource_links');
      }

      try {
        db.exec('DROP INDEX IF EXISTS idx_links_source');
      } catch {
        /* ignore */
      }
      try {
        db.exec('DROP INDEX IF EXISTS idx_links_target');
      } catch {
        /* ignore */
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '24', ?)
        ON CONFLICT(key) DO UPDATE SET value = '24', updated_at = excluded.updated_at
      `).run(now);

      invalidateQueries();
      console.log('[DB] Migration 24 complete - semantic_relations, note_embeddings');
    } catch (error) {
      console.error('[DB] Migration 24 failed:', error);
    }
  }

  // Migration 25: resource_chunks (Nomic 768-d), drop legacy note_embeddings, reset auto semantic edges
  if (version < 25) {
    try {
      const now = Date.now();
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
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
          UNIQUE(resource_id, chunk_index)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_resource_chunks_resource ON resource_chunks(resource_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_resource_chunks_model ON resource_chunks(model_version)');

      try {
        db.exec('DROP TABLE IF EXISTS note_embeddings');
      } catch {
        /* ignore */
      }
      try {
        db.exec('DROP INDEX IF EXISTS idx_note_embeddings_updated');
      } catch {
        /* ignore */
      }

      db.exec(`DELETE FROM semantic_relations WHERE relation_type = 'auto'`);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '25', ?)
        ON CONFLICT(key) DO UPDATE SET value = '25', updated_at = excluded.updated_at
      `).run(now);

      invalidateQueries();
      console.log('[DB] Migration 25 complete - resource_chunks, removed note_embeddings, cleared auto relations');
    } catch (error) {
      console.error('[DB] Migration 25 failed:', error);
    }
  }

  // Migration 26: remove PageIndex / Docling tables; Gemma PDF transcripts + page_number on chunks
  if (version < 26) {
    try {
      const now = Date.now();

      db.exec('DROP TABLE IF EXISTS resource_index_status');
      db.exec('DROP TABLE IF EXISTS resource_page_index');
      db.exec('DROP TABLE IF EXISTS resource_images');

      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_transcripts (
          resource_id TEXT NOT NULL,
          page_number INTEGER NOT NULL,
          markdown TEXT NOT NULL,
          model_used TEXT,
          file_hash TEXT,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (resource_id, page_number),
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_resource_transcripts_resource ON resource_transcripts(resource_id)');
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_resource_transcripts_resource_hash ON resource_transcripts(resource_id, file_hash)',
      );

      try {
        db.exec('ALTER TABLE resource_chunks ADD COLUMN page_number INTEGER');
      } catch {
        /* column already exists */
      }

      db.exec(
        `DELETE FROM resource_chunks WHERE resource_id IN (SELECT id FROM resources WHERE type IN ('pdf','image'))`,
      );
      db.exec(`DELETE FROM semantic_relations WHERE relation_type = 'auto'`);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '26', ?)
        ON CONFLICT(key) DO UPDATE SET value = '26', updated_at = excluded.updated_at
      `).run(now);

      invalidateQueries();
      console.log('[DB] Migration 26 complete - pageindex/docling removed, transcripts, page_number on chunks');
    } catch (error) {
      console.error('[DB] Migration 26 failed:', error);
    }
  }
}

/**
 * Get prepared queries (lazy initialization)
 */
function getQueries() {
  if (_queries) return _queries;

  const db = getDB();

  _queries = {
    // Projects
    createProject: db.prepare(`
      INSERT INTO projects (id, name, description, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getProjects: db.prepare('SELECT * FROM projects ORDER BY created_at DESC'),
    getProjectById: db.prepare('SELECT * FROM projects WHERE id = ?'),

    // Resources
    createResource: db.prepare(`
      INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getResourcesByProject: db.prepare('SELECT * FROM resources WHERE project_id = ? ORDER BY updated_at DESC'),
    getResourceById: db.prepare('SELECT * FROM resources WHERE id = ?'),
    getResourceByIdForIndexing: db.prepare(`
      SELECT id, project_id, type, title, content, metadata FROM resources WHERE id = ?
    `),
    updateResource: db.prepare(`
      UPDATE resources
      SET title = ?, content = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `),

    // Resources with internal file storage
    createResourceWithFile: db.prepare(`
      INSERT INTO resources (
        id, project_id, type, title, content, file_path,
        internal_path, file_mime_type, file_size, file_hash,
        thumbnail_data, original_filename, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateResourceFile: db.prepare(`
      UPDATE resources
      SET internal_path = ?, file_mime_type = ?, file_size = ?,
          file_hash = ?, thumbnail_data = ?, original_filename = ?, updated_at = ?
      WHERE id = ?
    `),
    updateResourceThumbnail: db.prepare(`
      UPDATE resources
      SET thumbnail_data = ?, updated_at = ?
      WHERE id = ?
    `),
    findByHash: db.prepare(`
      SELECT id, title, project_id, type, internal_path FROM resources WHERE file_hash = ?
    `),
    getAllInternalPaths: db.prepare(`
      SELECT internal_path FROM resources WHERE internal_path IS NOT NULL
    `),
    getResourcesWithLegacyPath: db.prepare(`
      SELECT * FROM resources
      WHERE file_path IS NOT NULL AND internal_path IS NULL
      ORDER BY created_at ASC
    `),
    deleteResource: db.prepare('DELETE FROM resources WHERE id = ?'),

    // Folder containment queries
    getResourcesByFolder: db.prepare('SELECT * FROM resources WHERE folder_id = ? ORDER BY updated_at DESC'),
    getRootResources: db.prepare('SELECT * FROM resources WHERE project_id = ? AND folder_id IS NULL ORDER BY updated_at DESC'),
    moveResourceToFolder: db.prepare('UPDATE resources SET folder_id = ?, updated_at = ? WHERE id = ?'),
    moveResourceToProject: db.prepare(
      'UPDATE resources SET project_id = ?, folder_id = ?, updated_at = ? WHERE id = ?',
    ),
    removeResourceFromFolder: db.prepare('UPDATE resources SET folder_id = NULL, updated_at = ? WHERE id = ?'),

    // Sources
    createSource: db.prepare(`
      INSERT INTO sources (id, resource_id, type, title, authors, year, doi, url, publisher, journal, volume, issue, pages, isbn, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSources: db.prepare('SELECT * FROM sources ORDER BY year DESC, title ASC'),
    getSourceById: db.prepare('SELECT * FROM sources WHERE id = ?'),

    // Full-text search (standalone FTS tables)
    searchResources: db.prepare(`
      SELECT r.* FROM resources r
      JOIN resources_fts fts ON r.id = fts.resource_id
      WHERE resources_fts MATCH ?
      ORDER BY rank
    `),

    // Settings
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `),

    // Many agents
    listManyAgents: db.prepare(
      'SELECT * FROM many_agents WHERE project_id = ? ORDER BY favorite DESC, updated_at DESC',
    ),
    getManyAgentById: db.prepare('SELECT * FROM many_agents WHERE id = ?'),
    createManyAgent: db.prepare(`
      INSERT INTO many_agents (
        id, project_id, name, description, system_instructions, tool_ids, mcp_server_ids,
        skill_ids, icon_index, marketplace_id, folder_id, favorite, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateManyAgent: db.prepare(`
      UPDATE many_agents
      SET project_id = ?, name = ?, description = ?, system_instructions = ?, tool_ids = ?, mcp_server_ids = ?,
          skill_ids = ?, icon_index = ?, marketplace_id = ?, folder_id = ?, favorite = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteManyAgent: db.prepare('DELETE FROM many_agents WHERE id = ?'),

    // Agent folders
    listAgentFolders: db.prepare(
      'SELECT * FROM agent_folders WHERE project_id = ? ORDER BY COALESCE(parent_id, \'\'), sort_order ASC, name ASC',
    ),
    getAgentFolderById: db.prepare('SELECT * FROM agent_folders WHERE id = ?'),
    createAgentFolder: db.prepare(`
      INSERT INTO agent_folders (id, project_id, parent_id, name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateAgentFolder: db.prepare(`
      UPDATE agent_folders
      SET parent_id = ?, name = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteAgentFolder: db.prepare('DELETE FROM agent_folders WHERE id = ?'),
    moveManyAgentsFolder: db.prepare(`
      UPDATE many_agents SET folder_id = ?, updated_at = ? WHERE folder_id = ?
    `),
    reparentAgentFolders: db.prepare(`
      UPDATE agent_folders SET parent_id = ?, updated_at = ? WHERE parent_id = ?
    `),

    // Canvas workflows
    listCanvasWorkflows: db.prepare('SELECT * FROM canvas_workflows WHERE project_id = ? ORDER BY updated_at DESC'),
    getCanvasWorkflowById: db.prepare('SELECT * FROM canvas_workflows WHERE id = ?'),
    createCanvasWorkflow: db.prepare(`
      INSERT INTO canvas_workflows (
        id, project_id, name, description, nodes_json, edges_json, marketplace_json, folder_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateCanvasWorkflow: db.prepare(`
      UPDATE canvas_workflows
      SET project_id = ?, name = ?, description = ?, nodes_json = ?, edges_json = ?, marketplace_json = ?, folder_id = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteCanvasWorkflow: db.prepare('DELETE FROM canvas_workflows WHERE id = ?'),

    // Workflow folders
    listWorkflowFolders: db.prepare(
      'SELECT * FROM workflow_folders WHERE project_id = ? ORDER BY COALESCE(parent_id, \'\'), sort_order ASC, name ASC',
    ),
    getWorkflowFolderById: db.prepare('SELECT * FROM workflow_folders WHERE id = ?'),
    createWorkflowFolder: db.prepare(`
      INSERT INTO workflow_folders (id, project_id, parent_id, name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateWorkflowFolder: db.prepare(`
      UPDATE workflow_folders
      SET parent_id = ?, name = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteWorkflowFolder: db.prepare('DELETE FROM workflow_folders WHERE id = ?'),
    moveCanvasWorkflowsFolder: db.prepare(`
      UPDATE canvas_workflows SET folder_id = ?, updated_at = ? WHERE folder_id = ?
    `),
    reparentWorkflowFolders: db.prepare(`
      UPDATE workflow_folders SET parent_id = ?, updated_at = ? WHERE parent_id = ?
    `),

    // Workflow executions
    listWorkflowExecutionsByWorkflow: db.prepare(`
      SELECT * FROM workflow_executions
      WHERE workflow_id = ?
      ORDER BY started_at DESC
    `),
    getWorkflowExecutionById: db.prepare('SELECT * FROM workflow_executions WHERE id = ?'),
    upsertWorkflowExecution: db.prepare(`
      INSERT INTO workflow_executions (
        id, workflow_id, project_id, workflow_name, started_at, finished_at, status, entries_json, node_outputs_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workflow_id = excluded.workflow_id,
        project_id = excluded.project_id,
        workflow_name = excluded.workflow_name,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        status = excluded.status,
        entries_json = excluded.entries_json,
        node_outputs_json = excluded.node_outputs_json,
        updated_at = excluded.updated_at
    `),
    trimWorkflowExecutions: db.prepare(`
      DELETE FROM workflow_executions
      WHERE workflow_id = ?
        AND id NOT IN (
          SELECT id FROM workflow_executions
          WHERE workflow_id = ?
          ORDER BY started_at DESC
          LIMIT ?
        )
    `),

    // MCP
    listMcpServers: db.prepare('SELECT * FROM mcp_servers ORDER BY updated_at DESC, name ASC'),
    getMcpServerById: db.prepare('SELECT * FROM mcp_servers WHERE id = ?'),
    getMcpServerByName: db.prepare('SELECT * FROM mcp_servers WHERE name = ?'),
    createMcpServer: db.prepare(`
      INSERT INTO mcp_servers (
        id, name, type, command, args_json, url, headers_json, env_json,
        enabled, tools_json, enabled_tool_ids_json, last_discovery_at,
        last_discovery_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateMcpServer: db.prepare(`
      UPDATE mcp_servers
      SET name = ?, type = ?, command = ?, args_json = ?, url = ?, headers_json = ?, env_json = ?,
          enabled = ?, tools_json = ?, enabled_tool_ids_json = ?, last_discovery_at = ?,
          last_discovery_error = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteAllMcpServers: db.prepare('DELETE FROM mcp_servers'),
    getMcpGlobalSettings: db.prepare('SELECT * FROM mcp_global_settings WHERE id = 1'),
    upsertMcpGlobalSettings: db.prepare(`
      INSERT INTO mcp_global_settings (id, enabled, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
    `),

    // Skills
    listAiSkills: db.prepare('SELECT * FROM ai_skills ORDER BY updated_at DESC, name ASC'),
    getAiSkillById: db.prepare('SELECT * FROM ai_skills WHERE id = ?'),
    createAiSkill: db.prepare(`
      INSERT INTO ai_skills (id, name, description, prompt, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateAiSkill: db.prepare(`
      UPDATE ai_skills
      SET name = ?, description = ?, prompt = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteAllAiSkills: db.prepare('DELETE FROM ai_skills'),

    // Marketplace install state
    listMarketplaceAgentInstalls: db.prepare('SELECT * FROM marketplace_agent_installs ORDER BY updated_at DESC'),
    upsertMarketplaceAgentInstall: db.prepare(`
      INSERT INTO marketplace_agent_installs (
        marketplace_id, local_agent_id, version, author, source,
        installed_at, updated_at, capabilities_json, resource_affinity_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(marketplace_id) DO UPDATE SET
        local_agent_id = excluded.local_agent_id,
        version = excluded.version,
        author = excluded.author,
        source = excluded.source,
        installed_at = excluded.installed_at,
        updated_at = excluded.updated_at,
        capabilities_json = excluded.capabilities_json,
        resource_affinity_json = excluded.resource_affinity_json
    `),
    deleteAllMarketplaceAgentInstalls: db.prepare('DELETE FROM marketplace_agent_installs'),

    listMarketplaceWorkflowInstalls: db.prepare('SELECT * FROM marketplace_workflow_installs ORDER BY updated_at DESC'),
    upsertMarketplaceWorkflowInstall: db.prepare(`
      INSERT INTO marketplace_workflow_installs (
        template_id, local_workflow_id, version, author, source,
        installed_at, updated_at, capabilities_json, resource_affinity_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(template_id) DO UPDATE SET
        local_workflow_id = excluded.local_workflow_id,
        version = excluded.version,
        author = excluded.author,
        source = excluded.source,
        installed_at = excluded.installed_at,
        updated_at = excluded.updated_at,
        capabilities_json = excluded.capabilities_json,
        resource_affinity_json = excluded.resource_affinity_json
    `),
    deleteAllMarketplaceWorkflowInstalls: db.prepare('DELETE FROM marketplace_workflow_installs'),

    listMarketplaceTemplateMappings: db.prepare('SELECT * FROM marketplace_template_mappings ORDER BY template_id ASC'),
    upsertMarketplaceTemplateMapping: db.prepare(`
      INSERT INTO marketplace_template_mappings (template_id, workflow_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(template_id) DO UPDATE SET workflow_id = excluded.workflow_id, updated_at = excluded.updated_at
    `),
    deleteAllMarketplaceTemplateMappings: db.prepare('DELETE FROM marketplace_template_mappings'),

    upsertDomeProviderSession: db.prepare(`
      INSERT INTO dome_provider_sessions (user_id, access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `),
    getActiveDomeProviderSession: db.prepare(`
      SELECT * FROM dome_provider_sessions
      WHERE expires_at > ?
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    getDomeProviderSessionWithRefresh: db.prepare(`
      SELECT * FROM dome_provider_sessions
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    clearDomeProviderSessions: db.prepare('DELETE FROM dome_provider_sessions'),

    // Resource Interactions
    createInteraction: db.prepare(`
      INSERT INTO resource_interactions (id, resource_id, type, content, position_data, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getInteractionsByResource: db.prepare('SELECT * FROM resource_interactions WHERE resource_id = ? ORDER BY created_at DESC'),
    getInteractionsByType: db.prepare('SELECT * FROM resource_interactions WHERE resource_id = ? AND type = ? ORDER BY created_at DESC'),
    updateInteraction: db.prepare(`
      UPDATE resource_interactions
      SET content = ?, position_data = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteInteraction: db.prepare('DELETE FROM resource_interactions WHERE id = ?'),

    // Chat sessions and messages (traceability)
    createChatSession: db.prepare(`
      INSERT INTO chat_sessions (id, project_id, agent_id, resource_id, mode, context_id, thread_id, title, tool_ids, mcp_server_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getChatSession: db.prepare('SELECT * FROM chat_sessions WHERE id = ?'),
    updateChatSession: db.prepare(`
      UPDATE chat_sessions SET mode = ?, context_id = ?, thread_id = ?, title = ?, tool_ids = ?, mcp_server_ids = ?, updated_at = ?
      WHERE id = ?
    `),
    getChatSessionsByAgent: db.prepare(`
      SELECT * FROM chat_sessions WHERE agent_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT ?
    `),
    getChatSessionsByResource: db.prepare(`
      SELECT * FROM chat_sessions WHERE resource_id = ? ORDER BY updated_at DESC LIMIT ?
    `),
    getChatSessionsGlobal: db.prepare(`
      SELECT * FROM chat_sessions WHERE agent_id IS NULL AND resource_id IS NULL AND project_id = ? ORDER BY updated_at DESC LIMIT ?
    `),
    createChatMessage: db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, tool_calls, thinking, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getChatMessagesBySession: db.prepare(`
      SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC
    `),
    appendChatTrace: db.prepare(`
      INSERT INTO chat_traces (id, session_id, message_id, type, tool_name, tool_args, result, mcp_server_id, decision, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    // Automations and persistent runs
    createAutomationDefinition: db.prepare(`
      INSERT INTO automation_definitions (
        id, project_id, title, description, target_type, target_id, trigger_type, schedule_json,
        input_template_json, output_mode, enabled, legacy_source, last_run_at, last_run_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateAutomationDefinition: db.prepare(`
      UPDATE automation_definitions
      SET project_id = ?, title = ?, description = ?, target_type = ?, target_id = ?, trigger_type = ?, schedule_json = ?,
          input_template_json = ?, output_mode = ?, enabled = ?, legacy_source = ?, last_run_at = ?, last_run_status = ?, updated_at = ?
      WHERE id = ?
    `),
    getAutomationDefinitionById: db.prepare('SELECT * FROM automation_definitions WHERE id = ?'),
    getAutomationDefinitionsByTarget: db.prepare(`
      SELECT * FROM automation_definitions
      WHERE target_type = ? AND target_id = ?
      ORDER BY updated_at DESC
    `),
    getAllAutomationDefinitions: db.prepare(`
      SELECT * FROM automation_definitions
      ORDER BY updated_at DESC
    `),
    getAutomationDefinitionsByProject: db.prepare(`
      SELECT * FROM automation_definitions
      WHERE project_id = ?
      ORDER BY updated_at DESC
    `),
    getEnabledScheduledAutomations: db.prepare(`
      SELECT * FROM automation_definitions
      WHERE enabled = 1 AND trigger_type = 'schedule'
      ORDER BY updated_at DESC
    `),
    deleteAutomationDefinition: db.prepare('DELETE FROM automation_definitions WHERE id = ?'),
    countAutomationDefinitions: db.prepare('SELECT COUNT(*) as count FROM automation_definitions'),

    createAutomationRun: db.prepare(`
      INSERT INTO automation_runs (
        id, project_id, automation_id, owner_type, owner_id, title, status, session_id, workflow_id,
        workflow_execution_id, thread_id, output_text, summary, error, metadata,
        started_at, updated_at, finished_at, last_heartbeat_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateAutomationRun: db.prepare(`
      UPDATE automation_runs
      SET project_id = ?, automation_id = ?, owner_type = ?, owner_id = ?, title = ?, status = ?, session_id = ?, workflow_id = ?,
          workflow_execution_id = ?, thread_id = ?, output_text = ?, summary = ?, error = ?, metadata = ?,
          updated_at = ?, finished_at = ?, last_heartbeat_at = ?
      WHERE id = ?
    `),
    getAutomationRunById: db.prepare('SELECT * FROM automation_runs WHERE id = ?'),
    getAutomationRunsByOwner: db.prepare(`
      SELECT * FROM automation_runs
      WHERE owner_type = ? AND owner_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    getAutomationRunsByAutomation: db.prepare(`
      SELECT * FROM automation_runs
      WHERE automation_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    getActiveRunBySession: db.prepare(`
      SELECT * FROM automation_runs
      WHERE session_id = ? AND status IN ('queued', 'running', 'waiting_approval')
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    getLatestAutomationRuns: db.prepare(`
      SELECT * FROM automation_runs
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    getLatestAutomationRunsByProject: db.prepare(`
      SELECT * FROM automation_runs
      WHERE project_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    deleteAutomationRun: db.prepare('DELETE FROM automation_runs WHERE id = ?'),

    createAutomationRunStep: db.prepare(`
      INSERT INTO automation_run_steps (
        id, run_id, parent_step_id, step_type, title, status, content, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateAutomationRunStep: db.prepare(`
      UPDATE automation_run_steps
      SET status = ?, content = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `),
    getAutomationRunSteps: db.prepare(`
      SELECT * FROM automation_run_steps
      WHERE run_id = ?
      ORDER BY created_at ASC
    `),
    createAutomationRunLink: db.prepare(`
      INSERT INTO automation_run_links (id, run_id, link_type, link_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    getAutomationRunLinks: db.prepare(`
      SELECT * FROM automation_run_links
      WHERE run_id = ?
      ORDER BY created_at ASC
    `),

    // Semantic chunk embeddings + relations (replaces resource_links / note_embeddings)
    countSemanticIndexableResources: db.prepare(`
      SELECT COUNT(*) AS c FROM resources
      WHERE type IN ('note','url','document','pdf','notebook','ppt','excel','image')
    `),
    countResourcesWithSemanticChunks: db.prepare(`
      SELECT COUNT(DISTINCT r.id) AS c
      FROM resources r
      INNER JOIN resource_chunks rc ON rc.resource_id = r.id AND rc.model_version = ?
      WHERE r.type IN ('note','url','document','pdf','notebook','ppt','excel','image')
    `),
    countSemanticChunksForModel: db.prepare(`
      SELECT COUNT(*) AS c FROM resource_chunks WHERE model_version = ?
    `),

    insertResourceChunk: db.prepare(`
      INSERT INTO resource_chunks (
        id, resource_id, chunk_index, text, embedding, model_version, char_start, char_end, page_number, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteChunksByResource: db.prepare('DELETE FROM resource_chunks WHERE resource_id = ?'),
    getChunksByResource: db.prepare(`
      SELECT * FROM resource_chunks WHERE resource_id = ? ORDER BY chunk_index ASC
    `),
    getAllChunkIdsByModel: db.prepare(
      'SELECT id FROM resource_chunks WHERE model_version = ?',
    ),
    getChunkEmbeddingsByResource: db.prepare(`
      SELECT embedding FROM resource_chunks WHERE resource_id = ? ORDER BY chunk_index ASC
    `),
    getChunksBatchByIds: db.prepare(`
      SELECT * FROM resource_chunks WHERE id IN (SELECT value FROM json_each(?))
    `),
    getAllChunkRowsForModel: db.prepare(`
      SELECT id, resource_id, chunk_index, char_start, char_end, text, embedding, model_version
      FROM resource_chunks
      WHERE model_version = ?
    `),
    /** Evita cargar toda la tabla en memoria al actualizar relaciones semánticas por recurso. */
    getDistinctChunkResourceIdsExcluding: db.prepare(`
      SELECT DISTINCT resource_id AS resource_id
      FROM resource_chunks
      WHERE model_version = ? AND resource_id != ?
    `),
    getChunkEmbeddingsByResourceForModel: db.prepare(`
      SELECT embedding FROM resource_chunks
      WHERE resource_id = ? AND model_version = ?
      ORDER BY chunk_index ASC
    `),
    getChunkRowsForSemanticSearch: db.prepare(`
      SELECT c.id, c.resource_id, c.chunk_index, c.char_start, c.char_end, c.page_number, c.text, c.embedding,
             r.title AS res_title, r.type AS res_type
      FROM resource_chunks c
      INNER JOIN resources r ON r.id = c.resource_id
      WHERE c.model_version = ?
    `),

    insertSemanticRelation: db.prepare(`
      INSERT INTO semantic_relations (id, source_id, target_id, similarity, relation_type, label, detected_at, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSemanticRelationByPair: db.prepare(
      'SELECT * FROM semantic_relations WHERE source_id = ? AND target_id = ? LIMIT 1',
    ),
    getSemanticRelationById: db.prepare('SELECT * FROM semantic_relations WHERE id = ?'),
    updateSemanticRelationState: db.prepare(`
      UPDATE semantic_relations
      SET relation_type = ?, confirmed_at = ?
      WHERE id = ?
    `),
    deleteSemanticAutoFromSource: db.prepare(`
      DELETE FROM semantic_relations WHERE source_id = ? AND relation_type = 'auto'
    `),
    updateSemanticAutoByPair: db.prepare(`
      UPDATE semantic_relations
      SET similarity = ?, detected_at = ?
      WHERE source_id = ? AND target_id = ? AND relation_type = 'auto'
    `),
    deleteSemanticRelationById: db.prepare('DELETE FROM semantic_relations WHERE id = ?'),

    getSemanticOutgoing: db.prepare(`
      SELECT sr.*, r.title AS target_title, r.type AS target_type
      FROM semantic_relations sr
      JOIN resources r ON r.id = sr.target_id
      WHERE sr.source_id = ? AND sr.relation_type != 'rejected'
      ORDER BY sr.similarity DESC, sr.detected_at DESC
    `),
    getSemanticIncoming: db.prepare(`
      SELECT sr.*, r.title AS source_title, r.type AS source_type
      FROM semantic_relations sr
      JOIN resources r ON r.id = sr.source_id
      WHERE sr.target_id = ? AND sr.relation_type != 'rejected'
      ORDER BY sr.similarity DESC, sr.detected_at DESC
    `),

    // Tags
    getTagsByResource: db.prepare(`
      SELECT t.* FROM tags t
      JOIN resource_tags rt ON t.id = rt.tag_id
      WHERE rt.resource_id = ?
      ORDER BY t.name
    `),
    getAllTagsWithCount: db.prepare(`
      SELECT t.*, COUNT(rt.resource_id) as resource_count
      FROM tags t
      LEFT JOIN resource_tags rt ON t.id = rt.tag_id
      GROUP BY t.id
      ORDER BY resource_count DESC, t.name ASC
    `),
    getResourcesByTag: db.prepare(`
      SELECT r.* FROM resources r
      JOIN resource_tags rt ON r.id = rt.resource_id
      WHERE rt.tag_id = ?
      ORDER BY r.updated_at DESC
    `),
    findTagByNameInsensitive: db.prepare(`
      SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1
    `),
    insertTag: db.prepare(`
      INSERT INTO tags (id, name, color, created_at)
      VALUES (?, ?, ?, ?)
    `),
    getTagById: db.prepare('SELECT * FROM tags WHERE id = ?'),
    attachTagToResource: db.prepare(`
      INSERT OR IGNORE INTO resource_tags (resource_id, tag_id)
      VALUES (?, ?)
    `),
    detachTagFromResource: db.prepare(`
      DELETE FROM resource_tags WHERE resource_id = ? AND tag_id = ?
    `),
    findUrlResourceByCanonicalUrl: db.prepare(`
      SELECT * FROM resources
      WHERE type = 'url'
        AND (content = ? OR json_extract(metadata, '$.url') = ?)
      LIMIT 1
    `),

    // Search (standalone FTS tables)
    searchInteractions: db.prepare(`
      SELECT i.*, r.title as resource_title, r.type as resource_type FROM resource_interactions i
      JOIN interactions_fts fts ON i.id = fts.interaction_id
      JOIN resources r ON i.resource_id = r.id
      WHERE interactions_fts MATCH ?
      ORDER BY rank
    `),
    getAllResources: db.prepare('SELECT * FROM resources ORDER BY updated_at DESC LIMIT ?'),

    // Search for mentions (quick search for autocomplete)
    searchForMention: db.prepare(`
      SELECT id, title, type, thumbnail_data
      FROM resources
      WHERE title LIKE ? OR id LIKE ?
      ORDER BY updated_at DESC
      LIMIT 10
    `),

    // Get backlinks (manual or confirmed relations pointing to this resource)
    getBacklinks: db.prepare(`
      SELECT sr.id,
             sr.source_id,
             sr.target_id,
             sr.similarity,
             sr.relation_type AS link_type,
             sr.label,
             sr.detected_at AS created_at,
             r.title AS source_title,
             r.type AS source_type
      FROM semantic_relations sr
      JOIN resources r ON r.id = sr.source_id
      WHERE sr.target_id = ?
        AND sr.relation_type IN ('manual', 'confirmed')
        AND sr.source_id != sr.target_id
      ORDER BY sr.detected_at DESC
    `),

    // Knowledge Graph - Nodes
    createGraphNode: db.prepare(`
      INSERT INTO graph_nodes (id, resource_id, label, type, properties, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getGraphNodeById: db.prepare('SELECT * FROM graph_nodes WHERE id = ?'),
    getGraphNodesByType: db.prepare('SELECT * FROM graph_nodes WHERE type = ? ORDER BY created_at DESC'),
    getGraphNodeByResource: db.prepare('SELECT * FROM graph_nodes WHERE resource_id = ?'),
    updateGraphNode: db.prepare(`
      UPDATE graph_nodes
      SET label = ?, properties = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteGraphNode: db.prepare('DELETE FROM graph_nodes WHERE id = ?'),
    searchGraphNodes: db.prepare(`
      SELECT * FROM graph_nodes
      WHERE label LIKE ? OR properties LIKE ?
      ORDER BY created_at DESC
      LIMIT 50
    `),

    // Knowledge Graph - Edges
    createGraphEdge: db.prepare(`
      INSERT INTO graph_edges (id, source_id, target_id, relation, weight, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getGraphEdgeById: db.prepare('SELECT * FROM graph_edges WHERE id = ?'),
    getGraphEdgesBySource: db.prepare('SELECT * FROM graph_edges WHERE source_id = ?'),
    getGraphEdgesByTarget: db.prepare('SELECT * FROM graph_edges WHERE target_id = ?'),
    getGraphEdgesByRelation: db.prepare('SELECT * FROM graph_edges WHERE relation = ?'),
    updateGraphEdge: db.prepare(`
      UPDATE graph_edges
      SET relation = ?, weight = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteGraphEdge: db.prepare('DELETE FROM graph_edges WHERE id = ?'),

    // Knowledge Graph - Traversal (1-hop)
    getNodeNeighbors: db.prepare(`
      SELECT DISTINCT n.*, e.relation, e.weight
      FROM graph_edges e
      JOIN graph_nodes n ON (e.target_id = n.id OR e.source_id = n.id)
      WHERE (e.source_id = ? OR e.target_id = ?) AND n.id != ?
      ORDER BY e.weight DESC
      LIMIT 100
    `),

    // Flashcard Decks
    createFlashcardDeck: db.prepare(`
      INSERT INTO flashcard_decks (id, resource_id, project_id, title, description, card_count, tags, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getFlashcardDeckById: db.prepare('SELECT * FROM flashcard_decks WHERE id = ?'),
    getFlashcardDecksByProject: db.prepare('SELECT * FROM flashcard_decks WHERE project_id = ? ORDER BY updated_at DESC'),
    getAllFlashcardDecks: db.prepare('SELECT * FROM flashcard_decks ORDER BY updated_at DESC LIMIT ?'),
    updateFlashcardDeck: db.prepare(`
      UPDATE flashcard_decks SET title = ?, description = ?, card_count = ?, tags = ?, settings = ?, updated_at = ? WHERE id = ?
    `),
    deleteFlashcardDeck: db.prepare('DELETE FROM flashcard_decks WHERE id = ?'),

    // Flashcards
    createFlashcard: db.prepare(`
      INSERT INTO flashcards (id, deck_id, question, answer, difficulty, tags, metadata, ease_factor, interval, repetitions, next_review_at, last_reviewed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getFlashcardsByDeck: db.prepare('SELECT * FROM flashcards WHERE deck_id = ? ORDER BY created_at ASC'),
    getFlashcardById: db.prepare('SELECT * FROM flashcards WHERE id = ?'),
    getDueFlashcards: db.prepare(`
      SELECT * FROM flashcards WHERE deck_id = ? AND (next_review_at IS NULL OR next_review_at <= ?) ORDER BY next_review_at ASC LIMIT ?
    `),
    updateFlashcardReview: db.prepare(`
      UPDATE flashcards SET ease_factor = ?, interval = ?, repetitions = ?, next_review_at = ?, last_reviewed_at = ?, updated_at = ? WHERE id = ?
    `),
    updateFlashcard: db.prepare(`
      UPDATE flashcards SET question = ?, answer = ?, difficulty = ?, tags = ?, metadata = ?, updated_at = ? WHERE id = ?
    `),
    deleteFlashcard: db.prepare('DELETE FROM flashcards WHERE id = ?'),
    getFlashcardStats: db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN next_review_at IS NULL THEN 1 ELSE 0 END) as new_cards,
        SUM(CASE WHEN next_review_at IS NOT NULL AND next_review_at <= ? THEN 1 ELSE 0 END) as due_cards,
        SUM(CASE WHEN interval >= 21 THEN 1 ELSE 0 END) as mastered_cards
      FROM flashcards WHERE deck_id = ?
    `),

    // Flashcard Sessions
    createFlashcardSession: db.prepare(`
      INSERT INTO flashcard_sessions (id, deck_id, cards_studied, cards_correct, cards_incorrect, duration_ms, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSessionsByDeck: db.prepare('SELECT * FROM flashcard_sessions WHERE deck_id = ? ORDER BY started_at DESC LIMIT ?'),

    // Gemma PDF transcripts (per page cache)
    upsertResourceTranscript: db.prepare(`
      INSERT INTO resource_transcripts (resource_id, page_number, markdown, model_used, file_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(resource_id, page_number) DO UPDATE SET
        markdown = excluded.markdown,
        model_used = excluded.model_used,
        file_hash = excluded.file_hash,
        created_at = excluded.created_at
    `),
    getResourceTranscriptsByResource: db.prepare(`
      SELECT page_number, markdown, model_used, file_hash, created_at
      FROM resource_transcripts WHERE resource_id = ? ORDER BY page_number ASC
    `),
    deleteResourceTranscripts: db.prepare('DELETE FROM resource_transcripts WHERE resource_id = ?'),
    countResourceTranscriptsForHash: db.prepare(`
      SELECT COUNT(*) AS c FROM resource_transcripts
      WHERE resource_id = ? AND file_hash = ?
    `),
    updateResourceContent: db.prepare(`
      UPDATE resources SET content = ?, updated_at = ? WHERE id = ?
    `),

    // Calendar - Accounts
    createCalendarAccount: db.prepare(`
      INSERT INTO calendar_accounts (id, provider, account_email, credentials, status, last_sync_at, sync_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarAccountById: db.prepare('SELECT * FROM calendar_accounts WHERE id = ?'),
    getCalendarAccountsByProvider: db.prepare('SELECT * FROM calendar_accounts WHERE provider = ? ORDER BY created_at DESC'),
    getAllCalendarAccounts: db.prepare('SELECT * FROM calendar_accounts ORDER BY created_at DESC'),
    updateCalendarAccount: db.prepare(`
      UPDATE calendar_accounts SET account_email = ?, credentials = ?, status = ?, last_sync_at = ?, sync_token = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteCalendarAccount: db.prepare('DELETE FROM calendar_accounts WHERE id = ?'),

    // Calendar - Calendars
    createCalendarCalendar: db.prepare(`
      INSERT INTO calendar_calendars (id, account_id, remote_id, title, color, is_selected, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarCalendarById: db.prepare('SELECT * FROM calendar_calendars WHERE id = ?'),
    getCalendarCalendarsByAccount: db.prepare('SELECT * FROM calendar_calendars WHERE account_id = ? ORDER BY is_default DESC, title ASC'),
    getSelectedCalendarCalendars: db.prepare('SELECT * FROM calendar_calendars WHERE is_selected = 1 ORDER BY is_default DESC'),
    getDefaultCalendar: db.prepare('SELECT * FROM calendar_calendars WHERE is_default = 1 LIMIT 1'),
    updateCalendarCalendar: db.prepare(`
      UPDATE calendar_calendars SET title = ?, color = ?, is_selected = ?, is_default = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteCalendarCalendar: db.prepare('DELETE FROM calendar_calendars WHERE id = ?'),

    // Calendar - Events
    createCalendarEvent: db.prepare(`
      INSERT INTO calendar_events (id, calendar_id, title, description, location, start_at, end_at, timezone, all_day, status, reminders, metadata, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarEventById: db.prepare('SELECT * FROM calendar_events WHERE id = ?'),
    getCalendarEventsByRange: db.prepare(`
      SELECT e.*, c.title as calendar_title, c.color as calendar_color
      FROM calendar_events e
      JOIN calendar_calendars c ON e.calendar_id = c.id
      WHERE c.is_selected = 1 AND e.status != 'cancelled'
        AND e.start_at < ? AND e.end_at > ?
      ORDER BY e.start_at ASC
    `),
    getUpcomingCalendarEvents: db.prepare(`
      SELECT e.*, c.title as calendar_title, c.color as calendar_color
      FROM calendar_events e
      JOIN calendar_calendars c ON e.calendar_id = c.id
      WHERE c.is_selected = 1 AND e.status != 'cancelled'
        AND e.start_at >= ? AND e.start_at <= ?
      ORDER BY e.start_at ASC
      LIMIT ?
    `),
    updateCalendarEvent: db.prepare(`
      UPDATE calendar_events SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, timezone = ?, all_day = ?, status = ?, reminders = ?, metadata = ?, source = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteCalendarEvent: db.prepare('DELETE FROM calendar_events WHERE id = ?'),

    // Calendar - Event Links (local <-> remote)
    createCalendarEventLink: db.prepare(`
      INSERT INTO calendar_event_links (id, event_id, provider, remote_event_id, remote_calendar_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarEventLinkByEvent: db.prepare('SELECT * FROM calendar_event_links WHERE event_id = ?'),
    getCalendarEventLinkByRemote: db.prepare('SELECT * FROM calendar_event_links WHERE provider = ? AND remote_event_id = ?'),
    deleteCalendarEventLinksByEvent: db.prepare('DELETE FROM calendar_event_links WHERE event_id = ?'),

    // Calendar - Notifications
    createCalendarNotification: db.prepare(`
      INSERT INTO calendar_notifications (id, event_id, notify_at, notified_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    getPendingCalendarNotifications: db.prepare(`
      SELECT n.*, e.title, e.start_at, e.calendar_id
      FROM calendar_notifications n
      JOIN calendar_events e ON n.event_id = e.id
      WHERE n.notify_at <= ? AND n.notified_at IS NULL
      ORDER BY n.notify_at ASC
      LIMIT ?
    `),
    markCalendarNotificationNotified: db.prepare(`
      UPDATE calendar_notifications SET notified_at = ? WHERE id = ?
    `),
    deleteCalendarNotificationsForEvent: db.prepare(`
      DELETE FROM calendar_notifications WHERE event_id = ?
    `),
  };

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
    const integrityCheck = result[0]?.integrity_check || result[0]?.quick_check;
    
    if (integrityCheck === 'ok') {
      return { ok: true, errors: [] };
    }
    
    return { ok: false, errors: [integrityCheck] };
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
    // Close any existing prepared statements that might be using the corrupted tables
    invalidateQueries();
    
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
    // Rollback on error
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DB] Error during rollback:', rollbackError.message);
    }
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
