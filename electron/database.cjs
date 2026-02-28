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

  // Resource Links table (graph-like relationships between resources)
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_links (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      link_type TEXT NOT NULL DEFAULT 'related',
      weight REAL DEFAULT 1.0,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES resources(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id, link_type)
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_links_source ON resource_links(source_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_links_target ON resource_links(target_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_search_index_resource ON search_index(resource_id)');

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

  // PageIndex - hierarchical document tree index (replaces LanceDB embeddings)
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_page_index (
      resource_id TEXT PRIMARY KEY,
      tree_json TEXT NOT NULL,
      indexed_at INTEGER NOT NULL,
      model_used TEXT,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_resource_page_index_resource ON resource_page_index(resource_id)');

  // Populate FTS tables with existing data (important for external content FTS tables)
  populateFTSTables(db);

  // Run migrations
  runMigrations(db);

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
      `).run('default', 'My Library', 'Default project for resources', now, now);
      console.log('[DB] Default project created');
    }
  } catch (error) {
    console.error('[DB] Error creating default project:', error.message);
  }
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

  // Migration 13: Notes domain (Docmost-style pages)
  if (version < 13) {
    console.log('[DB] Running migration 13: Add notes domain tables');

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          slug_id TEXT UNIQUE NOT NULL,
          project_id TEXT NOT NULL,
          parent_note_id TEXT,
          title TEXT NOT NULL,
          icon TEXT,
          content_json TEXT,
          text_content TEXT,
          position TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          deleted_at INTEGER,
          last_updated_by TEXT,
          contributor_ids TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_note_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_notes_slug ON notes(slug_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_notes_position ON notes(project_id, parent_note_id, position)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS note_history (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL,
          slug_id TEXT NOT NULL,
          title TEXT NOT NULL,
          icon TEXT,
          content_json TEXT,
          text_content TEXT,
          last_updated_by TEXT,
          contributor_ids TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_note_history_note ON note_history(note_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_note_history_created ON note_history(note_id, created_at DESC)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS note_links (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          link_type TEXT NOT NULL DEFAULT 'mention',
          created_at INTEGER NOT NULL,
          FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE CASCADE,
          UNIQUE(source_id, target_id, link_type)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_id)');

      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
          note_id,
          title,
          text_content
        )
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
          INSERT INTO notes_fts(note_id, title, text_content)
          VALUES (new.id, new.title, COALESCE(new.text_content, ''));
        END
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
          DELETE FROM notes_fts WHERE note_id = old.id;
        END
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
          DELETE FROM notes_fts WHERE note_id = old.id;
          INSERT INTO notes_fts(note_id, title, text_content)
          VALUES (new.id, new.title, COALESCE(new.text_content, ''));
        END
      `);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '13', ?)
        ON CONFLICT(key) DO UPDATE SET value = '13', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 13 complete - notes domain tables added');
    } catch (error) {
      console.error('[DB] Migration 13 error:', error.message);
      throw error;
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

    // Resource Links
    createLink: db.prepare(`
      INSERT INTO resource_links (id, source_id, target_id, link_type, weight, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getLinksBySource: db.prepare('SELECT * FROM resource_links WHERE source_id = ?'),
    getLinksByTarget: db.prepare('SELECT * FROM resource_links WHERE target_id = ?'),
    deleteLink: db.prepare('DELETE FROM resource_links WHERE id = ?'),

    // Notes (Docmost-style domain)
    createNote: db.prepare(`
      INSERT INTO notes (id, slug_id, project_id, parent_note_id, title, icon, content_json, text_content, position, created_at, updated_at, last_updated_by, contributor_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getNoteById: db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL'),
    getNoteByIdIncludeDeleted: db.prepare('SELECT * FROM notes WHERE id = ?'),
    getNoteBySlugId: db.prepare('SELECT * FROM notes WHERE slug_id = ? AND deleted_at IS NULL'),
    getNoteByIdOrSlug: db.prepare(`
      SELECT * FROM notes WHERE (id = ? OR slug_id = ?) AND deleted_at IS NULL
    `),
    updateNote: db.prepare(`
      UPDATE notes SET title = ?, icon = ?, content_json = ?, text_content = ?, position = ?, parent_note_id = ?, updated_at = ?, last_updated_by = ?, contributor_ids = ?
      WHERE id = ?
    `),
    softDeleteNote: db.prepare('UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?'),
    restoreNote: db.prepare('UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ?'),
    hardDeleteNote: db.prepare('DELETE FROM notes WHERE id = ?'),
    getRootNotes: db.prepare(`
      SELECT * FROM notes WHERE project_id = ? AND parent_note_id IS NULL AND deleted_at IS NULL
      ORDER BY position ASC, created_at ASC
    `),
    getChildNotes: db.prepare(`
      SELECT * FROM notes WHERE parent_note_id = ? AND deleted_at IS NULL
      ORDER BY position ASC, created_at ASC
    `),
    getNotesByProject: db.prepare(`
      SELECT * FROM notes WHERE project_id = ? AND deleted_at IS NULL
      ORDER BY position ASC, created_at ASC
    `),
    getDeletedNotes: db.prepare(`
      SELECT * FROM notes WHERE project_id = ? AND deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `),
    moveNotePosition: db.prepare('UPDATE notes SET position = ?, parent_note_id = ?, updated_at = ? WHERE id = ?'),
    createNoteHistory: db.prepare(`
      INSERT INTO note_history (id, note_id, slug_id, title, icon, content_json, text_content, last_updated_by, contributor_ids, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getNoteHistory: db.prepare(`
      SELECT * FROM note_history WHERE note_id = ? ORDER BY created_at DESC LIMIT ?
    `),
    getNoteHistoryById: db.prepare('SELECT * FROM note_history WHERE id = ?'),
    getLegacyNoteResources: db.prepare(`
      SELECT id, project_id, title, content, created_at, updated_at
      FROM resources
      WHERE type = 'note' AND id NOT IN (SELECT id FROM notes)
      ORDER BY created_at ASC
    `),
    searchNotes: db.prepare(`
      SELECT n.* FROM notes n
      JOIN notes_fts fts ON n.id = fts.note_id
      WHERE notes_fts MATCH ? AND n.deleted_at IS NULL AND n.project_id = ?
      ORDER BY rank
      LIMIT 50
    `),
    getNoteBacklinks: db.prepare(`
      SELECT l.*, n.title as source_title
      FROM note_links l
      JOIN notes n ON l.source_id = n.id
      WHERE l.target_id = ? AND n.deleted_at IS NULL
      ORDER BY l.created_at DESC
    `),
    createNoteLink: db.prepare(`
      INSERT OR IGNORE INTO note_links (id, source_id, target_id, link_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    deleteNoteLink: db.prepare('DELETE FROM note_links WHERE id = ?'),
    deleteNoteLinksBySource: db.prepare('DELETE FROM note_links WHERE source_id = ?'),

    // Tags
    getTagsByResource: db.prepare(`
      SELECT t.* FROM tags t
      JOIN resource_tags rt ON t.id = rt.tag_id
      WHERE rt.resource_id = ?
      ORDER BY t.name
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

    // Get backlinks (resources that link to this resource)
    getBacklinks: db.prepare(`
      SELECT l.*, r.title as source_title, r.type as source_type
      FROM resource_links l
      JOIN resources r ON l.source_id = r.id
      WHERE l.target_id = ?
      ORDER BY l.created_at DESC
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

    // PageIndex - hierarchical document tree index (reasoning-based RAG)
    upsertPageIndex: db.prepare(`
      INSERT INTO resource_page_index (resource_id, tree_json, indexed_at, model_used)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(resource_id) DO UPDATE SET
        tree_json = excluded.tree_json,
        indexed_at = excluded.indexed_at,
        model_used = excluded.model_used
    `),
    getPageIndex: db.prepare('SELECT * FROM resource_page_index WHERE resource_id = ?'),
    getPageIndexByIds: db.prepare(`
      SELECT * FROM resource_page_index WHERE resource_id IN (SELECT value FROM json_each(?))
    `),
    deletePageIndex: db.prepare('DELETE FROM resource_page_index WHERE resource_id = ?'),
    getAllPageIndexedIds: db.prepare('SELECT resource_id FROM resource_page_index'),
    getPageIndexStats: db.prepare(`
      SELECT COUNT(*) as total_indexed, MAX(indexed_at) as last_indexed_at FROM resource_page_index
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
};
