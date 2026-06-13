/* eslint-disable no-console */
/**
 * Base SQLite schema DDL (05/T03 fase c — extracted from database.cjs).
 *
 * `createBaseSchema(db)` runs the PRAGMAs and creates every base table,
 * index, FTS virtual table and trigger with `IF NOT EXISTS` (idempotent).
 * Migrations (db/migrations.cjs) then bring an existing DB up to the latest
 * version; a fresh install gets this schema + schema_version at HEAD.
 *
 * When you change a table here, also add a migration in db/migrations.cjs so
 * existing installs converge — this file only helps brand-new databases.
 */

function createBaseSchema(db) {
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
}

module.exports = { createBaseSchema };
