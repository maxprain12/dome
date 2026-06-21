/* eslint-disable no-console */
/**
 * Prepared statements (05/T03 — extracted from database.cjs).
 *
 * `buildQueries(db)` returns the full statement map; `database.cjs` caches it
 * (`getQueries()`) and invalidates it after FTS repairs. Add new statements
 * here, grouped by domain — never prepare ad-hoc statements in handlers.
 *
 * DuckDB migration (Fase 4a): statements are built via the async `stmt(db, sql)`
 * wrapper from `./duckdb.cjs` (same `.get/.all/.run` ergonomics, but async).
 */

const { stmt } = require('./duckdb.cjs');

function buildQueries(db) {
  return {
    // Projects
    createProject: stmt(db, `
      INSERT INTO projects (id, name, description, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getProjects: stmt(db, 'SELECT * FROM projects ORDER BY created_at DESC'),
    getProjectById: stmt(db, 'SELECT * FROM projects WHERE id = ?'),

    // Resources
    createResource: stmt(db, `
      INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getResourcesByProject: stmt(db, 'SELECT * FROM resources WHERE project_id = ? ORDER BY updated_at DESC'),
    getResourceById: stmt(db, 'SELECT * FROM resources WHERE id = ?'),
    getResourceByIdForIndexing: stmt(db, `
      SELECT id, project_id, type, title, content, metadata FROM resources WHERE id = ?
    `),
    updateResource: stmt(db, `
      UPDATE resources
      SET title = ?, content = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `),

    // Resources with internal file storage
    createResourceWithFile: stmt(db, `
      INSERT INTO resources (
        id, project_id, type, title, content, file_path,
        internal_path, file_mime_type, file_size, file_hash,
        thumbnail_data, original_filename, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateResourceFile: stmt(db, `
      UPDATE resources
      SET internal_path = ?, file_mime_type = ?, file_size = ?,
          file_hash = ?, thumbnail_data = ?, original_filename = ?, updated_at = ?
      WHERE id = ?
    `),
    updateResourceThumbnail: stmt(db, `
      UPDATE resources
      SET thumbnail_data = ?, updated_at = ?
      WHERE id = ?
    `),
    findByHash: stmt(db, `
      SELECT id, title, project_id, type, internal_path FROM resources WHERE file_hash = ?
    `),
    getAllInternalPaths: stmt(db, `
      SELECT internal_path FROM resources WHERE internal_path IS NOT NULL
    `),
    getResourcesWithLegacyPath: stmt(db, `
      SELECT * FROM resources
      WHERE file_path IS NOT NULL AND internal_path IS NULL
      ORDER BY created_at ASC
    `),
    deleteResource: stmt(db, 'DELETE FROM resources WHERE id = ?'),

    // Folder containment queries
    getResourcesByFolder: stmt(db, 'SELECT * FROM resources WHERE folder_id = ? ORDER BY updated_at DESC'),
    getRootResources: stmt(db, 'SELECT * FROM resources WHERE project_id = ? AND folder_id IS NULL ORDER BY updated_at DESC'),
    moveResourceToFolder: stmt(db, 'UPDATE resources SET folder_id = ?, updated_at = ? WHERE id = ?'),
    moveResourceToProject: stmt(db, 
      'UPDATE resources SET project_id = ?, folder_id = ?, updated_at = ? WHERE id = ?',
    ),
    removeResourceFromFolder: stmt(db, 'UPDATE resources SET folder_id = NULL, updated_at = ? WHERE id = ?'),

    // Sources
    createSource: stmt(db, `
      INSERT INTO sources (id, resource_id, type, title, authors, year, doi, url, publisher, journal, volume, issue, pages, isbn, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSources: stmt(db, 'SELECT * FROM sources ORDER BY year DESC, title ASC'),
    getSourceById: stmt(db, 'SELECT * FROM sources WHERE id = ?'),

    // Full-text search (standalone FTS tables)
    searchResources: stmt(db, `
      SELECT * FROM (
        SELECT r.*, fts_main_resources.match_bm25(r.id, ?) AS _score
        FROM resources r
      ) WHERE _score IS NOT NULL
      ORDER BY _score DESC
    `),

    // Settings
    getSetting: stmt(db, 'SELECT value FROM settings WHERE key = ?'),
    setSetting: stmt(db, `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `),

    // Many agents
    listManyAgents: stmt(db, 
      'SELECT * FROM many_agents WHERE project_id = ? ORDER BY favorite DESC, updated_at DESC',
    ),
    getManyAgentById: stmt(db, 'SELECT * FROM many_agents WHERE id = ?'),
    createManyAgent: stmt(db, `
      INSERT INTO many_agents (
        id, project_id, name, description, system_instructions, tool_ids, mcp_server_ids,
        skill_ids, icon_index, marketplace_id, folder_id, favorite, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateManyAgent: stmt(db, `
      UPDATE many_agents
      SET project_id = ?, name = ?, description = ?, system_instructions = ?, tool_ids = ?, mcp_server_ids = ?,
          skill_ids = ?, icon_index = ?, marketplace_id = ?, folder_id = ?, favorite = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteManyAgent: stmt(db, 'DELETE FROM many_agents WHERE id = ?'),

    // Agent version history
    listAgentVersions: stmt(db, 
      'SELECT * FROM many_agent_versions WHERE agent_id = ? ORDER BY version_number DESC',
    ),
    getAgentVersionById: stmt(db, 'SELECT * FROM many_agent_versions WHERE id = ?'),
    getLatestAgentVersion: stmt(db, 
      'SELECT MAX(version_number) as max_version FROM many_agent_versions WHERE agent_id = ?',
    ),
    createAgentVersion: stmt(db, `
      INSERT INTO many_agent_versions (
        id, agent_id, version_number, name, description, system_instructions,
        tool_ids, mcp_server_ids, skill_ids, icon_index, change_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteAgentVersionsForAgent: stmt(db, 
      'DELETE FROM many_agent_versions WHERE agent_id = ?',
    ),

    // Agent folders
    listAgentFolders: stmt(db, 
      'SELECT * FROM agent_folders WHERE project_id = ? ORDER BY COALESCE(parent_id, \'\'), sort_order ASC, name ASC',
    ),
    getAgentFolderById: stmt(db, 'SELECT * FROM agent_folders WHERE id = ?'),
    createAgentFolder: stmt(db, `
      INSERT INTO agent_folders (id, project_id, parent_id, name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateAgentFolder: stmt(db, `
      UPDATE agent_folders
      SET parent_id = ?, name = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteAgentFolder: stmt(db, 'DELETE FROM agent_folders WHERE id = ?'),
    moveManyAgentsFolder: stmt(db, `
      UPDATE many_agents SET folder_id = ?, updated_at = ? WHERE folder_id = ?
    `),
    reparentAgentFolders: stmt(db, `
      UPDATE agent_folders SET parent_id = ?, updated_at = ? WHERE parent_id = ?
    `),

    // Canvas workflows
    listCanvasWorkflows: stmt(db, 'SELECT * FROM canvas_workflows WHERE project_id = ? ORDER BY updated_at DESC'),
    getCanvasWorkflowById: stmt(db, 'SELECT * FROM canvas_workflows WHERE id = ?'),
    createCanvasWorkflow: stmt(db, `
      INSERT INTO canvas_workflows (
        id, project_id, name, description, nodes_json, edges_json, marketplace_json, folder_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateCanvasWorkflow: stmt(db, `
      UPDATE canvas_workflows
      SET project_id = ?, name = ?, description = ?, nodes_json = ?, edges_json = ?, marketplace_json = ?, folder_id = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteCanvasWorkflow: stmt(db, 'DELETE FROM canvas_workflows WHERE id = ?'),

    // Workflow folders
    listWorkflowFolders: stmt(db, 
      'SELECT * FROM workflow_folders WHERE project_id = ? ORDER BY COALESCE(parent_id, \'\'), sort_order ASC, name ASC',
    ),
    getWorkflowFolderById: stmt(db, 'SELECT * FROM workflow_folders WHERE id = ?'),
    createWorkflowFolder: stmt(db, `
      INSERT INTO workflow_folders (id, project_id, parent_id, name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateWorkflowFolder: stmt(db, `
      UPDATE workflow_folders
      SET parent_id = ?, name = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteWorkflowFolder: stmt(db, 'DELETE FROM workflow_folders WHERE id = ?'),
    moveCanvasWorkflowsFolder: stmt(db, `
      UPDATE canvas_workflows SET folder_id = ?, updated_at = ? WHERE folder_id = ?
    `),
    reparentWorkflowFolders: stmt(db, `
      UPDATE workflow_folders SET parent_id = ?, updated_at = ? WHERE parent_id = ?
    `),

    // Workflow executions
    listWorkflowExecutionsByWorkflow: stmt(db, `
      SELECT * FROM workflow_executions
      WHERE workflow_id = ?
      ORDER BY started_at DESC
    `),
    getWorkflowExecutionById: stmt(db, 'SELECT * FROM workflow_executions WHERE id = ?'),
    upsertWorkflowExecution: stmt(db, `
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
    trimWorkflowExecutions: stmt(db, `
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
    listMcpServers: stmt(db, 'SELECT * FROM mcp_servers ORDER BY updated_at DESC, name ASC'),
    getMcpServerById: stmt(db, 'SELECT * FROM mcp_servers WHERE id = ?'),
    getMcpServerByName: stmt(db, 'SELECT * FROM mcp_servers WHERE name = ?'),
    createMcpServer: stmt(db, `
      INSERT INTO mcp_servers (
        id, name, type, command, args_json, url, headers_json, env_json,
        enabled, tools_json, enabled_tool_ids_json, last_discovery_at,
        last_discovery_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateMcpServer: stmt(db, `
      UPDATE mcp_servers
      SET name = ?, type = ?, command = ?, args_json = ?, url = ?, headers_json = ?, env_json = ?,
          enabled = ?, tools_json = ?, enabled_tool_ids_json = ?, last_discovery_at = ?,
          last_discovery_error = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteAllMcpServers: stmt(db, 'DELETE FROM mcp_servers'),
    getMcpGlobalSettings: stmt(db, 'SELECT * FROM mcp_global_settings WHERE id = 1'),
    upsertMcpGlobalSettings: stmt(db, `
      INSERT INTO mcp_global_settings (id, enabled, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
    `),

    // Skills
    listAiSkills: stmt(db, 'SELECT * FROM ai_skills ORDER BY updated_at DESC, name ASC'),
    getAiSkillById: stmt(db, 'SELECT * FROM ai_skills WHERE id = ?'),
    createAiSkill: stmt(db, `
      INSERT INTO ai_skills (id, name, description, prompt, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateAiSkill: stmt(db, `
      UPDATE ai_skills
      SET name = ?, description = ?, prompt = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteAllAiSkills: stmt(db, 'DELETE FROM ai_skills'),

    // Marketplace install state
    listMarketplaceAgentInstalls: stmt(db, 'SELECT * FROM marketplace_agent_installs ORDER BY updated_at DESC'),
    upsertMarketplaceAgentInstall: stmt(db, `
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
    deleteAllMarketplaceAgentInstalls: stmt(db, 'DELETE FROM marketplace_agent_installs'),

    listMarketplaceWorkflowInstalls: stmt(db, 'SELECT * FROM marketplace_workflow_installs ORDER BY updated_at DESC'),
    upsertMarketplaceWorkflowInstall: stmt(db, `
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
    deleteAllMarketplaceWorkflowInstalls: stmt(db, 'DELETE FROM marketplace_workflow_installs'),

    listMarketplaceTemplateMappings: stmt(db, 'SELECT * FROM marketplace_template_mappings ORDER BY template_id ASC'),
    upsertMarketplaceTemplateMapping: stmt(db, `
      INSERT INTO marketplace_template_mappings (template_id, workflow_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(template_id) DO UPDATE SET workflow_id = excluded.workflow_id, updated_at = excluded.updated_at
    `),
    deleteAllMarketplaceTemplateMappings: stmt(db, 'DELETE FROM marketplace_template_mappings'),

    upsertDomeProviderSession: stmt(db, `
      INSERT INTO dome_provider_sessions (user_id, access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `),
    getActiveDomeProviderSession: stmt(db, `
      SELECT * FROM dome_provider_sessions
      WHERE expires_at > ?
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    getDomeProviderSessionWithRefresh: stmt(db, `
      SELECT * FROM dome_provider_sessions
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    clearDomeProviderSessions: stmt(db, 'DELETE FROM dome_provider_sessions'),

    // Resource Interactions
    createInteraction: stmt(db, `
      INSERT INTO resource_interactions (id, resource_id, type, content, position_data, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getInteractionsByResource: stmt(db, 'SELECT * FROM resource_interactions WHERE resource_id = ? ORDER BY created_at DESC'),
    getInteractionsByType: stmt(db, 'SELECT * FROM resource_interactions WHERE resource_id = ? AND type = ? ORDER BY created_at DESC'),
    updateInteraction: stmt(db, `
      UPDATE resource_interactions
      SET content = ?, position_data = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteInteraction: stmt(db, 'DELETE FROM resource_interactions WHERE id = ?'),

    // Chat sessions and messages (traceability)
    createChatSession: stmt(db, `
      INSERT INTO chat_sessions (id, project_id, agent_id, resource_id, mode, context_id, thread_id, title, tool_ids, mcp_server_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getChatSession: stmt(db, 'SELECT * FROM chat_sessions WHERE id = ?'),
    updateChatSession: stmt(db, `
      UPDATE chat_sessions SET mode = ?, context_id = ?, thread_id = ?, title = ?, tool_ids = ?, mcp_server_ids = ?, updated_at = ?
      WHERE id = ?
    `),
    getChatSessionsByAgent: stmt(db, `
      SELECT * FROM chat_sessions WHERE agent_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT ?
    `),
    getChatSessionsByResource: stmt(db, `
      SELECT * FROM chat_sessions WHERE resource_id = ? ORDER BY updated_at DESC LIMIT ?
    `),
    getChatSessionsGlobal: stmt(db, `
      SELECT * FROM chat_sessions
      WHERE agent_id IS NULL
        AND resource_id IS NULL
        AND project_id = ?
        AND (mode IS NULL OR mode = 'many')
      ORDER BY updated_at DESC LIMIT ?
    `),
    createChatMessage: stmt(db, `
      INSERT INTO chat_messages (id, session_id, role, content, tool_calls, thinking, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getChatMessagesBySession: stmt(db, `
      SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC
    `),
    appendChatTrace: stmt(db, `
      INSERT INTO chat_traces (id, session_id, message_id, type, tool_name, tool_args, result, mcp_server_id, decision, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteChatTracesBySession: stmt(db, 'DELETE FROM chat_traces WHERE session_id = ?'),
    deleteChatMessagesBySession: stmt(db, 'DELETE FROM chat_messages WHERE session_id = ?'),
    deleteChatSession: stmt(db, 'DELETE FROM chat_sessions WHERE id = ?'),

    // Automations and persistent runs
    createAutomationDefinition: stmt(db, `
      INSERT INTO automation_definitions (
        id, project_id, title, description, target_type, target_id, trigger_type, schedule_json,
        input_template_json, output_mode, enabled, legacy_source, last_run_at, last_run_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateAutomationDefinition: stmt(db, `
      UPDATE automation_definitions
      SET project_id = ?, title = ?, description = ?, target_type = ?, target_id = ?, trigger_type = ?, schedule_json = ?,
          input_template_json = ?, output_mode = ?, enabled = ?, legacy_source = ?, last_run_at = ?, last_run_status = ?, updated_at = ?
      WHERE id = ?
    `),
    getAutomationDefinitionById: stmt(db, 'SELECT * FROM automation_definitions WHERE id = ?'),
    getAutomationDefinitionsByTarget: stmt(db, `
      SELECT * FROM automation_definitions
      WHERE target_type = ? AND target_id = ?
      ORDER BY updated_at DESC
    `),
    getAllAutomationDefinitions: stmt(db, `
      SELECT * FROM automation_definitions
      ORDER BY updated_at DESC
    `),
    getAutomationDefinitionsByProject: stmt(db, `
      SELECT * FROM automation_definitions
      WHERE project_id = ?
      ORDER BY updated_at DESC
    `),
    getEnabledScheduledAutomations: stmt(db, `
      SELECT * FROM automation_definitions
      WHERE enabled = 1 AND trigger_type = 'schedule'
      ORDER BY updated_at DESC
    `),
    deleteAutomationDefinition: stmt(db, 'DELETE FROM automation_definitions WHERE id = ?'),
    countAutomationDefinitions: stmt(db, 'SELECT COUNT(*) as count FROM automation_definitions'),

    createAutomationRun: stmt(db, `
      INSERT INTO automation_runs (
        id, project_id, automation_id, owner_type, owner_id, title, status, session_id, workflow_id,
        workflow_execution_id, thread_id, output_text, summary, error, metadata,
        started_at, updated_at, finished_at, last_heartbeat_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateAutomationRun: stmt(db, `
      UPDATE automation_runs
      SET project_id = ?, automation_id = ?, owner_type = ?, owner_id = ?, title = ?, status = ?, session_id = ?, workflow_id = ?,
          workflow_execution_id = ?, thread_id = ?, output_text = ?, summary = ?, error = ?, metadata = ?,
          updated_at = ?, finished_at = ?, last_heartbeat_at = ?
      WHERE id = ?
    `),
    getAutomationRunById: stmt(db, 'SELECT * FROM automation_runs WHERE id = ?'),
    // Workflow run ids — used to hide per-node JSONL sessions (`${runId}_${nodeId}`)
    // from the Many chat history list (they belong to Workflows, not Many chats).
    getWorkflowRunIds: stmt(db, "SELECT id FROM automation_runs WHERE owner_type = 'workflow'"),
    getAutomationRunsByOwner: stmt(db, `
      SELECT * FROM automation_runs
      WHERE owner_type = ? AND owner_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    getAutomationRunsByAutomation: stmt(db, `
      SELECT * FROM automation_runs
      WHERE automation_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    getActiveRunBySession: stmt(db, `
      SELECT * FROM automation_runs
      WHERE session_id = ? AND status IN ('queued', 'running', 'waiting_approval')
      ORDER BY updated_at DESC
      LIMIT 1
    `),
    getLatestAutomationRuns: stmt(db, `
      SELECT * FROM automation_runs
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    getLatestAutomationRunsByProject: stmt(db, `
      SELECT * FROM automation_runs
      WHERE project_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `),
    deleteAutomationRun: stmt(db, 'DELETE FROM automation_runs WHERE id = ?'),

    createAutomationRunStep: stmt(db, `
      INSERT INTO automation_run_steps (
        id, run_id, parent_step_id, step_type, title, status, content, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateAutomationRunStep: stmt(db, `
      UPDATE automation_run_steps
      SET status = ?, content = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `),
    getAutomationRunSteps: stmt(db, `
      SELECT * FROM automation_run_steps
      WHERE run_id = ?
      ORDER BY created_at ASC
    `),
    createAutomationRunLink: stmt(db, `
      INSERT INTO automation_run_links (id, run_id, link_type, link_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    getAutomationRunLinks: stmt(db, `
      SELECT * FROM automation_run_links
      WHERE run_id = ?
      ORDER BY created_at ASC
    `),

    // Semantic chunk embeddings + relations (replaces resource_links / note_embeddings)
    countSemanticIndexableResources: stmt(db, `
      SELECT COUNT(*) AS c FROM resources
      WHERE type IN ('note','url','document','pdf','notebook','ppt','excel','image','artifact')
    `),
    countResourcesWithSemanticChunks: stmt(db, `
      SELECT COUNT(DISTINCT r.id) AS c
      FROM resources r
      INNER JOIN resource_chunks rc ON rc.resource_id = r.id AND rc.model_version = ?
      WHERE r.type IN ('note','url','document','pdf','notebook','ppt','excel','image','artifact')
    `),
    countSemanticChunksForModel: stmt(db, `
      SELECT COUNT(*) AS c FROM resource_chunks WHERE model_version = ?
    `),

    insertResourceChunk: stmt(db, `
      INSERT INTO resource_chunks (
        id, resource_id, chunk_index, text, embedding, model_version, char_start, char_end, page_number, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteChunksByResource: stmt(db, 'DELETE FROM resource_chunks WHERE resource_id = ?'),
    getChunksByResource: stmt(db, `
      SELECT * FROM resource_chunks WHERE resource_id = ? ORDER BY chunk_index ASC
    `),
    getAllChunkIdsByModel: stmt(db, 
      'SELECT id FROM resource_chunks WHERE model_version = ?',
    ),
    getChunkEmbeddingsByResource: stmt(db, `
      SELECT embedding FROM resource_chunks WHERE resource_id = ? ORDER BY chunk_index ASC
    `),
    getChunksBatchByIds: stmt(db, `
      SELECT * FROM resource_chunks WHERE id IN (SELECT unnest(json_transform(?, '["VARCHAR"]')))
    `),
    getAllChunkRowsForModel: stmt(db, `
      SELECT id, resource_id, chunk_index, char_start, char_end, text, embedding, model_version
      FROM resource_chunks
      WHERE model_version = ?
    `),
    /** Evita cargar toda la tabla en memoria al actualizar relaciones semánticas por recurso. */
    getDistinctChunkResourceIdsExcluding: stmt(db, `
      SELECT DISTINCT resource_id AS resource_id
      FROM resource_chunks
      WHERE model_version = ? AND resource_id != ?
    `),
    getChunkEmbeddingsByResourceForModel: stmt(db, `
      SELECT embedding FROM resource_chunks
      WHERE resource_id = ? AND model_version = ?
      ORDER BY chunk_index ASC
    `),
    /** Barato: dimensionar muestreo de embeddings sin cargar blobs. */
    countChunksByResourceForModel: stmt(db, `
      SELECT COUNT(*) AS c FROM resource_chunks
      WHERE resource_id = ? AND model_version = ?
    `),
    /**
     * Solo filas cuyo ROW_NUMBER (orden chunk_index) está en la lista JSON (enteros 1-based).
     * Evita `getChunkEmbeddingsByResourceForModel` + miles de blobs en RAM por recurso vecino.
     */
    getChunkEmbeddingsByRankSampleForModel: stmt(db, `
      WITH ranked AS (
        SELECT embedding, ROW_NUMBER() OVER (ORDER BY chunk_index) AS rn
        FROM resource_chunks
        WHERE resource_id = ? AND model_version = ?
      )
      SELECT embedding FROM ranked
      WHERE rn IN (SELECT CAST(unnest(json_transform(?, '["INTEGER"]')) AS INTEGER))
      ORDER BY rn
    `),
    getChunkRowsForSemanticSearch: stmt(db, `
      SELECT c.id, c.resource_id, c.chunk_index, c.char_start, c.char_end, c.page_number, c.text, c.embedding,
             r.title AS res_title, r.type AS res_type
      FROM resource_chunks c
      INNER JOIN resources r ON r.id = c.resource_id
      WHERE c.model_version = ?
    `),

    insertSemanticRelation: stmt(db, `
      INSERT INTO semantic_relations (id, source_id, target_id, similarity, relation_type, label, detected_at, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSemanticRelationByPair: stmt(db, 
      'SELECT * FROM semantic_relations WHERE source_id = ? AND target_id = ? LIMIT 1',
    ),
    getSemanticRelationById: stmt(db, 'SELECT * FROM semantic_relations WHERE id = ?'),
    updateSemanticRelationState: stmt(db, `
      UPDATE semantic_relations
      SET relation_type = ?, confirmed_at = ?
      WHERE id = ?
    `),
    deleteSemanticAutoFromSource: stmt(db, `
      DELETE FROM semantic_relations WHERE source_id = ? AND relation_type = 'auto'
    `),
    updateSemanticAutoByPair: stmt(db, `
      UPDATE semantic_relations
      SET similarity = ?, detected_at = ?
      WHERE source_id = ? AND target_id = ? AND relation_type = 'auto'
    `),
    deleteSemanticRelationById: stmt(db, 'DELETE FROM semantic_relations WHERE id = ?'),

    getSemanticOutgoing: stmt(db, `
      SELECT sr.*, r.title AS target_title, r.type AS target_type
      FROM semantic_relations sr
      JOIN resources r ON r.id = sr.target_id
      WHERE sr.source_id = ? AND sr.relation_type != 'rejected'
      ORDER BY sr.similarity DESC, sr.detected_at DESC
    `),
    getSemanticIncoming: stmt(db, `
      SELECT sr.*, r.title AS source_title, r.type AS source_type
      FROM semantic_relations sr
      JOIN resources r ON r.id = sr.source_id
      WHERE sr.target_id = ? AND sr.relation_type != 'rejected'
      ORDER BY sr.similarity DESC, sr.detected_at DESC
    `),

    // Tags
    getTagsByResource: stmt(db, `
      SELECT t.* FROM tags t
      JOIN resource_tags rt ON t.id = rt.tag_id
      WHERE rt.resource_id = ?
      ORDER BY t.name
    `),
    getAllTagsWithCount: stmt(db, `
      SELECT t.*, COUNT(rt.resource_id) as resource_count
      FROM tags t
      LEFT JOIN resource_tags rt ON t.id = rt.tag_id
      GROUP BY t.id
      ORDER BY resource_count DESC, t.name ASC
    `),
    /**
     * Project-scoped tag list: only tags applied to resources in the given
     * project, with counts scoped to that project. Tags from other projects
     * (and their names) never appear.
     */
    getAllTagsWithCountByProject: stmt(db, `
      SELECT t.*, COUNT(rt.resource_id) as resource_count
      FROM tags t
      JOIN resource_tags rt ON t.id = rt.tag_id
      JOIN resources r ON rt.resource_id = r.id
      WHERE r.project_id = ?
      GROUP BY t.id
      ORDER BY resource_count DESC, t.name ASC
    `),
    getResourcesByTag: stmt(db, `
      SELECT r.* FROM resources r
      JOIN resource_tags rt ON r.id = rt.resource_id
      WHERE rt.tag_id = ?
      ORDER BY r.updated_at DESC
    `),
    getResourcesByTagInProject: stmt(db, `
      SELECT r.* FROM resources r
      JOIN resource_tags rt ON r.id = rt.resource_id
      WHERE rt.tag_id = ? AND r.project_id = ?
      ORDER BY r.updated_at DESC
    `),
    findTagByNameInsensitive: stmt(db, `
      SELECT * FROM tags WHERE name = ? COLLATE NOCASE LIMIT 1
    `),
    insertTag: stmt(db, `
      INSERT INTO tags (id, name, color, created_at)
      VALUES (?, ?, ?, ?)
    `),
    getTagById: stmt(db, 'SELECT * FROM tags WHERE id = ?'),
    attachTagToResource: stmt(db, `
      INSERT INTO resource_tags (resource_id, tag_id)
      VALUES (?, ?)
      ON CONFLICT DO NOTHING
    `),
    detachTagFromResource: stmt(db, `
      DELETE FROM resource_tags WHERE resource_id = ? AND tag_id = ?
    `),
    findUrlResourceByCanonicalUrl: stmt(db, `
      SELECT * FROM resources
      WHERE type = 'url'
        AND (content = ? OR json_extract_string(metadata, '$.url') = ?)
      LIMIT 1
    `),

    // Search (standalone FTS tables)
    searchInteractions: stmt(db, `
      SELECT * FROM (
        SELECT i.*, r.title AS resource_title, r.type AS resource_type, r.project_id AS project_id,
               fts_main_resource_interactions.match_bm25(i.id, ?) AS _score
        FROM resource_interactions i
        JOIN resources r ON i.resource_id = r.id
      ) WHERE _score IS NOT NULL
      ORDER BY _score DESC
    `),
    /** Indexing sweep — id+type only (never load content/thumbnail_data). */
    listResourcesIdType: stmt(db, `
      SELECT id, type FROM resources ORDER BY updated_at DESC LIMIT ?
    `),
    getAllResources: stmt(db, 'SELECT * FROM resources ORDER BY updated_at DESC LIMIT ?'),
    /** Sidebar/dashboard listings — omits `content` and `thumbnail_data` to keep IPC payloads small. */
    listResourcesLight: stmt(db, `
      SELECT id, project_id, type, title, folder_id, metadata,
             internal_path, file_mime_type, file_size, file_hash, original_filename,
             created_at, updated_at
      FROM resources ORDER BY updated_at DESC LIMIT ?
    `),
    /**
     * Project-scoped variant of `listResourcesLight`. Filters by `project_id`
     * BEFORE applying the LIMIT so a project never loses its own files to the
     * global truncation that the unscoped query suffers from.
     */
    listResourcesLightByProject: stmt(db, `
      SELECT id, project_id, type, title, folder_id, metadata,
             internal_path, file_mime_type, file_size, file_hash, original_filename,
             created_at, updated_at
      FROM resources WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?
    `),

    // Search for mentions (quick search for autocomplete)
    searchForMention: stmt(db, `
      SELECT id, title, type, project_id, thumbnail_data
      FROM resources
      WHERE title LIKE ? OR id LIKE ?
      ORDER BY updated_at DESC
      LIMIT 10
    `),
    // Project-scoped variant — mentions must never resolve cross-project.
    searchForMentionByProject: stmt(db, `
      SELECT id, title, type, project_id, thumbnail_data
      FROM resources
      WHERE (title LIKE ? OR id LIKE ?) AND project_id = ?
      ORDER BY updated_at DESC
      LIMIT 10
    `),

    // Get backlinks (manual or confirmed relations pointing to this resource)
    getBacklinks: stmt(db, `
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
    createGraphNode: stmt(db, `
      INSERT INTO graph_nodes (id, resource_id, label, type, properties, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getGraphNodeById: stmt(db, 'SELECT * FROM graph_nodes WHERE id = ?'),
    getGraphNodesByType: stmt(db, 'SELECT * FROM graph_nodes WHERE type = ? ORDER BY created_at DESC'),
    getGraphNodeByResource: stmt(db, 'SELECT * FROM graph_nodes WHERE resource_id = ?'),
    updateGraphNode: stmt(db, `
      UPDATE graph_nodes
      SET label = ?, properties = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteGraphNode: stmt(db, 'DELETE FROM graph_nodes WHERE id = ?'),
    searchGraphNodes: stmt(db, `
      SELECT * FROM graph_nodes
      WHERE label LIKE ? OR properties LIKE ?
      ORDER BY created_at DESC
      LIMIT 50
    `),

    // Knowledge Graph - Edges
    createGraphEdge: stmt(db, `
      INSERT INTO graph_edges (id, source_id, target_id, relation, weight, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getGraphEdgeById: stmt(db, 'SELECT * FROM graph_edges WHERE id = ?'),
    getGraphEdgesBySource: stmt(db, 'SELECT * FROM graph_edges WHERE source_id = ?'),
    getGraphEdgesByTarget: stmt(db, 'SELECT * FROM graph_edges WHERE target_id = ?'),
    getGraphEdgesByRelation: stmt(db, 'SELECT * FROM graph_edges WHERE relation = ?'),
    updateGraphEdge: stmt(db, `
      UPDATE graph_edges
      SET relation = ?, weight = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteGraphEdge: stmt(db, 'DELETE FROM graph_edges WHERE id = ?'),

    // Knowledge Graph - Traversal (1-hop)
    getNodeNeighbors: stmt(db, `
      SELECT DISTINCT n.*, e.relation, e.weight
      FROM graph_edges e
      JOIN graph_nodes n ON (e.target_id = n.id OR e.source_id = n.id)
      WHERE (e.source_id = ? OR e.target_id = ?) AND n.id != ?
      ORDER BY e.weight DESC
      LIMIT 100
    `),

    // Flashcard Decks
    createFlashcardDeck: stmt(db, `
      INSERT INTO flashcard_decks (id, resource_id, project_id, title, description, card_count, tags, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getFlashcardDeckById: stmt(db, 'SELECT * FROM flashcard_decks WHERE id = ?'),
    getFlashcardDecksByProject: stmt(db, 'SELECT * FROM flashcard_decks WHERE project_id = ? ORDER BY updated_at DESC'),
    getAllFlashcardDecks: stmt(db, 'SELECT * FROM flashcard_decks ORDER BY updated_at DESC LIMIT ?'),
    updateFlashcardDeck: stmt(db, `
      UPDATE flashcard_decks SET title = ?, description = ?, card_count = ?, tags = ?, settings = ?, updated_at = ? WHERE id = ?
    `),
    deleteFlashcardDeck: stmt(db, 'DELETE FROM flashcard_decks WHERE id = ?'),

    // Flashcards
    createFlashcard: stmt(db, `
      INSERT INTO flashcards (id, deck_id, question, answer, difficulty, tags, metadata, ease_factor, interval, repetitions, next_review_at, last_reviewed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getFlashcardsByDeck: stmt(db, 'SELECT * FROM flashcards WHERE deck_id = ? ORDER BY created_at ASC'),
    getFlashcardById: stmt(db, 'SELECT * FROM flashcards WHERE id = ?'),
    getDueFlashcards: stmt(db, `
      SELECT * FROM flashcards WHERE deck_id = ? AND (next_review_at IS NULL OR next_review_at <= ?) ORDER BY next_review_at ASC LIMIT ?
    `),
    updateFlashcardReview: stmt(db, `
      UPDATE flashcards SET ease_factor = ?, interval = ?, repetitions = ?, next_review_at = ?, last_reviewed_at = ?, updated_at = ? WHERE id = ?
    `),
    updateFlashcard: stmt(db, `
      UPDATE flashcards SET question = ?, answer = ?, difficulty = ?, tags = ?, metadata = ?, updated_at = ? WHERE id = ?
    `),
    deleteFlashcard: stmt(db, 'DELETE FROM flashcards WHERE id = ?'),
    getFlashcardStats: stmt(db, `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN next_review_at IS NULL THEN 1 ELSE 0 END) as new_cards,
        SUM(CASE WHEN next_review_at IS NOT NULL AND next_review_at <= ? THEN 1 ELSE 0 END) as due_cards,
        SUM(CASE WHEN COALESCE(stability, interval) >= 21 THEN 1 ELSE 0 END) as mastered_cards,
        -- Continuous progress (0..100): each card matures toward 21-day stability,
        -- so the metric climbs with every successful review instead of jumping at 21.
        CAST(ROUND(AVG(MIN(1.0, COALESCE(stability, interval, 0) / 21.0)) * 100) AS INTEGER) as maturity
      FROM flashcards WHERE deck_id = ?
    `),
    // FSRS review: persist memory state + legacy interval mirror
    reviewFlashcardFsrs: stmt(db, `
      UPDATE flashcards SET
        stability = ?, fsrs_difficulty = ?, fsrs_state = ?, lapses = ?, scheduled_days = ?,
        learning_steps = ?, repetitions = ?, next_review_at = ?, last_reviewed_at = ?,
        last_rating = ?, interval = ?, updated_at = ?
      WHERE id = ?
    `),

    // Flashcard Sessions
    createFlashcardSession: stmt(db, `
      INSERT INTO flashcard_sessions (id, deck_id, cards_studied, cards_correct, cards_incorrect, duration_ms, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSessionsByDeck: stmt(db, 'SELECT * FROM flashcard_sessions WHERE deck_id = ? ORDER BY started_at DESC LIMIT ?'),

    // Unified study events (flashcard + quiz) — single source for KPIs/streak
    createStudyEvent: stmt(db, `
      INSERT INTO study_events (id, project_id, deck_id, studio_output_id, kind, cards_studied, cards_correct, cards_incorrect, duration_ms, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getStudyEventsSince: stmt(db, 'SELECT * FROM study_events WHERE started_at >= ? ORDER BY started_at ASC'),

    // Learn KPI cache
    getKpiCache: stmt(db, 'SELECT payload, computed_at FROM learn_kpis_cache WHERE scope = ?'),
    setKpiCache: stmt(db, `
      INSERT INTO learn_kpis_cache (scope, payload, computed_at) VALUES (?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET payload = excluded.payload, computed_at = excluded.computed_at
    `),
    clearKpiCache: stmt(db, 'DELETE FROM learn_kpis_cache'),

    // Gemma PDF transcripts (per page cache)
    upsertResourceTranscript: stmt(db, `
      INSERT INTO resource_transcripts (resource_id, page_number, markdown, model_used, file_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(resource_id, page_number) DO UPDATE SET
        markdown = excluded.markdown,
        model_used = excluded.model_used,
        file_hash = excluded.file_hash,
        created_at = excluded.created_at
    `),
    getResourceTranscriptsByResource: stmt(db, `
      SELECT page_number, markdown, model_used, file_hash, created_at
      FROM resource_transcripts WHERE resource_id = ? ORDER BY page_number ASC
    `),
    deleteResourceTranscripts: stmt(db, 'DELETE FROM resource_transcripts WHERE resource_id = ?'),
    countResourceTranscriptsForHash: stmt(db, `
      SELECT COUNT(*) AS c FROM resource_transcripts
      WHERE resource_id = ? AND file_hash = ?
    `),
    updateResourceContent: stmt(db, `
      UPDATE resources SET content = ?, updated_at = ? WHERE id = ?
    `),

    // Calendar - Accounts
    createCalendarAccount: stmt(db, `
      INSERT INTO calendar_accounts (id, provider, account_email, credentials, status, last_sync_at, sync_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarAccountById: stmt(db, 'SELECT * FROM calendar_accounts WHERE id = ?'),
    getCalendarAccountsByProvider: stmt(db, 'SELECT * FROM calendar_accounts WHERE provider = ? ORDER BY created_at DESC'),
    getAllCalendarAccounts: stmt(db, 'SELECT * FROM calendar_accounts ORDER BY created_at DESC'),
    updateCalendarAccount: stmt(db, `
      UPDATE calendar_accounts SET account_email = ?, credentials = ?, status = ?, last_sync_at = ?, sync_token = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteCalendarAccount: stmt(db, 'DELETE FROM calendar_accounts WHERE id = ?'),

    // Calendar - Calendars
    createCalendarCalendar: stmt(db, `
      INSERT INTO calendar_calendars (id, account_id, remote_id, title, color, is_selected, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarCalendarById: stmt(db, 'SELECT * FROM calendar_calendars WHERE id = ?'),
    getCalendarCalendarsByAccount: stmt(db, 'SELECT * FROM calendar_calendars WHERE account_id = ? ORDER BY is_default DESC, title ASC'),
    getSelectedCalendarCalendars: stmt(db, 'SELECT * FROM calendar_calendars WHERE is_selected = 1 ORDER BY is_default DESC'),
    getDefaultCalendar: stmt(db, 'SELECT * FROM calendar_calendars WHERE is_default = 1 LIMIT 1'),
    updateCalendarCalendar: stmt(db, `
      UPDATE calendar_calendars SET title = ?, color = ?, is_selected = ?, is_default = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteCalendarCalendar: stmt(db, 'DELETE FROM calendar_calendars WHERE id = ?'),

    // Calendar - Events
    createCalendarEvent: stmt(db, `
      INSERT INTO calendar_events (id, calendar_id, title, description, location, start_at, end_at, timezone, all_day, status, reminders, metadata, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarEventById: stmt(db, 'SELECT * FROM calendar_events WHERE id = ?'),
    getCalendarEventsByRange: stmt(db, `
      SELECT e.*, c.title as calendar_title, c.color as calendar_color
      FROM calendar_events e
      JOIN calendar_calendars c ON e.calendar_id = c.id
      WHERE c.is_selected = 1 AND e.status != 'cancelled'
        AND e.start_at < ? AND e.end_at > ?
      ORDER BY e.start_at ASC
    `),
    getUpcomingCalendarEvents: stmt(db, `
      SELECT e.*, c.title as calendar_title, c.color as calendar_color
      FROM calendar_events e
      JOIN calendar_calendars c ON e.calendar_id = c.id
      WHERE c.is_selected = 1 AND e.status != 'cancelled'
        AND e.start_at >= ? AND e.start_at <= ?
      ORDER BY e.start_at ASC
      LIMIT ?
    `),
    updateCalendarEvent: stmt(db, `
      UPDATE calendar_events SET title = ?, description = ?, location = ?, start_at = ?, end_at = ?, timezone = ?, all_day = ?, status = ?, reminders = ?, metadata = ?, source = ?, updated_at = ?
      WHERE id = ?
    `),
    deleteCalendarEvent: stmt(db, 'DELETE FROM calendar_events WHERE id = ?'),

    // Calendar - Event Links (local <-> remote)
    createCalendarEventLink: stmt(db, `
      INSERT INTO calendar_event_links (id, event_id, provider, remote_event_id, remote_calendar_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarEventLinkByEvent: stmt(db, 'SELECT * FROM calendar_event_links WHERE event_id = ?'),
    getCalendarEventLinkByRemote: stmt(db, 'SELECT * FROM calendar_event_links WHERE provider = ? AND remote_event_id = ?'),
    deleteCalendarEventLinksByEvent: stmt(db, 'DELETE FROM calendar_event_links WHERE event_id = ?'),

    // Calendar - Notifications
    createCalendarNotification: stmt(db, `
      INSERT INTO calendar_notifications (id, event_id, notify_at, notified_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    getPendingCalendarNotifications: stmt(db, `
      SELECT n.*, e.title, e.start_at, e.calendar_id
      FROM calendar_notifications n
      JOIN calendar_events e ON n.event_id = e.id
      WHERE n.notify_at <= ? AND n.notified_at IS NULL
      ORDER BY n.notify_at ASC
      LIMIT ?
    `),
    markCalendarNotificationNotified: stmt(db, `
      UPDATE calendar_notifications SET notified_at = ? WHERE id = ?
    `),
    deleteCalendarNotificationsForEvent: stmt(db, `
      DELETE FROM calendar_notifications WHERE event_id = ?
    `),

    // Transcription sessions (redesign — single unified pipeline)
    insertTranscriptionSession: stmt(db, `
      INSERT INTO transcription_sessions
        (id, project_id, folder_id, status, sources, live_preview, save_audio, session_dir, partial_text, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
    `),
    updateTranscriptionSessionStatus: stmt(db, `
      UPDATE transcription_sessions
      SET status = ?, updated_at = ?, error_message = ?
      WHERE id = ?
    `),
    appendTranscriptionPartial: stmt(db, `
      UPDATE transcription_sessions
      SET partial_text = partial_text || ?, updated_at = ?
      WHERE id = ?
    `),
    finalizeTranscriptionSession: stmt(db, `
      UPDATE transcription_sessions
      SET status = 'done', resource_id = ?, finished_at = ?, updated_at = ?
      WHERE id = ?
    `),
    getTranscriptionSession: stmt(db, `
      SELECT * FROM transcription_sessions WHERE id = ?
    `),
    getStaleTranscriptionSessions: stmt(db, `
      SELECT * FROM transcription_sessions
      WHERE status IN ('recording','paused','transcribing')
      ORDER BY started_at ASC
    `),
    deleteTranscriptionSession: stmt(db, `
      DELETE FROM transcription_sessions WHERE id = ?
    `),

    // Transcription chunks
    insertTranscriptionChunk: stmt(db, `
      INSERT INTO transcription_chunks
        (session_id, seq, track, start_ms, duration_ms, file_path, text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (session_id, track, seq) DO UPDATE SET
        start_ms = excluded.start_ms,
        duration_ms = excluded.duration_ms,
        file_path = excluded.file_path,
        text = excluded.text
    `),
    updateTranscriptionChunkText: stmt(db, `
      UPDATE transcription_chunks SET text = ? WHERE session_id = ? AND track = ? AND seq = ?
    `),
    listSessionChunks: stmt(db, `
      SELECT * FROM transcription_chunks
      WHERE session_id = ?
      ORDER BY track ASC, seq ASC
    `),

    // Artifacts
    createArtifact: stmt(db, `
      INSERT INTO artifacts (id, resource_id, artifact_type, template, state, linked_resource_id, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `),
    getArtifactByResourceId: stmt(db, 'SELECT * FROM artifacts WHERE resource_id = ?'),
    getArtifactById: stmt(db, 'SELECT * FROM artifacts WHERE id = ?'),
    listArtifactsByProject: stmt(db, `
      SELECT a.* FROM artifacts a
      JOIN resources r ON a.resource_id = r.id
      WHERE r.project_id = ?
      ORDER BY a.updated_at DESC
    `),
    updateArtifactState: stmt(db, `
      UPDATE artifacts SET state = ?, version = version + 1, updated_at = ? WHERE resource_id = ?
    `),
    updateArtifact: stmt(db, `
      UPDATE artifacts
      SET artifact_type = ?, template = ?, state = ?, linked_resource_id = ?, version = version + 1, updated_at = ?
      WHERE resource_id = ?
    `),
    deleteArtifact: stmt(db, 'DELETE FROM artifacts WHERE resource_id = ?'),
    getArtifactsLinkedToResource: stmt(db, 'SELECT * FROM artifacts WHERE linked_resource_id = ?'),

    // Artifact runtime payloads (DOME_DATA slots) + automation → artifact sinks
    getArtifactRuntimeDataByArtifactSlot: stmt(db, `
      SELECT * FROM artifact_runtime_data WHERE artifact_id = ? AND slot = ?
    `),
    listArtifactRuntimeDataByArtifact: stmt(db, `
      SELECT * FROM artifact_runtime_data WHERE artifact_id = ?
    `),
    upsertArtifactRuntimeData: stmt(db, `
      INSERT INTO artifact_runtime_data (
        id, artifact_id, slot, data_json, schema_version, last_run_id, last_automation_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(artifact_id, slot) DO UPDATE SET
        data_json = excluded.data_json,
        schema_version = excluded.schema_version,
        last_run_id = excluded.last_run_id,
        last_automation_id = excluded.last_automation_id,
        updated_at = excluded.updated_at
    `),
    deleteArtifactRuntimeDataByArtifact: stmt(db, 'DELETE FROM artifact_runtime_data WHERE artifact_id = ?'),

    listAutomationArtifactBindings: stmt(db, `
      SELECT * FROM automation_artifact_bindings WHERE automation_id = ? ORDER BY created_at ASC
    `),
    insertAutomationArtifactBinding: stmt(db, `
      INSERT INTO automation_artifact_bindings (
        id, automation_id, artifact_resource_id, slot, update_policy, transform_hint, extract_mode, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteAutomationArtifactBindingsByAutomation: stmt(db, `
      DELETE FROM automation_artifact_bindings WHERE automation_id = ?
    `),
    getAutomationArtifactBindingById: stmt(db, 'SELECT * FROM automation_artifact_bindings WHERE id = ?'),

    // Artifact feeders (sandbox scripts → runtime data)
    createFeeder: stmt(db, `
      INSERT INTO feeders (
        id, artifact_resource_id, slot, name, description, interpreter, script, script_hash,
        env_secret_refs, env_static, output_mode, update_policy, timeout_ms, enabled, approved,
        approved_script_hash, last_run_at, last_status, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getFeederById: stmt(db, 'SELECT * FROM feeders WHERE id = ?'),
    listFeedersByArtifact: stmt(db, `
      SELECT * FROM feeders WHERE artifact_resource_id = ? ORDER BY updated_at DESC
    `),
    listAllFeeders: stmt(db, `
      SELECT * FROM feeders ORDER BY updated_at DESC
    `),
    countRunningFeederRunsByAutomation: stmt(db, `
      SELECT COUNT(*) AS c FROM feeder_runs WHERE automation_id = ? AND status = 'running'
    `),
    updateFeederScript: stmt(db, `
      UPDATE feeders
      SET script = ?, script_hash = ?, approved = ?, approved_script_hash = ?, updated_at = ?
      WHERE id = ?
    `),
    approveFeeder: stmt(db, `
      UPDATE feeders SET approved = ?, approved_script_hash = ?, updated_at = ? WHERE id = ?
    `),
    updateFeederLastRun: stmt(db, `
      UPDATE feeders SET last_run_at = ?, last_status = ?, last_error = ?, updated_at = ? WHERE id = ?
    `),
    deleteFeeder: stmt(db, 'DELETE FROM feeders WHERE id = ?'),
    createFeederSecret: stmt(db, `
      INSERT INTO feeder_secrets (id, name, encrypted_value, last_used_at, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?)
    `),
    updateFeederSecret: stmt(db, `
      UPDATE feeder_secrets SET encrypted_value = ?, updated_at = ? WHERE id = ?
    `),
    getFeederSecretByName: stmt(db, 'SELECT * FROM feeder_secrets WHERE name = ?'),
    listFeederSecrets: stmt(db, 'SELECT id, name, last_used_at, created_at, updated_at FROM feeder_secrets ORDER BY name ASC'),
    touchFeederSecretUsed: stmt(db, 'UPDATE feeder_secrets SET last_used_at = ? WHERE id = ?'),
    deleteFeederSecret: stmt(db, 'DELETE FROM feeder_secrets WHERE id = ?'),
    createFeederRun: stmt(db, `
      INSERT INTO feeder_runs (
        id, feeder_id, started_at, finished_at, status, exit_code, stdout_excerpt, stderr_excerpt,
        data_bytes, triggered_by, automation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateFeederRun: stmt(db, `
      UPDATE feeder_runs
      SET finished_at = ?, status = ?, exit_code = ?, stdout_excerpt = ?, stderr_excerpt = ?, data_bytes = ?
      WHERE id = ?
    `),
    listFeederRuns: stmt(db, `
      SELECT * FROM feeder_runs WHERE feeder_id = ? ORDER BY started_at DESC LIMIT ?
    `),
  };
}

module.exports = { buildQueries };
