/**
 * 0003_resources — resources, sources, tags, citations, resource_tags,
 * resource_images, resource_transcripts, resource_chunks, resource_interactions
 *
 * NOTE: `citations`, `resource_images`, and `resource_transcripts` were named in
 * the migration grouping. `citations` and `resource_images` are NOT present in
 * the HEAD schema dump (no `-- [table]` entry) so they are not created.
 * `resource_transcripts` IS present and is created here.
 */
module.exports = {
  id: '0003_resources',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE resources (
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
        file_size BIGINT,
        file_hash TEXT,
        thumbnail_data TEXT,
        original_filename TEXT,
        folder_id TEXT,
        metadata TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        vault_path TEXT,
        content_text TEXT,
        content_hash TEXT
      );

      CREATE INDEX idx_resources_file_hash ON resources(file_hash);
      CREATE INDEX idx_resources_folder ON resources(folder_id);
      CREATE INDEX idx_resources_internal_path ON resources(internal_path);
      CREATE INDEX idx_resources_project ON resources(project_id);
      CREATE INDEX idx_resources_type ON resources(type);
      CREATE INDEX idx_resources_vault_path ON resources(vault_path);

      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        resource_id TEXT,
        type TEXT NOT NULL DEFAULT 'article',
        title TEXT NOT NULL,
        authors TEXT,
        year BIGINT,
        doi TEXT,
        url TEXT,
        publisher TEXT,
        journal TEXT,
        volume TEXT,
        issue TEXT,
        pages TEXT,
        isbn TEXT,
        metadata TEXT,
        created_at BIGINT NOT NULL DEFAULT CAST(epoch(now()) AS BIGINT),
        updated_at BIGINT NOT NULL DEFAULT CAST(epoch(now()) AS BIGINT)
      );

      CREATE INDEX idx_sources_resource ON sources(resource_id);

      CREATE TABLE tags (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        color TEXT,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE resource_tags (
        resource_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (resource_id, tag_id)
      );

      CREATE TABLE resource_transcripts (
        resource_id TEXT NOT NULL,
        page_number BIGINT NOT NULL,
        markdown TEXT NOT NULL,
        model_used TEXT,
        file_hash TEXT,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (resource_id, page_number)
      );

      CREATE INDEX idx_resource_transcripts_resource ON resource_transcripts(resource_id);
      CREATE INDEX idx_resource_transcripts_resource_hash ON resource_transcripts(resource_id, file_hash);

      CREATE TABLE resource_chunks (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        chunk_index BIGINT NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        model_version TEXT NOT NULL,
        char_start BIGINT,
        char_end BIGINT,
        page_number BIGINT,
        updated_at BIGINT NOT NULL,
        UNIQUE(resource_id, chunk_index)
      );

      CREATE INDEX idx_resource_chunks_model ON resource_chunks(model_version);
      CREATE INDEX idx_resource_chunks_resource ON resource_chunks(resource_id);

      CREATE TABLE resource_interactions (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('note', 'annotation', 'chat')),
        content TEXT NOT NULL,
        position_data TEXT,
        metadata TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_interactions_resource ON resource_interactions(resource_id);
      CREATE INDEX idx_interactions_type ON resource_interactions(type);
    `);
  },
};
