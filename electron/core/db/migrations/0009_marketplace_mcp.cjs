/**
 * 0009_marketplace_mcp — marketplace_agent_installs, marketplace_workflow_installs,
 * marketplace_template_mappings, mcp_servers, mcp_global_settings
 */
module.exports = {
  id: '0009_marketplace_mcp',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE marketplace_agent_installs (
        marketplace_id TEXT PRIMARY KEY,
        local_agent_id TEXT NOT NULL,
        version TEXT,
        author TEXT,
        source TEXT,
        installed_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        capabilities_json TEXT NOT NULL DEFAULT '[]',
        resource_affinity_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE marketplace_workflow_installs (
        template_id TEXT PRIMARY KEY,
        local_workflow_id TEXT NOT NULL,
        version TEXT,
        author TEXT,
        source TEXT,
        installed_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        capabilities_json TEXT NOT NULL DEFAULT '[]',
        resource_affinity_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE marketplace_template_mappings (
        template_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('stdio', 'http', 'sse')),
        command TEXT,
        args_json TEXT,
        url TEXT,
        headers_json TEXT,
        env_json TEXT,
        enabled BIGINT NOT NULL DEFAULT 1,
        tools_json TEXT,
        enabled_tool_ids_json TEXT,
        last_discovery_at BIGINT,
        last_discovery_error TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_mcp_servers_name ON mcp_servers(name);

      CREATE TABLE mcp_global_settings (
        id BIGINT PRIMARY KEY CHECK(id = 1),
        enabled BIGINT NOT NULL DEFAULT 1,
        updated_at BIGINT NOT NULL
      );
    `);
  },
};
