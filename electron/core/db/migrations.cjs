/* eslint-disable no-console */
/**
 * SQLite migrations (05/T03 fase b — extracted verbatim from database.cjs).
 *
 * Frozen history: each `migrationN(db, version)` function guards itself with
 * `if (version < N)` (or a runtime schema check) and is applied in order by
 * `applyMigrations(db, version)` via MIGRATION_STEPS. New installs get the
 * final schema directly (see schema setup in database.cjs); existing installs
 * run the runner. Backup/restore atomicity is handled by the caller
 * (runMigrations).
 *
 * Add a new migration by defining a `migrationN+1` function that bumps
 * `schema_version` to the new value and appending it to MIGRATION_STEPS.
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

// Each migrationN() below was extracted verbatim from the original monolithic
// applyMigrations body. Every function keeps its own `if (version < N)` /
// runtime-check guard, so calling them unconditionally in order is exactly
// equivalent to the previous sequential `if (version < N)` blocks.
// `invalidateQueries` lives in database.cjs (it clears the prepared-statement
// cache); default to a no-op so migrations never throw a ReferenceError.

// Migration 1: Add internal file storage columns to resources
function migration1(db, version) {
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
}

// Migration 2: Update resources table CHECK constraint to include 'folder' type
// ALWAYS check if migration is needed by testing the actual constraint
function migration2(db, version) {
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
}

// Migration 3: Add folder_id column for folder containment
// Check if folder_id column exists (it may have been added by migration 2)
function migration3(db, version) {
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
}

// Migration 4: Add tables for auth profiles and Many memory
function migration4(db, version) {
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
}

// Migration 5: Add knowledge graph tables (nodes and edges)
function migration5(db, version) {
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
}

// Migration 6: Add flashcard tables for spaced repetition study
function migration6(db, version) {
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
}

// Migration 7: Add studio_outputs table
function migration7(db, version) {
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
}

// Migration 8: Studio-Flashcards unification (deck_id, resource_id, studio_output_id)
function migration8(db, version) {
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
}

// Migration 9: Add 'notebook' to resources type constraint
function migration9(db, version) {
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
}

// Migration 10: Add 'excel' to resources type constraint
function migration10(db) {
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
}

// Migration 11: Add 'ppt' to resources type constraint
function migration11(db) {
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
}

// Migration 12: Add calendar tables
// Also run if schema_version was incorrectly set or tables have wrong schema (e.g. from failed partial migration)
function migration12(db, version) {
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
}

// Migration 14: Schema cleanup — drop dead tables, fix FKs, remove unused columns
function migration14(db, version) {
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
}

// Migration 15: Chat sessions, messages, and traces for AI chat traceability
function migration15(db, version) {
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
}

function migration16(db, version) {
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
}

function migration17(db, version) {
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
}

// Migration 18: Resource images from Docling cloud conversion
function migration18(db, version) {
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
}

function migration19(db, version) {
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
}

function migration20(db, version, invalidateQueries) {
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
}

// Migration 21: repair many_agents.favorite if schema_version reached 20 without the column
// (e.g. partial/failed migration 20 or older builds that bumped version early)
function migration21(db, version, invalidateQueries) {
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
}

// Migration 22: repair folder_id / workflow folder schema if version advanced without migration 20
// (e.g. only migration 21 ran, or partial DB state)
function migration22(db, version, invalidateQueries) {
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
}

// Migration 23: project scope for agents, workflows, chat, automations, runs, folders, executions
function migration23(db, version, invalidateQueries) {
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
}

// Migration 24: semantic_relations + note_embeddings replace resource_links
function createMigration24Tables(db) {
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
}

function hasLegacyResourceLinksTable(db) {
  return Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='resource_links'")
      .get(),
  );
}

function migrateLegacyResourceLinks(db, now) {
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

function dropLegacyResourceLinkIndexes(db) {
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
}

function migration24(db, version, invalidateQueries) {
  if (version < 24) {
    try {
      const now = Date.now();
      createMigration24Tables(db);
      if (hasLegacyResourceLinksTable(db)) {
        migrateLegacyResourceLinks(db, now);
      }
      dropLegacyResourceLinkIndexes(db);
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
}

// Migration 25: resource_chunks (Nomic 768-d), drop legacy note_embeddings, reset auto semantic edges
function migration25(db, version, invalidateQueries) {
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
}

// Migration 26: remove PageIndex / Docling tables; Gemma PDF transcripts + page_number on chunks
function migration26(db, version, invalidateQueries) {
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

// Migration 27: transcription sessions & chunks (clean-slate redesign)
function migration27(db, version, invalidateQueries) {
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
}

function migration29(db, version, invalidateQueries) {
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
}

// Migration 30: Reclassify mis-typed document resources (xlsx→excel, pptx→ppt)
function migration30(db, version, invalidateQueries) {
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
}

// Migration 31: Drop WhatsApp tables (integration removed)
function migration31(db, version, invalidateQueries) {
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
}

// Migration 32: Local state for Dome cloud sync (Provider + Supabase)
function migration32(db, version, invalidateQueries) {
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
}

// Migration 33: Add last_push_at to dome_cloud_sync for delta sync
function migration33(db, version, invalidateQueries) {
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
}

// Migration 34: agent_store table for the agent runtime BaseStore cross-thread memory
function migration34(db, version, invalidateQueries) {
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
}

// Migration 35: many_agent_versions — snapshot history for agent definitions
function migration35(db, version, invalidateQueries) {
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
}

// Migration 36: artifact feeders + extend automation target_type for feeder
function migration36(db, version, invalidateQueries) {
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
}

// Migration 37: quiz run history for Learn deck overview
function migration37(db, version, invalidateQueries) {
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
}

// Migration 38: FSRS spaced-repetition fields on flashcards (replaces SM-2)
function migration38(db, version, invalidateQueries) {
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
      const { backfillFromLegacy } = require('../../services/fsrs-scheduler.cjs');
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
}

// Migration 39: keep flashcard_decks.card_count accurate via triggers
function migration39(db, version) {
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
}

// Migration 40: unified study_events table (flash + quiz) and missing FKs
function migration40(db, version, invalidateQueries) {
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
}

// Migration 41: KPI cache so getKpis/getStreak don't rescan 365 days each call
function migration41(db, version) {
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
}

// Migration 42: per-provider API keys/base URLs — copy the legacy shared
// ai_api_key / ai_base_url into the active provider's slots (encrypted value
// is copied verbatim; same safeStorage encryption). Legacy keys stay as a
// read fallback for the active provider only.
function migration42(db, version) {
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
}

function migration43(db, version) {
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
}

function migration44(db, version) {
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

function migration45(db, version) {
  if (version < 45) {
    console.log('[DB] Running migration 45 - email accounts (himalaya)');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          display_name TEXT,
          imap_host TEXT NOT NULL,
          imap_port INTEGER NOT NULL DEFAULT 993,
          imap_encryption TEXT NOT NULL DEFAULT 'tls',
          smtp_host TEXT NOT NULL,
          smtp_port INTEGER NOT NULL DEFAULT 465,
          smtp_encryption TEXT NOT NULL DEFAULT 'tls',
          username TEXT NOT NULL,
          secret TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '45', ?)
        ON CONFLICT(key) DO UPDATE SET value = '45', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 45 complete - email accounts');
    } catch (error) {
      console.error('[DB] Migration 45 failed:', error);
      throw error;
    }
  }
}

function migration46(db, version) {
  if (version < 46) {
    console.log('[DB] Running migration 46 - notes markdown vault (vault_path)');
    try {
      // Relative path of the note's mirror .md file inside dome-files/vault/
      // (e.g. "Mi Proyecto/Investigacion/Nota A.md"). NULL until the note has
      // been mirrored to disk. Non-destructive: resources.content stays the
      // source of truth in this phase; the .md is an export mirror.
      const tableInfoM46 = db.prepare('PRAGMA table_info(resources)').all();
      const existingColumnsM46 = new Set(tableInfoM46.map((col) => col.name));
      if (!existingColumnsM46.has('vault_path')) {
        db.exec('ALTER TABLE resources ADD COLUMN vault_path TEXT');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_resources_vault_path ON resources(vault_path)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '46', ?)
        ON CONFLICT(key) DO UPDATE SET value = '46', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 46 complete - vault_path column added');
    } catch (error) {
      console.error('[DB] Migration 46 failed:', error);
      throw error;
    }
  }
}

function migration47(db, version) {
  if (version < 47) {
    console.log('[DB] Running migration 47 - notes vault source-of-truth (content_text/hash + FTS)');
    try {
      const tableInfoM47 = db.prepare('PRAGMA table_info(resources)').all();
      const existingColumnsM47 = new Set(tableInfoM47.map((col) => col.name));
      // Plain-text cache that feeds FTS/semantic indexing (notes), so search
      // indexes readable text instead of the Tiptap JSON. content_hash tracks
      // the .md file for the Phase 3 watcher (set when the mirror is written).
      if (!existingColumnsM47.has('content_text')) {
        db.exec('ALTER TABLE resources ADD COLUMN content_text TEXT');
      }
      if (!existingColumnsM47.has('content_hash')) {
        db.exec('ALTER TABLE resources ADD COLUMN content_hash TEXT');
      }

      // Backfill content_text for notes from their existing Tiptap JSON, using
      // a minimal (dependency-free) plain-text walk. Refined on next save.
      const stripTagsLite = (s) =>
        String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const extractNoteText = (raw) => {
        const trimmed = String(raw || '').trim();
        if (!trimmed.startsWith('{')) return stripTagsLite(trimmed);
        let doc;
        try {
          doc = JSON.parse(trimmed);
        } catch {
          return stripTagsLite(trimmed);
        }
        const blockTypes = new Set([
          'paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock',
          'bulletList', 'orderedList', 'table', 'tableRow', 'tableCell', 'tableHeader',
        ]);
        const parts = [];
        const walk = (node) => {
          if (!node || typeof node !== 'object') return;
          if (typeof node.text === 'string') parts.push(node.text);
          if (node.type === 'hardBreak') parts.push('\n');
          const ch = Array.isArray(node.content) ? node.content : null;
          if (ch) {
            for (const c of ch) walk(c);
            if (blockTypes.has(String(node.type))) parts.push('\n');
          }
        };
        walk(doc);
        return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
      };

      const notes = db
        .prepare("SELECT id, content FROM resources WHERE type = 'note' AND content IS NOT NULL AND trim(content) != ''")
        .all();
      const setText = db.prepare('UPDATE resources SET content_text = ? WHERE id = ?');
      const backfill = db.transaction((rows) => {
        for (const r of rows) {
          const text = extractNoteText(r.content);
          if (text) setText.run(text, r.id);
        }
      });
      backfill(notes);
      console.log(`[DB] Migration 47 - backfilled content_text for ${notes.length} notes`);

      // Repoint FTS triggers to index content_text when present (notes),
      // falling back to content (pdf/doc/url extracted text, artifacts, and
      // not-yet-migrated notes).
      db.exec('DROP TRIGGER IF EXISTS resources_ai');
      db.exec('DROP TRIGGER IF EXISTS resources_au');
      db.exec(`
        CREATE TRIGGER resources_ai AFTER INSERT ON resources BEGIN
          INSERT INTO resources_fts(resource_id, title, content)
          VALUES (new.id, new.title, COALESCE(NULLIF(new.content_text, ''), new.content, ''));
        END
      `);
      db.exec(`
        CREATE TRIGGER resources_au AFTER UPDATE ON resources BEGIN
          DELETE FROM resources_fts WHERE resource_id = old.id;
          INSERT INTO resources_fts(resource_id, title, content)
          VALUES (new.id, new.title, COALESCE(NULLIF(new.content_text, ''), new.content, ''));
        END
      `);

      // Rebuild resources_fts so existing rows use the new content source.
      db.exec('DELETE FROM resources_fts');
      db.exec(`
        INSERT INTO resources_fts(resource_id, title, content)
        SELECT id, title, COALESCE(NULLIF(content_text, ''), content, '') FROM resources
      `);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '47', ?)
        ON CONFLICT(key) DO UPDATE SET value = '47', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 47 complete - content_text/hash + FTS repointed');
    } catch (error) {
      console.error('[DB] Migration 47 failed:', error);
      throw error;
    }
  }
}

function migration48(db, version) {
  if (version < 48) {
    console.log('[DB] Running migration 48 - per-project vault root + project-relative vault_path');
    try {
      // Per-project vault root (absolute dir). NULL = default dome-files/vault/<project>.
      const projCols = new Set(db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name));
      if (!projCols.has('vault_root')) {
        db.exec('ALTER TABLE projects ADD COLUMN vault_root TEXT');
      }

      // vault_path becomes RELATIVE TO THE PROJECT ROOT (the project name used to
      // be the first segment; the default root is now dome-files/vault/<project>,
      // so the absolute location is unchanged — only the stored value changes).
      db.exec(`
        UPDATE resources
        SET vault_path = substr(vault_path, instr(vault_path, '/') + 1)
        WHERE type = 'note'
          AND vault_path IS NOT NULL
          AND instr(vault_path, '/') > 0
      `);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '48', ?)
        ON CONFLICT(key) DO UPDATE SET value = '48', updated_at = excluded.updated_at
      `).run(Date.now());

      console.log('[DB] Migration 48 complete - vault_root + project-relative vault_path');
    } catch (error) {
      console.error('[DB] Migration 48 failed:', error);
      throw error;
    }
  }
}

function migration49(db, version) {
  if (version < 49) {
    console.log('[DB] Running migration 49 - move binaries into the vault');
    try {
      const fsMod = require('fs');
      const pathMod = require('path');
      const vs = require('../../storage/vault-store.cjs');
      const userData = app ? app.getPath('userData') : null;

      if (userData) {
        const domeFiles = pathMod.join(userData, 'dome-files');
        const defaultVault = pathMod.join(domeFiles, 'vault');
        const projRoot = (projectId) => {
          const p = db.prepare('SELECT name, vault_root FROM projects WHERE id = ?').get(projectId);
          const custom = p && typeof p.vault_root === 'string' ? p.vault_root.trim() : '';
          if (custom) return custom;
          return pathMod.join(defaultVault, vs.sanitizeSegment((p && p.name) || 'Library', 'Library'));
        };
        const folderDir = (folderId) => {
          const segs = [];
          const seen = new Set();
          let fid = folderId;
          while (fid && !seen.has(fid)) {
            seen.add(fid);
            const f = db.prepare('SELECT title, folder_id, type FROM resources WHERE id = ?').get(fid);
            if (!f || f.type !== 'folder') break;
            segs.unshift(vs.sanitizeSegment(f.title, 'Folder'));
            fid = f.folder_id || null;
          }
          return segs.join('/');
        };

        const rows = db.prepare(
          "SELECT id, project_id, folder_id, type, title, internal_path, original_filename FROM resources WHERE internal_path IS NOT NULL AND trim(internal_path) != '' AND (vault_path IS NULL OR trim(vault_path) = '') AND type != 'note'",
        ).all();
        const setVaultPath = db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?');
        const ownerOf = db.prepare('SELECT id FROM resources WHERE project_id = ? AND vault_path = ?');
        let moved = 0;
        for (const r of rows) {
          try {
            const src = pathMod.join(domeFiles, r.internal_path);
            if (!fsMod.existsSync(src)) continue;
            const root = projRoot(r.project_id);
            const dir = folderDir(r.folder_id);
            const ext = pathMod.extname(r.internal_path) || '';
            let filename = vs.sanitizeFilename(r.original_filename || `${r.title || 'file'}${ext}`, 'file');
            if (!pathMod.extname(filename) && ext) filename += ext;
            let rel = dir ? `${dir}/${filename}` : filename;
            let abs = pathMod.join(root, rel);
            // Disambiguate against existing files / vault_path collisions.
            let n = 1;
            while (fsMod.existsSync(abs) || ownerOf.get(r.project_id, rel)) {
              const e = pathMod.extname(filename);
              const b = pathMod.basename(filename, e);
              rel = `${dir ? `${dir}/` : ''}${b} (${n})${e}`;
              abs = pathMod.join(root, rel);
              n++;
            }
            fsMod.mkdirSync(pathMod.dirname(abs), { recursive: true });
            // Copy (keep dome-files source as a rollback fallback; internal_path stays).
            fsMod.copyFileSync(src, abs);
            setVaultPath.run(rel, r.id);
            moved++;
          } catch (e) {
            console.warn('[DB] Migration 49 - move failed for', r.id, e.message);
          }
        }
        console.log(`[DB] Migration 49 - moved ${moved} binaries into the vault`);
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '49', ?)
        ON CONFLICT(key) DO UPDATE SET value = '49', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 49 complete - binaries in vault');
    } catch (error) {
      console.error('[DB] Migration 49 failed:', error);
      throw error;
    }
  }
}

// Migration 51: store release markdown body so the calendar event can render it
// without re-hitting the GitHub API. Older sync runs left body out entirely,
// which is why the release modal currently shows the tag URL as plain text.
function migration51(db, version) {
  if (version < 51) {
    console.log('[DB] Running migration 51 - github_releases.body');
    try {
      const cols = db.prepare('PRAGMA table_info(github_releases)').all();
      if (!cols.some((c) => c.name === 'body')) {
        db.exec('ALTER TABLE github_releases ADD COLUMN body TEXT');
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '51', ?)
        ON CONFLICT(key) DO UPDATE SET value = '51', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 51 complete - github_releases.body added');
    } catch (error) {
      console.error('[DB] Migration 51 failed:', error);
      throw error;
    }
  }
}

// Migration 50: snap GitHub all-day events to local midnight.
// Earlier versions of the GitHub→calendar bridge stored `start_at` and
// `end_at` from the raw GitHub timestamps (e.g. `published_at: 18:30 UTC`),
// so the all-day event was painted as a 24-hour bar that started mid-day and
// the month-view renderer (which collapses only `end == startOfNextDay` back
// to a single cell) ended up showing the same release across two days. Fixing
// the bridge alone is not enough for events already in the database — this
// migration retroactively snaps every `source = 'github'`, `all_day = 1`
// event to local midnight and resets `end_at = start_at + 24h`.
function migration50(db, version) {
  if (version < 50) {
    console.log('[DB] Running migration 50 - snap GitHub all-day events to midnight');
    try {
      const updateOne = db.prepare(
        'UPDATE calendar_events SET start_at = ?, end_at = ? WHERE id = ?',
      );
      const rows = db.prepare(
        "SELECT id, start_at, end_at FROM calendar_events WHERE all_day = 1 AND (metadata LIKE '%\"source\":\"github\"%' OR metadata LIKE '%\"source\": \"github\"%')",
      ).all();
      let fixed = 0;
      const tx = db.transaction((items) => {
        for (const r of items) {
          const start = new Date(r.start_at);
          // Skip if already at local midnight (idempotent guard).
          if (start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0 && start.getMilliseconds() === 0) continue;
          start.setHours(0, 0, 0, 0);
          const newStart = start.getTime();
          const newEnd = newStart + 24 * 60 * 60 * 1000;
          updateOne.run(newStart, newEnd, r.id);
          fixed += 1;
        }
      });
      tx(rows);
      console.log(`[DB] Migration 50 - snapped ${fixed} GitHub all-day events to midnight`);

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '50', ?)
        ON CONFLICT(key) DO UPDATE SET value = '50', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 50 complete - GitHub all-day events snapped');
    } catch (error) {
      console.error('[DB] Migration 50 failed:', error);
      throw error;
    }
  }
}

// Migration 52: Pipelines — unified Kanban model on top of the existing run
// engine. Adds four tables (pipelines, pipeline_stages, pipeline_items,
// pipeline_sources). Purely additive: no DROP/ALTER on existing tables, so it
// is reversible by restoring the pre-migration backup. Items reference the
// existing automation_runs / calendar_events / many_agents / canvas_workflows
// rows rather than duplicating them.
function migration52(db, version) {
  if (version < 52) {
    console.log('[DB] Running migration 52 - pipelines');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pipelines (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL DEFAULT 'default',
          name TEXT NOT NULL,
          description TEXT,
          icon_index INTEGER NOT NULL DEFAULT 0,
          color TEXT,
          folder_id TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipelines_project ON pipelines(project_id, updated_at)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS pipeline_stages (
          id TEXT PRIMARY KEY,
          pipeline_id TEXT NOT NULL,
          project_id TEXT NOT NULL DEFAULT 'default',
          title TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          execution_policy TEXT NOT NULL DEFAULT 'manual_resolve'
            CHECK(execution_policy IN ('auto_agent', 'manual_agent', 'manual_resolve')),
          assigned_agent_id TEXT,
          assigned_workflow_id TEXT,
          run_input_template TEXT,
          provider TEXT,
          model TEXT,
          is_terminal INTEGER NOT NULL DEFAULT 0,
          wip_limit INTEGER,
          config_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
          FOREIGN KEY (assigned_agent_id) REFERENCES many_agents(id) ON DELETE SET NULL,
          FOREIGN KEY (assigned_workflow_id) REFERENCES canvas_workflows(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id, position)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS pipeline_sources (
          id TEXT PRIMARY KEY,
          pipeline_id TEXT NOT NULL,
          project_id TEXT NOT NULL DEFAULT 'default',
          name TEXT NOT NULL,
          source_type TEXT NOT NULL
            CHECK(source_type IN ('internal_resources', 'excel', 'manual', 'external_db', 'prompt_mcp')),
          config_json TEXT,
          target_stage_id TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          last_sync_at INTEGER,
          last_sync_status TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
          FOREIGN KEY (target_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_sources_pipeline ON pipeline_sources(pipeline_id)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS pipeline_items (
          id TEXT PRIMARY KEY,
          pipeline_id TEXT NOT NULL,
          project_id TEXT NOT NULL DEFAULT 'default',
          stage_id TEXT NOT NULL,
          source_id TEXT,
          title TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          data_json TEXT,
          exec_status TEXT NOT NULL DEFAULT 'pending'
            CHECK(exec_status IN ('pending', 'running', 'ready', 'failed', 'blocked')),
          assigned_kind TEXT NOT NULL DEFAULT 'unassigned'
            CHECK(assigned_kind IN ('unassigned', 'agent', 'manual', 'auto')),
          assigned_agent_id TEXT,
          current_run_id TEXT,
          last_output TEXT,
          start_at INTEGER,
          end_at INTEGER,
          calendar_event_id TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
          FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE CASCADE,
          FOREIGN KEY (source_id) REFERENCES pipeline_sources(id) ON DELETE SET NULL,
          FOREIGN KEY (assigned_agent_id) REFERENCES many_agents(id) ON DELETE SET NULL,
          FOREIGN KEY (current_run_id) REFERENCES automation_runs(id) ON DELETE SET NULL,
          FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_items_stage ON pipeline_items(stage_id, position)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_items_pipeline ON pipeline_items(pipeline_id, updated_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_items_run ON pipeline_items(current_run_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_items_range ON pipeline_items(start_at, end_at)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '52', ?)
        ON CONFLICT(key) DO UPDATE SET value = '52', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 52 complete - pipelines tables created');
    } catch (error) {
      console.error('[DB] Migration 52 failed:', error);
      throw error;
    }
  }
}

function migration53(db, version) {
  if (version < 53) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pipeline_item_events (
          id TEXT PRIMARY KEY,
          item_id TEXT NOT NULL,
          project_id TEXT NOT NULL DEFAULT 'default',
          event_type TEXT NOT NULL,
          actor TEXT,
          summary TEXT,
          detail_json TEXT,
          run_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (item_id) REFERENCES pipeline_items(id) ON DELETE CASCADE,
          FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_pipeline_item_events_item ON pipeline_item_events(item_id, created_at)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '53', ?)
        ON CONFLICT(key) DO UPDATE SET value = '53', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 53 complete - pipeline_item_events table created');
    } catch (error) {
      console.error('[DB] Migration 53 failed:', error);
      throw error;
    }
  }
}

function migration54(db, version) {
  if (version < 54) {
    console.log('[DB] Running migration 54 - email account action permissions');
    try {
      const tableInfo = db.prepare('PRAGMA table_info(email_accounts)').all();
      const cols = new Set(tableInfo.map((c) => c.name));
      const defaultUser = '{"list":true,"read":true,"search":true,"send":true,"reply":true}';
      const defaultAgent = '{"list":true,"read":true,"search":true,"send":false,"reply":false}';
      if (!cols.has('user_actions')) {
        db.exec(`ALTER TABLE email_accounts ADD COLUMN user_actions TEXT NOT NULL DEFAULT '${defaultUser}'`);
      }
      if (!cols.has('agent_actions')) {
        db.exec(`ALTER TABLE email_accounts ADD COLUMN agent_actions TEXT NOT NULL DEFAULT '${defaultAgent}'`);
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '54', ?)
        ON CONFLICT(key) DO UPDATE SET value = '54', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 54 complete - email account permissions columns');
    } catch (error) {
      console.error('[DB] Migration 54 failed:', error);
      throw error;
    }
  }
}

function migration55(db, version) {
  if (version < 55) {
    console.log('[DB] Running migration 55 - folder vault_path backfill (vault = source of truth)');
    try {
      const userData = app ? app.getPath('userData') : null;
      if (userData) {
        const vs = require('../../storage/vault-store.cjs');
        const folders = db
          .prepare("SELECT id, project_id, folder_id, title FROM resources WHERE type = 'folder' AND (vault_path IS NULL OR trim(vault_path) = '') ORDER BY created_at ASC")
          .all();
        const fsMod = require('fs');
        const pathMod = require('path');
        const defaultVault = pathMod.join(userData, 'dome-files', 'vault');
        const projRoot = (projectId) => {
          const p = db.prepare('SELECT name, vault_root FROM projects WHERE id = ?').get(projectId);
          const custom = p && typeof p.vault_root === 'string' ? p.vault_root.trim() : '';
          if (custom) return custom;
          return pathMod.join(defaultVault, vs.sanitizeSegment((p && p.name) || 'Library', 'Library'));
        };
        const folderDirFromTitles = (folderId) => {
          const segs = [];
          const seen = new Set();
          let fid = folderId;
          while (fid && !seen.has(fid)) {
            seen.add(fid);
            const f = db.prepare('SELECT title, folder_id, type FROM resources WHERE id = ?').get(fid);
            if (!f || f.type !== 'folder') break;
            segs.unshift(vs.sanitizeSegment(f.title, 'Folder'));
            fid = f.folder_id || null;
          }
          return segs.join('/');
        };
        const setVaultPath = db.prepare('UPDATE resources SET vault_path = ? WHERE id = ?');
        let updated = 0;
        for (const f of folders) {
          try {
            const dir = folderDirFromTitles(f.folder_id);
            const seg = vs.sanitizeSegment(f.title, 'Folder');
            let rel = dir ? `${dir}/${seg}` : seg;
            const owner = db.prepare("SELECT id FROM resources WHERE project_id = ? AND vault_path = ? AND type = 'folder' AND id != ?").get(f.project_id, rel, f.id);
            if (owner) {
              const shortId = String(f.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'dup';
              rel = dir ? `${dir}/${seg} (${shortId})` : `${seg} (${shortId})`;
            }
            const abs = pathMod.join(projRoot(f.project_id), rel);
            if (!fsMod.existsSync(abs)) fsMod.mkdirSync(abs, { recursive: true });
            setVaultPath.run(rel, f.id);
            updated += 1;
          } catch (e) {
            console.warn('[DB] Migration 55 folder backfill skip:', f.id, e.message);
          }
        }
        console.log(`[DB] Migration 55 backfilled ${updated} folder vault_path(s)`);
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '55', ?)
        ON CONFLICT(key) DO UPDATE SET value = '55', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 55 complete - folder vault_path backfill');
    } catch (error) {
      console.error('[DB] Migration 55 failed:', error);
      throw error;
    }
  }
}

function migration56(db, version) {
  if (version < 56) {
    console.log('[DB] Running migration 56 - scope calendar/email accounts to vault (project_id)');
    try {
      const calCols = new Set(db.prepare('PRAGMA table_info(calendar_accounts)').all().map((c) => c.name));
      if (!calCols.has('project_id')) {
        db.exec("ALTER TABLE calendar_accounts ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'");
        db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_accounts_project ON calendar_accounts(project_id)');
      }
      const emailCols = new Set(db.prepare('PRAGMA table_info(email_accounts)').all().map((c) => c.name));
      if (!emailCols.has('project_id')) {
        db.exec("ALTER TABLE email_accounts ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'");
        db.exec('CREATE INDEX IF NOT EXISTS idx_email_accounts_project ON email_accounts(project_id)');
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '56', ?)
        ON CONFLICT(key) DO UPDATE SET value = '56', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 56 complete - calendar/email project_id columns');
    } catch (error) {
      console.error('[DB] Migration 56 failed:', error);
      throw error;
    }
  }
}

function migration57(db, version) {
  if (version < 57) {
    console.log('[DB] Running migration 57 - scope GitHub repos to vault (project_id)');
    try {
      const ghRepoCols = new Set(db.prepare('PRAGMA table_info(github_repos)').all().map((c) => c.name));
      if (!ghRepoCols.has('project_id')) {
        db.exec("ALTER TABLE github_repos ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'");
      }

      const projectSlug = (projectId) =>
        crypto.createHash('sha1').update(String(projectId)).digest('hex').slice(0, 12);
      const newRepoId = (remoteId, projectId) => `ghr-${remoteId}-${projectSlug(projectId)}`;
      const linkId = (entityType, entityId) =>
        `ghcl-${entityType}-${crypto.createHash('sha1').update(String(entityId)).digest('hex').slice(0, 12)}`;

      const rewireCalendarLink = (entityType, oldEid, newEid) => {
        const link = db
          .prepare('SELECT 1 FROM github_calendar_links WHERE entity_type = ? AND entity_id = ?')
          .get(entityType, oldEid);
        if (!link) return;
        db.prepare(
          'UPDATE github_calendar_links SET id = ?, entity_id = ? WHERE entity_type = ? AND entity_id = ?',
        ).run(linkId(entityType, newEid), newEid, entityType, oldEid);
      };

      const rewireMilestones = (oldId, newId) => {
        const rows = db.prepare('SELECT id, number FROM github_milestones WHERE repo_id = ?').all(oldId);
        for (const m of rows) {
          const newMid = `ghm-${newId}-${m.number}`;
          rewireCalendarLink('milestone', m.id, newMid);
          rewireCalendarLink('milestone', `${m.id}:completed`, `${newMid}:completed`);
          db.prepare('UPDATE github_milestones SET id = ?, repo_id = ? WHERE id = ?').run(newMid, newId, m.id);
        }
      };

      const rewireIssues = (oldId, newId) => {
        const rows = db.prepare('SELECT id, number FROM github_issues WHERE repo_id = ?').all(oldId);
        for (const issue of rows) {
          const newIid = `ghi-${newId}-${issue.number}`;
          rewireCalendarLink('issue', issue.id, newIid);
          db.prepare('UPDATE github_issues SET id = ?, repo_id = ? WHERE id = ?').run(newIid, newId, issue.id);
        }
      };

      const rewireBranches = (oldId, newId) => {
        const rows = db.prepare('SELECT id, name FROM github_branches WHERE repo_id = ?').all(oldId);
        for (const branch of rows) {
          const newBid = `ghb-${newId}-${projectSlug(branch.name)}`;
          db.prepare('UPDATE github_branches SET id = ?, repo_id = ? WHERE id = ?').run(newBid, newId, branch.id);
        }
      };

      const rewireReleases = (oldId, newId) => {
        const rows = db.prepare('SELECT id, remote_id FROM github_releases WHERE repo_id = ?').all(oldId);
        for (const rel of rows) {
          const newRid = `ghrel-${newId}-${rel.remote_id}`;
          rewireCalendarLink('release', rel.id, newRid);
          db.prepare('UPDATE github_releases SET id = ?, repo_id = ? WHERE id = ?').run(newRid, newId, rel.id);
        }
      };

      const rewireSyncState = (oldId, newId) => {
        const rows = db.prepare('SELECT id, resource FROM github_sync_state WHERE repo_id = ?').all(oldId);
        for (const st of rows) {
          const newSid = `ghs-${newId}-${st.resource}`;
          db.prepare('UPDATE github_sync_state SET id = ?, repo_id = ? WHERE id = ?').run(newSid, newId, st.id);
        }
      };

      const rewireRepo = (repo) => {
        const projectId = repo.project_id || 'default';
        const newId = newRepoId(repo.remote_id, projectId);
        if (repo.id === newId) return;
        const oldId = repo.id;

        // Parent id first; child rows still reference oldId until updated below.
        db.prepare('UPDATE github_repos SET id = ? WHERE id = ?').run(newId, oldId);
        rewireMilestones(oldId, newId);
        rewireIssues(oldId, newId);
        rewireBranches(oldId, newId);
        rewireReleases(oldId, newId);
        rewireSyncState(oldId, newId);
      };

      const rewireGithubRepoIds = () => {
        const repos = db.prepare('SELECT * FROM github_repos').all();
        if (repos.length === 0) return;

        const needsRewire = repos.some((repo) => {
          const projectId = repo.project_id || 'default';
          return repo.id !== newRepoId(repo.remote_id, projectId);
        });
        if (!needsRewire) {
          console.log('[DB] Migration 57 - GitHub repo ids already vault-scoped, skipping rewire');
          return;
        }

        // PRAGMA foreign_keys must run outside a transaction (no-op inside tx).
        db.pragma('foreign_keys = OFF');
        try {
          for (const repo of repos) {
            rewireRepo(repo);
          }
        } finally {
          db.pragma('foreign_keys = ON');
        }
      };

      rewireGithubRepoIds();

      // Rebuild github_repos so UNIQUE(full_name, project_id) replaces UNIQUE(full_name).
      const repoSchema =
        db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'github_repos'").get()?.sql || '';
      const hasCompositeUnique = repoSchema.includes('UNIQUE(full_name, project_id)');
      if (!hasCompositeUnique) {
        db.pragma('foreign_keys = OFF');
        try {
          db.exec(`
            CREATE TABLE github_repos_v57 (
              id TEXT PRIMARY KEY,
              remote_id INTEGER NOT NULL,
              owner TEXT NOT NULL,
              name TEXT NOT NULL,
              full_name TEXT NOT NULL,
              private INTEGER DEFAULT 0,
              html_url TEXT,
              selected INTEGER DEFAULT 0,
              last_sync_at INTEGER,
              project_id TEXT NOT NULL DEFAULT 'default',
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              UNIQUE(full_name, project_id)
            )
          `);
          db.exec(`
            INSERT INTO github_repos_v57
              (id, remote_id, owner, name, full_name, private, html_url, selected, last_sync_at, project_id, created_at, updated_at)
            SELECT id, remote_id, owner, name, full_name, private, html_url, selected, last_sync_at, project_id, created_at, updated_at
            FROM github_repos
          `);
          db.exec('DROP TABLE github_repos');
          db.exec('ALTER TABLE github_repos_v57 RENAME TO github_repos');
        } finally {
          db.pragma('foreign_keys = ON');
        }
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_repos_selected ON github_repos(selected)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_repos_project ON github_repos(project_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_github_repos_project_selected ON github_repos(project_id, selected)');

      // Legacy global GitHub calendar → default vault calendar.
      const legacyCal = db.prepare('SELECT id FROM calendar_calendars WHERE id = ?').get('github-dome');
      if (legacyCal) {
        db.pragma('foreign_keys = OFF');
        try {
          const targetExists = db.prepare("SELECT id FROM calendar_calendars WHERE id = 'github-default'").get();
          if (targetExists) {
            db.prepare("UPDATE calendar_events SET calendar_id = 'github-default' WHERE calendar_id = 'github-dome'").run();
            db.prepare('DELETE FROM calendar_calendars WHERE id = ?').run('github-dome');
          } else {
            // github-dome already uses (account_id='local', remote_id='github') — rename, don't INSERT duplicate.
            db.prepare("UPDATE calendar_calendars SET id = 'github-default' WHERE id = 'github-dome'").run();
            db.prepare("UPDATE calendar_events SET calendar_id = 'github-default' WHERE calendar_id = 'github-dome'").run();
          }
        } finally {
          db.pragma('foreign_keys = ON');
        }
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '57', ?)
        ON CONFLICT(key) DO UPDATE SET value = '57', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 57 complete - GitHub repos project_id + multi-vault ids');
    } catch (error) {
      console.error('[DB] Migration 57 failed:', error);
      throw error;
    }
  }
}

function migration58(db, version) {
  if (version < 58) {
    console.log('[DB] Running migration 58 - artifact vault HTML mirror backfill');
    try {
      const userData = app ? app.getPath('userData') : null;
      if (userData) {
        const fileStorage = require('../../storage/file-storage.cjs');
        const databaseMod = require('../../core/database.cjs');
        const vs = require('../../storage/vault-store.cjs');
        const updated = vs.backfillArtifactVaultMirrors({ database: databaseMod, fileStorage });
        console.log(`[DB] Migration 58 backfilled ${updated} artifact vault mirror(s)`);
      }
      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '58', ?)
        ON CONFLICT(key) DO UPDATE SET value = '58', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 58 complete - artifact vault mirror backfill');
    } catch (error) {
      console.error('[DB] Migration 58 failed:', error);
      throw error;
    }
  }
}

function migration59(db, version) {
  if (version < 59) {
    console.log('[DB] Running migration 59 - social hub (accounts, posts, metrics)');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS social_accounts (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL CHECK(provider IN ('linkedin', 'instagram', 'x')),
          display_name TEXT,
          handle TEXT,
          external_id TEXT,
          credentials BLOB,
          scopes TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'error', 'expired')),
          last_error TEXT,
          connected_at INTEGER,
          last_sync_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_accounts_provider ON social_accounts(provider)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS social_posts (
          id TEXT PRIMARY KEY,
          account_id TEXT,
          provider TEXT NOT NULL CHECK(provider IN ('linkedin', 'instagram', 'x')),
          status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
          body TEXT NOT NULL DEFAULT '',
          media TEXT NOT NULL DEFAULT '[]',
          link_url TEXT,
          topics TEXT NOT NULL DEFAULT '[]',
          campaign TEXT,
          scheduled_at INTEGER,
          published_at INTEGER,
          external_post_id TEXT,
          external_url TEXT,
          error TEXT,
          created_by TEXT NOT NULL DEFAULT 'user',
          group_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE SET NULL
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status, scheduled_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_posts_provider ON social_posts(provider, published_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_posts_group ON social_posts(group_id)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS social_metrics (
          id TEXT PRIMARY KEY,
          post_id TEXT NOT NULL,
          captured_at INTEGER NOT NULL,
          impressions INTEGER,
          likes INTEGER,
          comments INTEGER,
          shares INTEGER,
          saves INTEGER,
          clicks INTEGER,
          followers INTEGER,
          raw TEXT,
          FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_metrics_post ON social_metrics(post_id, captured_at)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '59', ?)
        ON CONFLICT(key) DO UPDATE SET value = '59', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 59 complete - social hub tables');
    } catch (error) {
      console.error('[DB] Migration 59 failed:', error);
      throw error;
    }
  }
}

function migration60(db, version) {
  if (version < 60) {
    console.log('[DB] Running migration 60 - social account metrics + AI reports');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS social_account_metrics (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          captured_at INTEGER NOT NULL,
          followers INTEGER,
          following INTEGER,
          posts_count INTEGER,
          raw TEXT,
          FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_account_metrics ON social_account_metrics(account_id, captured_at)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS social_reports (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'generating' CHECK(status IN ('generating', 'ready', 'failed')),
          trigger TEXT NOT NULL DEFAULT 'user' CHECK(trigger IN ('user', 'auto')),
          period_days INTEGER NOT NULL DEFAULT 30,
          title TEXT,
          content TEXT,
          model TEXT,
          error TEXT,
          data TEXT,
          created_at INTEGER NOT NULL,
          completed_at INTEGER
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_social_reports_created ON social_reports(created_at)');

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '60', ?)
        ON CONFLICT(key) DO UPDATE SET value = '60', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 60 complete - social account metrics + reports');
    } catch (error) {
      console.error('[DB] Migration 60 failed:', error);
      throw error;
    }
  }
}

function migration61(db, version) {
  if (version < 61) {
    console.log('[DB] Running migration 61 - social account kind (member vs organization pages)');
    try {
      const cols = db.prepare("PRAGMA table_info('social_accounts')").all().map((c) => c.name);
      if (!cols.includes('account_kind')) {
        db.exec("ALTER TABLE social_accounts ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'member'");
      }

      db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('schema_version', '61', ?)
        ON CONFLICT(key) DO UPDATE SET value = '61', updated_at = excluded.updated_at
      `).run(Date.now());
      console.log('[DB] Migration 61 complete - social account kind');
    } catch (error) {
      console.error('[DB] Migration 61 failed:', error);
      throw error;
    }
  }
}

// Ordered migration steps. Order is execution order — do not sort by number
// (51 intentionally runs before 50, matching the original frozen history).
// Add a new migration by appending a `migrationN` function above and
// registering it at the end of this list.
const MIGRATION_STEPS = [
  migration1,
  migration2,
  migration3,
  migration4,
  migration5,
  migration6,
  migration7,
  migration8,
  migration9,
  migration10,
  migration11,
  migration12,
  migration14,
  migration15,
  migration16,
  migration17,
  migration18,
  migration19,
  migration20,
  migration21,
  migration22,
  migration23,
  migration24,
  migration25,
  migration26,
  migration27,
  migration29,
  migration30,
  migration31,
  migration32,
  migration33,
  migration34,
  migration35,
  migration36,
  migration37,
  migration38,
  migration39,
  migration40,
  migration41,
  migration42,
  migration43,
  migration44,
  migration45,
  migration46,
  migration47,
  migration48,
  migration49,
  migration51,
  migration50,
  migration52,
  migration53,
  migration54,
  migration55,
  migration56,
  migration57,
  migration58,
  migration59,
  migration60,
  migration61,
];

function applyMigrations(db, version, invalidateQueries = () => {}) {
  for (const step of MIGRATION_STEPS) {
    step(db, version, invalidateQueries);
  }
}

module.exports = { applyMigrations };
