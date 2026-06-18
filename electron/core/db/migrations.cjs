/* eslint-disable no-console */
/**
 * SQLite migrations (05/T03 fase b — extracted verbatim from database.cjs).
 *
 * Frozen history: each `if (version < N)` block is applied in order by
 * `applyMigrations(db, version)`. New installs get the final schema directly
 * (see schema setup in database.cjs); existing installs run the runner.
 * Backup/restore atomicity is handled by the caller (runMigrations).
 *
 * Add a new migration by appending an `if (version < N+1)` block at the end
 * that bumps `schema_version` to the new value.
 */

const crypto = require('crypto');

// Electron's package throws on require when its binary isn't installed
// (some tooling runs without it); migrations only use app paths at runtime.
let app = null;
try {
  ({ app } = require('electron'));
} catch {
  /* outside Electron */
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

function applyMigrations(db, version) {
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

  // Migration 4: Add tables for auth profiles and Many memory
  if (version < 4) {
    console.log('[DB] Running migration 4: Add auth_profiles and martin_memory tables');

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

      console.log('[DB] Migration 4 complete - auth_profiles and martin_memory tables added');
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

  // Migration 27: transcription sessions & chunks (clean-slate redesign)
  if (version < 27) {
    console.log('[DB] Running migration 27 - transcription sessions & chunks');
    try {
      const now = Date.now();

      db.exec(`
        CREATE TABLE IF NOT EXISTS transcription_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL DEFAULT 'default',
          folder_id TEXT,
          status TEXT NOT NULL CHECK(status IN ('recording','paused','transcribing','done','error','cancelled')),
          sources TEXT NOT NULL,
          live_preview INTEGER NOT NULL DEFAULT 0,
          save_audio INTEGER NOT NULL DEFAULT 1,
          session_dir TEXT NOT NULL,
          resource_id TEXT,
          partial_text TEXT NOT NULL DEFAULT '',
          error_message TEXT,
          started_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          finished_at INTEGER,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_transcription_sessions_status ON transcription_sessions(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_transcription_sessions_project ON transcription_sessions(project_id)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS transcription_chunks (
          session_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          track TEXT NOT NULL CHECK(track IN ('mic','system')),
          start_ms INTEGER NOT NULL,
          duration_ms INTEGER,
          file_path TEXT NOT NULL,
          text TEXT,
          PRIMARY KEY (session_id, track, seq),
          FOREIGN KEY (session_id) REFERENCES transcription_sessions(id) ON DELETE CASCADE
        )
      `);

      // Prune legacy settings keys from the previous hub/call architecture
      const legacyKeys = [
        'transcription_hub_default_mode',
        'transcription_call_live_transcript_default',
        'transcription_call_chunk_sec',
        'transcription_call_summary_model',
        'transcription_call_auto_summary',
      ];
      for (const k of legacyKeys) {
        try { db.prepare('DELETE FROM settings WHERE key = ?').run(k); } catch { /* ignore */ }
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '27', ?)
        ON CONFLICT(key) DO UPDATE SET value = '27', updated_at = excluded.updated_at
      `).run(now);

      invalidateQueries();
      console.log('[DB] Migration 27 complete - transcription sessions & chunks');
    } catch (error) {
      console.error('[DB] Migration 27 failed:', error);
    }
  }

  // Migration 28: Add 'artifact' to resources.type CHECK constraint
  {
    let needsArtifactType = false;
    try {
      const testStmt = db.prepare(
        `INSERT INTO resources (id, project_id, type, title, created_at, updated_at)
         VALUES ('__test_artifact_28__', 'default', 'artifact', 'Test', 0, 0)`
      );
      testStmt.run();
    } catch {
      needsArtifactType = true;
    } finally {
      try { db.exec("DELETE FROM resources WHERE id = '__test_artifact_28__'"); } catch { /* no-op if row was never inserted */ }
    }

    if (needsArtifactType) {
      const v = parseInt(
        db.prepare('SELECT value FROM settings WHERE key = ?').get('schema_version')?.value ?? '0',
        10
      );
      if (v < 28) {
        console.log('[DB] Running migration 28: add artifact type to resources');
        const now = Date.now();
        try {
          const tableInfo = db.prepare('PRAGMA table_info(resources)').all();
          const existingCols = new Set(tableInfo.map((c) => c.name));
          db.exec('DROP TABLE IF EXISTS resources_new');
          db.exec(`
            CREATE TABLE resources_new (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              type TEXT NOT NULL CHECK(type IN (
                'note','pdf','video','audio','image','url','document',
                'folder','notebook','excel','ppt','artifact'
              )),
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
          const base = ['id','project_id','type','title','content','file_path','metadata','created_at','updated_at'];
          const optional = ['internal_path','file_mime_type','file_size','file_hash','thumbnail_data','original_filename','folder_id'];
          const cols = [...base, ...optional.filter((c) => existingCols.has(c))].join(', ');
          db.exec(`INSERT INTO resources_new (${cols}) SELECT ${cols} FROM resources`);
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
          } catch (triggerErr) {
            console.log('[DB] FTS triggers already exist:', triggerErr.message);
          }
          db.prepare(
            `INSERT INTO settings (key, value, updated_at)
             VALUES ('schema_version', '28', ?)
             ON CONFLICT(key) DO UPDATE SET value = '28', updated_at = excluded.updated_at`
          ).run(now);
          invalidateQueries();
          console.log('[DB] Migration 28 complete - artifact type added to resources');
        } catch (error) {
          console.error('[DB] Migration 28 failed:', error);
        }
      }
    }
  }

  if (version < 29) {
    console.log('[DB] Running migration 29 - artifact_runtime_data + automation_artifact_bindings');
    try {
      const now = Date.now();
      db.exec('PRAGMA foreign_keys = ON');
      db.exec(`
        CREATE TABLE IF NOT EXISTS artifact_runtime_data (
          id TEXT PRIMARY KEY,
          artifact_id TEXT NOT NULL,
          slot TEXT NOT NULL DEFAULT 'default',
          data_json TEXT NOT NULL,
          schema_version INTEGER NOT NULL DEFAULT 1,
          last_run_id TEXT,
          last_automation_id TEXT,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
          UNIQUE(artifact_id, slot)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_artifact_runtime_data_artifact ON artifact_runtime_data(artifact_id)');
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_artifact_runtime_data_auto ON artifact_runtime_data(last_automation_id)',
      );

      db.exec(`
        CREATE TABLE IF NOT EXISTS automation_artifact_bindings (
          id TEXT PRIMARY KEY,
          automation_id TEXT NOT NULL,
          artifact_resource_id TEXT NOT NULL,
          slot TEXT NOT NULL DEFAULT 'default',
          update_policy TEXT NOT NULL DEFAULT 'replace',
          transform_hint TEXT,
          extract_mode TEXT NOT NULL DEFAULT 'json_fence',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (automation_id) REFERENCES automation_definitions(id) ON DELETE CASCADE,
          FOREIGN KEY (artifact_resource_id) REFERENCES resources(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_auto_art_bindings_auto ON automation_artifact_bindings(automation_id)');
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_auto_art_bindings_res ON automation_artifact_bindings(artifact_resource_id)',
      );

      const artRows = db.prepare('SELECT id, state FROM artifacts').all();
      const insertRt = db.prepare(`
        INSERT OR IGNORE INTO artifact_runtime_data (
          id, artifact_id, slot, data_json, schema_version, last_run_id, last_automation_id, updated_at
        ) VALUES (?, ?, 'default', ?, 1, NULL, NULL, ?)
      `);
      for (const ar of artRows) {
        let st = {};
        try {
          st = JSON.parse(ar.state || '{}');
        } catch {
          st = {};
        }
        const data = st && typeof st.data === 'object' && st.data !== null && !Array.isArray(st.data) ? st.data : null;
        if (data && Object.keys(data).length > 0) {
          insertRt.run(crypto.randomUUID(), ar.id, JSON.stringify(data), now);
        }
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '29', ?)
        ON CONFLICT(key) DO UPDATE SET value = '29', updated_at = excluded.updated_at
      `).run(now);

      invalidateQueries();
      console.log('[DB] Migration 29 complete - artifact runtime + automation bindings');
    } catch (error) {
      console.error('[DB] Migration 29 failed:', error);
    }
  }

  // Migration 30: Reclassify mis-typed document resources (xlsx→excel, pptx→ppt)
  if (version < 30) {
    console.log('[DB] Running migration 30 - reclassify xlsx/pptx resources');
    try {
      const now = Date.now();
      db.prepare(`
        UPDATE resources
        SET type='excel', updated_at=?
        WHERE type='document'
          AND (
            lower(original_filename) LIKE '%.xlsx'
            OR lower(original_filename) LIKE '%.xls'
            OR lower(original_filename) LIKE '%.csv'
            OR file_mime_type LIKE '%spreadsheetml%'
            OR file_mime_type = 'text/csv'
          )
      `).run(now);

      db.prepare(`
        UPDATE resources
        SET type='ppt', updated_at=?
        WHERE type='document'
          AND (
            lower(original_filename) LIKE '%.pptx'
            OR lower(original_filename) LIKE '%.ppt'
            OR file_mime_type LIKE '%presentationml%'
          )
      `).run(now);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '30', ?)
        ON CONFLICT(key) DO UPDATE SET value = '30', updated_at = excluded.updated_at
      `).run(now);

      invalidateQueries();
      console.log('[DB] Migration 30 complete - xlsx/pptx reclassified');
    } catch (error) {
      console.error('[DB] Migration 30 failed:', error);
    }
  }

  // Migration 31: Drop WhatsApp tables (integration removed)
  if (version < 31) {
    console.log('[DB] Running migration 31 - drop WhatsApp tables');
    try {
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec('DROP TABLE IF EXISTS whatsapp_messages');
      db.exec('DROP TABLE IF EXISTS whatsapp_sessions');
      db.exec('PRAGMA foreign_keys = ON');
      try {
        db.prepare('DELETE FROM settings WHERE key = ?').run('whatsapp_allowlist');
      } catch {
        /* ignore */
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '31', ?)
        ON CONFLICT(key) DO UPDATE SET value = '31', updated_at = excluded.updated_at
      `).run(Date.now());
      invalidateQueries();
      console.log('[DB] Migration 31 complete');
    } catch (error) {
      try {
        db.exec('PRAGMA foreign_keys = ON');
      } catch {
        /* ignore */
      }
      console.error('[DB] Migration 31 failed:', error);
    }
  }

  // Migration 32: Local state for Dome cloud sync (Provider + Supabase)
  if (version < 32) {
    console.log('[DB] Running migration 32 - dome_cloud_sync');
    try {
      const now = Date.now();
      db.exec(`
        CREATE TABLE IF NOT EXISTS dome_cloud_sync (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          device_id TEXT NOT NULL,
          last_server_revision INTEGER NOT NULL DEFAULT 0,
          last_event_poll_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
      `);
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '32', ?)
        ON CONFLICT(key) DO UPDATE SET value = '32', updated_at = excluded.updated_at
      `).run(now);
      invalidateQueries();
      console.log('[DB] Migration 32 complete');
    } catch (error) {
      console.error('[DB] Migration 32 failed:', error);
    }
  }

  // Migration 33: Add last_push_at to dome_cloud_sync for delta sync
  if (version < 33) {
    console.log('[DB] Running migration 33 - dome_cloud_sync last_push_at');
    try {
      const now = Date.now();
      // SQLite bundled with Electron is older than 3.37 — no `IF NOT EXISTS` on ADD COLUMN.
      const syncCols = new Set(db.prepare('PRAGMA table_info(dome_cloud_sync)').all().map((c) => c.name));
      if (!syncCols.has('last_push_at')) {
        db.exec(`ALTER TABLE dome_cloud_sync ADD COLUMN last_push_at INTEGER NOT NULL DEFAULT 0`);
      }
      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '33', ?)
         ON CONFLICT(key) DO UPDATE SET value = '33', updated_at = excluded.updated_at`,
      ).run(now);
      invalidateQueries();
      console.log('[DB] Migration 33 complete');
    } catch (error) {
      console.error('[DB] Migration 33 failed:', error);
    }
  }

  // Migration 34: agent_store table for the agent runtime BaseStore cross-thread memory
  if (version < 34) {
    console.log('[DB] Running migration 34 - agent_store table');
    try {
      const now = Date.now();
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_store (
          namespace TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (namespace, key)
        );
        CREATE INDEX IF NOT EXISTS idx_agent_store_namespace ON agent_store (namespace);
      `);
      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '34', ?)
         ON CONFLICT(key) DO UPDATE SET value = '34', updated_at = excluded.updated_at`,
      ).run(now);
      invalidateQueries();
      console.log('[DB] Migration 34 complete');
    } catch (error) {
      console.error('[DB] Migration 34 failed:', error);
    }
  }

  // Migration 35: many_agent_versions — snapshot history for agent definitions
  if (version < 35) {
    console.log('[DB] Running migration 35 - many_agent_versions table');
    try {
      const now = Date.now();
      db.exec(`
        CREATE TABLE IF NOT EXISTS many_agent_versions (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL REFERENCES many_agents(id) ON DELETE CASCADE,
          version_number INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          system_instructions TEXT,
          tool_ids TEXT NOT NULL DEFAULT '[]',
          mcp_server_ids TEXT NOT NULL DEFAULT '[]',
          skill_ids TEXT NOT NULL DEFAULT '[]',
          icon_index INTEGER NOT NULL DEFAULT 1,
          change_note TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_many_agent_versions_agent_id ON many_agent_versions (agent_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_many_agent_versions_agent_version
          ON many_agent_versions (agent_id, version_number);
      `);
      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '35', ?)
         ON CONFLICT(key) DO UPDATE SET value = '35', updated_at = excluded.updated_at`,
      ).run(now);
      invalidateQueries();
      console.log('[DB] Migration 35 complete');
    } catch (error) {
      console.error('[DB] Migration 35 failed:', error);
    }
  }

  // Migration 36: artifact feeders + extend automation target_type for feeder
  if (version < 36) {
    console.log('[DB] Running migration 36 - artifact feeders');
    try {
      const now = Date.now();
      db.exec('PRAGMA foreign_keys = ON');

      db.exec(`
        CREATE TABLE IF NOT EXISTS feeders (
          id TEXT PRIMARY KEY,
          artifact_resource_id TEXT NOT NULL,
          slot TEXT NOT NULL DEFAULT 'default',
          name TEXT NOT NULL,
          description TEXT,
          interpreter TEXT NOT NULL CHECK(interpreter IN ('python3', 'node', 'bash', 'sh', 'curl')),
          script TEXT NOT NULL,
          script_hash TEXT NOT NULL,
          env_secret_refs TEXT NOT NULL DEFAULT '[]',
          env_static TEXT NOT NULL DEFAULT '{}',
          output_mode TEXT NOT NULL DEFAULT 'stdout_json' CHECK(output_mode IN ('stdout_json', 'output_file')),
          update_policy TEXT NOT NULL DEFAULT 'replace' CHECK(update_policy IN ('replace', 'merge_shallow', 'merge_deep', 'append_array')),
          timeout_ms INTEGER NOT NULL DEFAULT 60000,
          enabled INTEGER NOT NULL DEFAULT 1,
          approved INTEGER NOT NULL DEFAULT 0,
          approved_script_hash TEXT,
          last_run_at INTEGER,
          last_status TEXT,
          last_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (artifact_resource_id) REFERENCES resources(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_feeders_artifact ON feeders(artifact_resource_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_feeders_enabled ON feeders(enabled, approved)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS feeder_secrets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          encrypted_value BLOB NOT NULL,
          last_used_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_feeder_secrets_name ON feeder_secrets(name)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS feeder_runs (
          id TEXT PRIMARY KEY,
          feeder_id TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
          exit_code INTEGER,
          stdout_excerpt TEXT,
          stderr_excerpt TEXT,
          data_bytes INTEGER NOT NULL DEFAULT 0,
          triggered_by TEXT NOT NULL CHECK(triggered_by IN ('agent', 'user', 'automation')),
          automation_id TEXT,
          FOREIGN KEY (feeder_id) REFERENCES feeders(id) ON DELETE CASCADE,
          FOREIGN KEY (automation_id) REFERENCES automation_definitions(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_feeder_runs_feeder ON feeder_runs(feeder_id, started_at DESC)');

      // Extend automation_definitions.target_type CHECK to include 'feeder'
      const autoCols = db.prepare('PRAGMA table_info(automation_definitions)').all();
      const autoColNames = autoCols.map((c) => c.name);
      const autoSelect = autoColNames.join(', ');
      db.exec('DROP TABLE IF EXISTS automation_definitions_new');
      db.exec(`
        CREATE TABLE automation_definitions_new (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          target_type TEXT NOT NULL CHECK(target_type IN ('many', 'agent', 'workflow', 'feeder')),
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
      db.exec(`INSERT INTO automation_definitions_new (${autoSelect}) SELECT ${autoSelect} FROM automation_definitions`);
      db.exec('DROP TABLE automation_definitions');
      db.exec('ALTER TABLE automation_definitions_new RENAME TO automation_definitions');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_definitions_target ON automation_definitions(target_type, target_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_definitions_trigger ON automation_definitions(trigger_type, enabled)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_automation_definitions_project ON automation_definitions(project_id)');

      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '36', ?)
         ON CONFLICT(key) DO UPDATE SET value = '36', updated_at = excluded.updated_at`,
      ).run(now);
      invalidateQueries();
      console.log('[DB] Migration 36 complete - artifact feeders');
    } catch (error) {
      console.error('[DB] Migration 36 failed:', error);
    }
  }

  // Migration 37: quiz run history for Learn deck overview
  if (version < 37) {
    console.log('[DB] Running migration 37 - quiz_runs');
    try {
      const now = Date.now();
      db.exec('PRAGMA foreign_keys = ON');
      db.exec(`
        CREATE TABLE IF NOT EXISTS quiz_runs (
          id TEXT PRIMARY KEY,
          studio_output_id TEXT NOT NULL,
          deck_id TEXT,
          total INTEGER NOT NULL,
          correct INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          per_question TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          completed_at INTEGER NOT NULL,
          FOREIGN KEY (studio_output_id) REFERENCES studio_outputs(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_quiz_runs_output ON quiz_runs(studio_output_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_quiz_runs_completed ON quiz_runs(completed_at DESC)');

      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '37', ?)
         ON CONFLICT(key) DO UPDATE SET value = '37', updated_at = excluded.updated_at`,
      ).run(now);
      invalidateQueries();
      console.log('[DB] Migration 37 complete - quiz_runs');
    } catch (error) {
      console.error('[DB] Migration 37 failed:', error);
    }
  }

  // Migration 38: FSRS spaced-repetition fields on flashcards (replaces SM-2)
  if (version < 38) {
    console.log('[DB] Running migration 38 - FSRS flashcard fields');
    try {
      const now = Date.now();
      const info = db.prepare('PRAGMA table_info(flashcards)').all();
      const cols = new Set(info.map((c) => c.name));
      const addCol = (name, ddl) => {
        if (!cols.has(name)) db.exec(`ALTER TABLE flashcards ADD COLUMN ${ddl}`);
      };
      // NB: a TEXT `difficulty` column (easy/medium/hard) already exists — FSRS
      // difficulty lives in its own `fsrs_difficulty` REAL column to avoid clobbering it.
      addCol('stability', 'stability REAL');
      addCol('fsrs_difficulty', 'fsrs_difficulty REAL');
      addCol('fsrs_state', 'fsrs_state INTEGER DEFAULT 0');
      addCol('lapses', 'lapses INTEGER DEFAULT 0');
      addCol('scheduled_days', 'scheduled_days INTEGER DEFAULT 0');
      addCol('learning_steps', 'learning_steps INTEGER DEFAULT 0');
      addCol('last_rating', 'last_rating INTEGER');

      // Backfill FSRS state from legacy SM-2 fields for already-reviewed cards.
      // Never-reviewed cards stay New (stability NULL) and are scheduled on first review.
      const { backfillFromLegacy } = require('../services/fsrs-scheduler.cjs');
      const allCards = db
        .prepare('SELECT id, ease_factor, interval, repetitions, last_reviewed_at, stability FROM flashcards')
        .all();
      const upd = db.prepare(
        'UPDATE flashcards SET stability = ?, fsrs_difficulty = ?, fsrs_state = ?, lapses = ?, scheduled_days = ?, learning_steps = ? WHERE id = ?',
      );
      const backfill = db.transaction((rows) => {
        for (const row of rows) {
          if (row.stability != null) continue; // already migrated
          const next = backfillFromLegacy(row);
          if (!next) continue; // never reviewed → leave New
          upd.run(next.stability, next.fsrs_difficulty, next.fsrs_state, next.lapses, next.scheduled_days, next.learning_steps, row.id);
        }
      });
      backfill(allCards);

      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '38', ?)
         ON CONFLICT(key) DO UPDATE SET value = '38', updated_at = excluded.updated_at`,
      ).run(now);
      invalidateQueries();
      console.log('[DB] Migration 38 complete - FSRS fields');
    } catch (error) {
      console.error('[DB] Migration 38 failed:', error);
    }
  }

  // Migration 39: keep flashcard_decks.card_count accurate via triggers
  if (version < 39) {
    console.log('[DB] Running migration 39 - card_count triggers');
    try {
      const now = Date.now();
      // Repair existing skew (single-card deletes never decremented the count)
      db.exec(
        'UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE flashcards.deck_id = flashcard_decks.id)',
      );
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_flashcards_count_ai
        AFTER INSERT ON flashcards
        BEGIN
          UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = NEW.deck_id) WHERE id = NEW.deck_id;
        END;
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_flashcards_count_ad
        AFTER DELETE ON flashcards
        BEGIN
          UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = OLD.deck_id) WHERE id = OLD.deck_id;
        END;
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_flashcards_count_au
        AFTER UPDATE OF deck_id ON flashcards
        WHEN OLD.deck_id IS NOT NEW.deck_id
        BEGIN
          UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = OLD.deck_id) WHERE id = OLD.deck_id;
          UPDATE flashcard_decks SET card_count = (SELECT COUNT(*) FROM flashcards WHERE deck_id = NEW.deck_id) WHERE id = NEW.deck_id;
        END;
      `);

      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '39', ?)
         ON CONFLICT(key) DO UPDATE SET value = '39', updated_at = excluded.updated_at`,
      ).run(now);
      console.log('[DB] Migration 39 complete - card_count triggers');
    } catch (error) {
      console.error('[DB] Migration 39 failed:', error);
    }
  }

  // Migration 40: unified study_events table (flash + quiz) and missing FKs
  if (version < 40) {
    console.log('[DB] Running migration 40 - study_events + FKs');
    try {
      const now = Date.now();
      db.exec(`
        CREATE TABLE IF NOT EXISTS study_events (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          deck_id TEXT,
          studio_output_id TEXT,
          kind TEXT NOT NULL,
          cards_studied INTEGER DEFAULT 0,
          cards_correct INTEGER DEFAULT 0,
          cards_incorrect INTEGER DEFAULT 0,
          duration_ms INTEGER DEFAULT 0,
          started_at INTEGER NOT NULL,
          completed_at INTEGER
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_study_events_kind ON study_events(kind)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_study_events_started ON study_events(started_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_study_events_deck ON study_events(deck_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_study_events_project ON study_events(project_id)');

      // Backfill from legacy flashcard_sessions (resolve project via deck)
      db.exec(`
        INSERT OR IGNORE INTO study_events
          (id, project_id, deck_id, studio_output_id, kind, cards_studied, cards_correct, cards_incorrect, duration_ms, started_at, completed_at)
        SELECT s.id, d.project_id, s.deck_id, NULL, 'flashcard',
               s.cards_studied, s.cards_correct, s.cards_incorrect, s.duration_ms, s.started_at, s.completed_at
        FROM flashcard_sessions s LEFT JOIN flashcard_decks d ON s.deck_id = d.id
      `);
      // Backfill from legacy quiz_runs (resolve project via studio output)
      db.exec(`
        INSERT OR IGNORE INTO study_events
          (id, project_id, deck_id, studio_output_id, kind, cards_studied, cards_correct, cards_incorrect, duration_ms, started_at, completed_at)
        SELECT q.id, so.project_id, q.deck_id, q.studio_output_id, 'quiz',
               q.total, q.correct, (q.total - q.correct), q.duration_ms, q.started_at, q.completed_at
        FROM quiz_runs q LEFT JOIN studio_outputs so ON q.studio_output_id = so.id
      `);

      // Add ON DELETE SET NULL FKs to studio_outputs.deck_id / resource_id if missing
      const soFks = db.prepare('PRAGMA foreign_key_list(studio_outputs)').all();
      if (!soFks.some((f) => f.from === 'deck_id')) {
        db.exec('PRAGMA foreign_keys = OFF');
        db.exec(`
          CREATE TABLE studio_outputs_new (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            source_ids TEXT,
            file_path TEXT,
            metadata TEXT,
            deck_id TEXT,
            resource_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE SET NULL,
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL
          )
        `);
        db.exec(`
          INSERT INTO studio_outputs_new
            (id, project_id, type, title, content, source_ids, file_path, metadata, deck_id, resource_id, created_at, updated_at)
          SELECT id, project_id, type, title, content, source_ids, file_path, metadata, deck_id, resource_id, created_at, updated_at
          FROM studio_outputs
        `);
        // Null out dangling links so the new FKs are consistent
        db.exec('UPDATE studio_outputs_new SET deck_id = NULL WHERE deck_id IS NOT NULL AND deck_id NOT IN (SELECT id FROM flashcard_decks)');
        db.exec('UPDATE studio_outputs_new SET resource_id = NULL WHERE resource_id IS NOT NULL AND resource_id NOT IN (SELECT id FROM resources)');
        db.exec('DROP TABLE studio_outputs');
        db.exec('ALTER TABLE studio_outputs_new RENAME TO studio_outputs');
        db.exec('CREATE INDEX IF NOT EXISTS idx_studio_outputs_project ON studio_outputs(project_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_studio_outputs_type ON studio_outputs(type)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_studio_outputs_deck ON studio_outputs(deck_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_studio_outputs_resource ON studio_outputs(resource_id)');
        db.exec('PRAGMA foreign_keys = ON');
      }

      // Add ON DELETE SET NULL FK to quiz_runs.deck_id if missing
      const qrFks = db.prepare('PRAGMA foreign_key_list(quiz_runs)').all();
      if (!qrFks.some((f) => f.from === 'deck_id')) {
        db.exec('PRAGMA foreign_keys = OFF');
        db.exec(`
          CREATE TABLE quiz_runs_new (
            id TEXT PRIMARY KEY,
            studio_output_id TEXT NOT NULL,
            deck_id TEXT,
            total INTEGER NOT NULL,
            correct INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            per_question TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            completed_at INTEGER NOT NULL,
            FOREIGN KEY (studio_output_id) REFERENCES studio_outputs(id) ON DELETE CASCADE,
            FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE SET NULL
          )
        `);
        db.exec('UPDATE quiz_runs SET deck_id = NULL WHERE deck_id IS NOT NULL AND deck_id NOT IN (SELECT id FROM flashcard_decks)');
        db.exec(`
          INSERT INTO quiz_runs_new (id, studio_output_id, deck_id, total, correct, duration_ms, per_question, started_at, completed_at)
          SELECT id, studio_output_id, deck_id, total, correct, duration_ms, per_question, started_at, completed_at FROM quiz_runs
        `);
        db.exec('DROP TABLE quiz_runs');
        db.exec('ALTER TABLE quiz_runs_new RENAME TO quiz_runs');
        db.exec('CREATE INDEX IF NOT EXISTS idx_quiz_runs_output ON quiz_runs(studio_output_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_quiz_runs_completed ON quiz_runs(completed_at DESC)');
        db.exec('PRAGMA foreign_keys = ON');
      }

      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '40', ?)
         ON CONFLICT(key) DO UPDATE SET value = '40', updated_at = excluded.updated_at`,
      ).run(now);
      invalidateQueries();
      console.log('[DB] Migration 40 complete - study_events + FKs');
    } catch (error) {
      db.exec('PRAGMA foreign_keys = ON');
      console.error('[DB] Migration 40 failed:', error);
    }
  }

  // Migration 41: KPI cache so getKpis/getStreak don't rescan 365 days each call
  if (version < 41) {
    console.log('[DB] Running migration 41 - learn_kpis_cache');
    try {
      const now = Date.now();
      db.exec(`
        CREATE TABLE IF NOT EXISTS learn_kpis_cache (
          scope TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          computed_at INTEGER NOT NULL
        )
      `);
      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', '41', ?)
         ON CONFLICT(key) DO UPDATE SET value = '41', updated_at = excluded.updated_at`,
      ).run(now);
      console.log('[DB] Migration 41 complete - learn_kpis_cache');
    } catch (error) {
      console.error('[DB] Migration 41 failed:', error);
    }
  }

  // Migration 42: per-provider API keys/base URLs — copy the legacy shared
  // ai_api_key / ai_base_url into the active provider's slots (encrypted value
  // is copied verbatim; same safeStorage encryption). Legacy keys stay as a
  // read fallback for the active provider only.
  if (version < 42) {
    console.log('[DB] Running migration 42 - per-provider AI credentials');
    try {
      const now = Date.now();
      const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
      const setSetting = db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      const provider = getSetting.get('ai_provider')?.value;
      const keyless = new Set(['dome', 'copilot', 'ollama']);
      if (provider && !keyless.has(provider)) {
        const legacyKey = getSetting.get('ai_api_key')?.value;
        if (legacyKey && !getSetting.get(`ai_api_key_${provider}`)?.value) {
          setSetting.run(`ai_api_key_${provider}`, legacyKey, now);
        }
        const legacyBase = getSetting.get('ai_base_url')?.value;
        if (legacyBase && String(legacyBase).trim() && !getSetting.get(`ai_base_url_${provider}`)?.value) {
          setSetting.run(`ai_base_url_${provider}`, legacyBase, now);
        }
      }
      setSetting.run('schema_version', '42', now);
      console.log('[DB] Migration 42 complete - per-provider AI credentials');
    } catch (error) {
      console.error('[DB] Migration 42 failed:', error);
    }
  }

  if (version < 43) {
    console.log('[DB] Running migration 43 - GitHub project sync tables');
    try {
      // Selected repositories to sync.
      db.exec(`
        CREATE TABLE IF NOT EXISTS github_repos (
          id TEXT PRIMARY KEY,
          remote_id INTEGER NOT NULL,
          owner TEXT NOT NULL,
          name TEXT NOT NULL,
          full_name TEXT NOT NULL,
          private INTEGER DEFAULT 0,
          html_url TEXT,
          selected INTEGER DEFAULT 0,
          last_sync_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(full_name)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_repos_selected ON github_repos(selected)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS github_milestones (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          number INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          due_on INTEGER,
          state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'closed')),
          open_issues INTEGER DEFAULT 0,
          closed_issues INTEGER DEFAULT 0,
          html_url TEXT,
          remote_updated_at INTEGER,
          dome_updated_at INTEGER,
          dirty INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, number)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_milestones_repo ON github_milestones(repo_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_milestones_dirty ON github_milestones(dirty)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS github_issues (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          number INTEGER NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'closed')),
          milestone_number INTEGER,
          due_date INTEGER,
          labels TEXT,
          assignees TEXT,
          is_pull_request INTEGER DEFAULT 0,
          html_url TEXT,
          remote_updated_at INTEGER,
          dome_updated_at INTEGER,
          dirty INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, number)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_issues_repo ON github_issues(repo_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_issues_milestone ON github_issues(repo_id, milestone_number)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_issues_dirty ON github_issues(dirty)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS github_branches (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          name TEXT NOT NULL,
          sha TEXT,
          protected INTEGER DEFAULT 0,
          linked_issue_number INTEGER,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, name)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_branches_repo ON github_branches(repo_id)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS github_releases (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          remote_id INTEGER NOT NULL,
          tag_name TEXT NOT NULL,
          name TEXT,
          published_at INTEGER,
          html_url TEXT,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, remote_id)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_releases_repo ON github_releases(repo_id)');

      // Per-repo, per-resource ETags for conditional requests (rate-limit budget).
      db.exec(`
        CREATE TABLE IF NOT EXISTS github_sync_state (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          resource TEXT NOT NULL,
          etag TEXT,
          last_synced_at INTEGER,
          FOREIGN KEY (repo_id) REFERENCES github_repos(id) ON DELETE CASCADE,
          UNIQUE(repo_id, resource)
        )
      `);

      // Maps a GitHub entity to the Dome calendar event it projects to
      // (mirrors calendar_event_links). Lets us upsert/delete idempotently.
      db.exec(`
        CREATE TABLE IF NOT EXISTS github_calendar_links (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('milestone', 'issue', 'release')),
          entity_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
          UNIQUE(entity_type, entity_id)
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_calendar_links_event ON github_calendar_links(event_id)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '43', ?)
        ON CONFLICT(key) DO UPDATE SET value = '43', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 43 complete - GitHub project sync tables');
    } catch (error) {
      console.error('[DB] Migration 43 failed:', error);
      throw error;
    }
  }

  if (version < 44) {
    console.log('[DB] Running migration 44 - GitHub milestone closed_at');
    try {
      const cols = db.prepare('PRAGMA table_info(github_milestones)').all();
      if (!cols.some((c) => c.name === 'closed_at')) {
        db.exec('ALTER TABLE github_milestones ADD COLUMN closed_at INTEGER');
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '44', ?)
        ON CONFLICT(key) DO UPDATE SET value = '44', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 44 complete - GitHub milestone closed_at');
    } catch (error) {
      console.error('[DB] Migration 44 failed:', error);
      throw error;
    }
  }
}

module.exports = { applyMigrations };
