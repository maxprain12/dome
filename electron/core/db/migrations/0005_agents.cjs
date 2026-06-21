/**
 * 0005_agents — many_agents, many_agent_versions, agent_folders, agent_store, ai_skills
 */
module.exports = {
  id: '0005_agents',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE agent_folders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        parent_id TEXT,
        name TEXT NOT NULL,
        sort_order BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_agent_folders_parent ON agent_folders(parent_id);
      CREATE INDEX idx_agent_folders_project_id ON agent_folders(project_id);

      CREATE TABLE many_agents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT,
        system_instructions TEXT,
        tool_ids TEXT NOT NULL DEFAULT '[]',
        mcp_server_ids TEXT NOT NULL DEFAULT '[]',
        skill_ids TEXT NOT NULL DEFAULT '[]',
        icon_index BIGINT NOT NULL DEFAULT 1,
        marketplace_id TEXT,
        folder_id TEXT,
        favorite BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_many_agents_folder_id ON many_agents(folder_id);
      CREATE INDEX idx_many_agents_marketplace_id ON many_agents(marketplace_id);
      CREATE INDEX idx_many_agents_project_id ON many_agents(project_id);

      CREATE TABLE many_agent_versions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        version_number BIGINT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        system_instructions TEXT,
        tool_ids TEXT NOT NULL DEFAULT '[]',
        mcp_server_ids TEXT NOT NULL DEFAULT '[]',
        skill_ids TEXT NOT NULL DEFAULT '[]',
        icon_index BIGINT NOT NULL DEFAULT 1,
        change_note TEXT,
        created_at BIGINT NOT NULL
      );

      CREATE INDEX idx_many_agent_versions_agent_id ON many_agent_versions (agent_id);
      CREATE UNIQUE INDEX idx_many_agent_versions_agent_version
        ON many_agent_versions (agent_id, version_number);

      CREATE TABLE agent_store (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (namespace, key)
      );

      CREATE INDEX idx_agent_store_namespace ON agent_store (namespace);

      CREATE TABLE ai_skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        prompt TEXT NOT NULL,
        enabled BIGINT NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_ai_skills_enabled ON ai_skills(enabled);
    `);
  },
};
