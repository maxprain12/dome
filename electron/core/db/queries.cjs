/* eslint-disable no-console */
/**
 * Prepared statements (05/T03 — extracted from database.cjs).
 *
 * `buildQueries(db)` returns the full statement map; `database.cjs` caches it
 * (`getQueries()`) and invalidates it after FTS repairs. Add new statements
 * here, grouped by domain — never prepare ad-hoc statements in handlers.
 */

function buildQueries(db) {
  return {
    // Projects
    createProject: db.prepare(`
      INSERT INTO projects (id, name, description, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getProjects: db.prepare('SELECT * FROM projects ORDER BY created_at DESC'),
    getProjectById: db.prepare('SELECT * FROM projects WHERE id = ?'),
    updateProject: db.prepare(`
      UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?
    `),

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

    // Agent version history
    listAgentVersions: db.prepare(
      'SELECT * FROM many_agent_versions WHERE agent_id = ? ORDER BY version_number DESC',
    ),
    getAgentVersionById: db.prepare('SELECT * FROM many_agent_versions WHERE id = ?'),
    getLatestAgentVersion: db.prepare(
      'SELECT MAX(version_number) as max_version FROM many_agent_versions WHERE agent_id = ?',
    ),
    createAgentVersion: db.prepare(`
      INSERT INTO many_agent_versions (
        id, agent_id, version_number, name, description, system_instructions,
        tool_ids, mcp_server_ids, skill_ids, icon_index, change_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteAgentVersionsForAgent: db.prepare(
      'DELETE FROM many_agent_versions WHERE agent_id = ?',
    ),

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
      SELECT * FROM chat_sessions
      WHERE agent_id IS NULL
        AND resource_id IS NULL
        AND project_id = ?
        AND (mode IS NULL OR mode = 'many')
      ORDER BY updated_at DESC LIMIT ?
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
    deleteChatTracesBySession: db.prepare('DELETE FROM chat_traces WHERE session_id = ?'),
    deleteChatMessagesBySession: db.prepare('DELETE FROM chat_messages WHERE session_id = ?'),
    deleteChatSession: db.prepare('DELETE FROM chat_sessions WHERE id = ?'),

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
    // Workflow run ids — used to hide per-node JSONL sessions (`${runId}_${nodeId}`)
    // from the Many chat history list (they belong to Workflows, not Many chats).
    getWorkflowRunIds: db.prepare("SELECT id FROM automation_runs WHERE owner_type = 'workflow'"),
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
      WHERE type IN ('note','url','document','pdf','notebook','ppt','excel','image','artifact')
    `),
    countResourcesWithSemanticChunks: db.prepare(`
      SELECT COUNT(DISTINCT r.id) AS c
      FROM resources r
      INNER JOIN resource_chunks rc ON rc.resource_id = r.id AND rc.model_version = ?
      WHERE r.type IN ('note','url','document','pdf','notebook','ppt','excel','image','artifact')
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
    /** Barato: dimensionar muestreo de embeddings sin cargar blobs. */
    countChunksByResourceForModel: db.prepare(`
      SELECT COUNT(*) AS c FROM resource_chunks
      WHERE resource_id = ? AND model_version = ?
    `),
    /**
     * Solo filas cuyo ROW_NUMBER (orden chunk_index) está en la lista JSON (enteros 1-based).
     * Evita `getChunkEmbeddingsByResourceForModel` + miles de blobs en RAM por recurso vecino.
     */
    getChunkEmbeddingsByRankSampleForModel: db.prepare(`
      WITH ranked AS (
        SELECT embedding, ROW_NUMBER() OVER (ORDER BY chunk_index) AS rn
        FROM resource_chunks
        WHERE resource_id = ? AND model_version = ?
      )
      SELECT embedding FROM ranked
      WHERE rn IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
      ORDER BY rn
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
    /**
     * Project-scoped tag list: only tags applied to resources in the given
     * project, with counts scoped to that project. Tags from other projects
     * (and their names) never appear.
     */
    getAllTagsWithCountByProject: db.prepare(`
      SELECT t.*, COUNT(rt.resource_id) as resource_count
      FROM tags t
      JOIN resource_tags rt ON t.id = rt.tag_id
      JOIN resources r ON rt.resource_id = r.id
      WHERE r.project_id = ?
      GROUP BY t.id
      ORDER BY resource_count DESC, t.name ASC
    `),
    getResourcesByTag: db.prepare(`
      SELECT r.* FROM resources r
      JOIN resource_tags rt ON r.id = rt.resource_id
      WHERE rt.tag_id = ?
      ORDER BY r.updated_at DESC
    `),
    getResourcesByTagInProject: db.prepare(`
      SELECT r.* FROM resources r
      JOIN resource_tags rt ON r.id = rt.resource_id
      WHERE rt.tag_id = ? AND r.project_id = ?
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
      SELECT i.*, r.title as resource_title, r.type as resource_type, r.project_id as project_id
      FROM resource_interactions i
      JOIN interactions_fts fts ON i.id = fts.interaction_id
      JOIN resources r ON i.resource_id = r.id
      WHERE interactions_fts MATCH ?
      ORDER BY rank
    `),
    /** Indexing sweep — id+type only (never load content/thumbnail_data). */
    listResourcesIdType: db.prepare(`
      SELECT id, type FROM resources ORDER BY updated_at DESC LIMIT ?
    `),
    getAllResources: db.prepare('SELECT * FROM resources ORDER BY updated_at DESC LIMIT ?'),
    /** Sidebar/dashboard listings — omits `content` and `thumbnail_data` to keep IPC payloads small. */
    listResourcesLight: db.prepare(`
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
    listResourcesLightByProject: db.prepare(`
      SELECT id, project_id, type, title, folder_id, metadata,
             internal_path, file_mime_type, file_size, file_hash, original_filename,
             created_at, updated_at
      FROM resources WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?
    `),

    // Search for mentions (quick search for autocomplete)
    searchForMention: db.prepare(`
      SELECT id, title, type, project_id, thumbnail_data
      FROM resources
      WHERE title LIKE ? OR id LIKE ?
      ORDER BY updated_at DESC
      LIMIT 10
    `),
    // Project-scoped variant — mentions must never resolve cross-project.
    searchForMentionByProject: db.prepare(`
      SELECT id, title, type, project_id, thumbnail_data
      FROM resources
      WHERE (title LIKE ? OR id LIKE ?) AND project_id = ?
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
        SUM(CASE WHEN COALESCE(stability, interval) >= 21 THEN 1 ELSE 0 END) as mastered_cards,
        -- Continuous progress (0..100): each card matures toward 21-day stability,
        -- so the metric climbs with every successful review instead of jumping at 21.
        CAST(ROUND(AVG(MIN(1.0, COALESCE(stability, interval, 0) / 21.0)) * 100) AS INTEGER) as maturity
      FROM flashcards WHERE deck_id = ?
    `),
    // FSRS review: persist memory state + legacy interval mirror
    reviewFlashcardFsrs: db.prepare(`
      UPDATE flashcards SET
        stability = ?, fsrs_difficulty = ?, fsrs_state = ?, lapses = ?, scheduled_days = ?,
        learning_steps = ?, repetitions = ?, next_review_at = ?, last_reviewed_at = ?,
        last_rating = ?, interval = ?, updated_at = ?
      WHERE id = ?
    `),

    // Flashcard Sessions
    createFlashcardSession: db.prepare(`
      INSERT INTO flashcard_sessions (id, deck_id, cards_studied, cards_correct, cards_incorrect, duration_ms, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSessionsByDeck: db.prepare('SELECT * FROM flashcard_sessions WHERE deck_id = ? ORDER BY started_at DESC LIMIT ?'),

    // Unified study events (flashcard + quiz) — single source for KPIs/streak
    createStudyEvent: db.prepare(`
      INSERT INTO study_events (id, project_id, deck_id, studio_output_id, kind, cards_studied, cards_correct, cards_incorrect, duration_ms, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getStudyEventsSince: db.prepare('SELECT * FROM study_events WHERE started_at >= ? ORDER BY started_at ASC'),

    // Learn KPI cache
    getKpiCache: db.prepare('SELECT payload, computed_at FROM learn_kpis_cache WHERE scope = ?'),
    setKpiCache: db.prepare(`
      INSERT INTO learn_kpis_cache (scope, payload, computed_at) VALUES (?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET payload = excluded.payload, computed_at = excluded.computed_at
    `),
    clearKpiCache: db.prepare('DELETE FROM learn_kpis_cache'),

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
      INSERT INTO calendar_accounts (id, provider, account_email, credentials, status, last_sync_at, sync_token, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getCalendarAccountById: db.prepare('SELECT * FROM calendar_accounts WHERE id = ?'),
    getCalendarAccountsByProvider: db.prepare('SELECT * FROM calendar_accounts WHERE provider = ? ORDER BY created_at DESC'),
    getCalendarAccountsByProviderAndProject: db.prepare(
      'SELECT * FROM calendar_accounts WHERE provider = ? AND project_id = ? ORDER BY created_at DESC',
    ),
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
    getSelectedCalendarCalendarsForProject: db.prepare(`
      SELECT c.* FROM calendar_calendars c
      JOIN calendar_accounts a ON c.account_id = a.id
      WHERE a.project_id = ? AND c.is_selected = 1
      ORDER BY c.is_default DESC
    `),
    getDefaultCalendar: db.prepare('SELECT * FROM calendar_calendars WHERE is_default = 1 LIMIT 1'),
    getDefaultCalendarForProject: db.prepare(`
      SELECT c.* FROM calendar_calendars c
      JOIN calendar_accounts a ON c.account_id = a.id
      WHERE a.project_id = ? AND c.is_default = 1
      LIMIT 1
    `),
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
    getCalendarEventsByRangeForProject: db.prepare(`
      SELECT e.*, c.title as calendar_title, c.color as calendar_color
      FROM calendar_events e
      JOIN calendar_calendars c ON e.calendar_id = c.id
      JOIN calendar_accounts a ON c.account_id = a.id
      WHERE a.project_id = ? AND c.is_selected = 1 AND e.status != 'cancelled'
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
    getUpcomingCalendarEventsForProject: db.prepare(`
      SELECT e.*, c.title as calendar_title, c.color as calendar_color
      FROM calendar_events e
      JOIN calendar_calendars c ON e.calendar_id = c.id
      JOIN calendar_accounts a ON c.account_id = a.id
      WHERE a.project_id = ? AND c.is_selected = 1 AND e.status != 'cancelled'
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

    // Transcription sessions (redesign — single unified pipeline)
    insertTranscriptionSession: db.prepare(`
      INSERT INTO transcription_sessions
        (id, project_id, folder_id, status, sources, live_preview, save_audio, session_dir, partial_text, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
    `),
    updateTranscriptionSessionStatus: db.prepare(`
      UPDATE transcription_sessions
      SET status = ?, updated_at = ?, error_message = ?
      WHERE id = ?
    `),
    appendTranscriptionPartial: db.prepare(`
      UPDATE transcription_sessions
      SET partial_text = partial_text || ?, updated_at = ?
      WHERE id = ?
    `),
    finalizeTranscriptionSession: db.prepare(`
      UPDATE transcription_sessions
      SET status = 'done', resource_id = ?, finished_at = ?, updated_at = ?
      WHERE id = ?
    `),
    getTranscriptionSession: db.prepare(`
      SELECT * FROM transcription_sessions WHERE id = ?
    `),
    getStaleTranscriptionSessions: db.prepare(`
      SELECT * FROM transcription_sessions
      WHERE status IN ('recording','paused','transcribing')
      ORDER BY started_at ASC
    `),
    deleteTranscriptionSession: db.prepare(`
      DELETE FROM transcription_sessions WHERE id = ?
    `),

    // Transcription chunks
    insertTranscriptionChunk: db.prepare(`
      INSERT OR REPLACE INTO transcription_chunks
        (session_id, seq, track, start_ms, duration_ms, file_path, text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateTranscriptionChunkText: db.prepare(`
      UPDATE transcription_chunks SET text = ? WHERE session_id = ? AND track = ? AND seq = ?
    `),
    listSessionChunks: db.prepare(`
      SELECT * FROM transcription_chunks
      WHERE session_id = ?
      ORDER BY track ASC, seq ASC
    `),

    // Artifacts
    createArtifact: db.prepare(`
      INSERT INTO artifacts (id, resource_id, artifact_type, template, state, linked_resource_id, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `),
    getArtifactByResourceId: db.prepare('SELECT * FROM artifacts WHERE resource_id = ?'),
    getArtifactById: db.prepare('SELECT * FROM artifacts WHERE id = ?'),
    listArtifactsByProject: db.prepare(`
      SELECT a.* FROM artifacts a
      JOIN resources r ON a.resource_id = r.id
      WHERE r.project_id = ?
      ORDER BY a.updated_at DESC
    `),
    updateArtifactState: db.prepare(`
      UPDATE artifacts SET state = ?, version = version + 1, updated_at = ? WHERE resource_id = ?
    `),
    updateArtifact: db.prepare(`
      UPDATE artifacts
      SET artifact_type = ?, template = ?, state = ?, linked_resource_id = ?, version = version + 1, updated_at = ?
      WHERE resource_id = ?
    `),
    deleteArtifact: db.prepare('DELETE FROM artifacts WHERE resource_id = ?'),
    getArtifactsLinkedToResource: db.prepare('SELECT * FROM artifacts WHERE linked_resource_id = ?'),

    // Artifact runtime payloads (DOME_DATA slots) + automation → artifact sinks
    getArtifactRuntimeDataByArtifactSlot: db.prepare(`
      SELECT * FROM artifact_runtime_data WHERE artifact_id = ? AND slot = ?
    `),
    listArtifactRuntimeDataByArtifact: db.prepare(`
      SELECT * FROM artifact_runtime_data WHERE artifact_id = ?
    `),
    upsertArtifactRuntimeData: db.prepare(`
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
    deleteArtifactRuntimeDataByArtifact: db.prepare('DELETE FROM artifact_runtime_data WHERE artifact_id = ?'),

    listAutomationArtifactBindings: db.prepare(`
      SELECT * FROM automation_artifact_bindings WHERE automation_id = ? ORDER BY created_at ASC
    `),
    insertAutomationArtifactBinding: db.prepare(`
      INSERT INTO automation_artifact_bindings (
        id, automation_id, artifact_resource_id, slot, update_policy, transform_hint, extract_mode, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    deleteAutomationArtifactBindingsByAutomation: db.prepare(`
      DELETE FROM automation_artifact_bindings WHERE automation_id = ?
    `),
    getAutomationArtifactBindingById: db.prepare('SELECT * FROM automation_artifact_bindings WHERE id = ?'),

    // Artifact feeders (sandbox scripts → runtime data)
    createFeeder: db.prepare(`
      INSERT INTO feeders (
        id, artifact_resource_id, slot, name, description, interpreter, script, script_hash,
        env_secret_refs, env_static, output_mode, update_policy, timeout_ms, enabled, approved,
        approved_script_hash, last_run_at, last_status, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getFeederById: db.prepare('SELECT * FROM feeders WHERE id = ?'),
    listFeedersByArtifact: db.prepare(`
      SELECT * FROM feeders WHERE artifact_resource_id = ? ORDER BY updated_at DESC
    `),
    listAllFeeders: db.prepare(`
      SELECT * FROM feeders ORDER BY updated_at DESC
    `),
    countRunningFeederRunsByAutomation: db.prepare(`
      SELECT COUNT(*) AS c FROM feeder_runs WHERE automation_id = ? AND status = 'running'
    `),
    updateFeederScript: db.prepare(`
      UPDATE feeders
      SET script = ?, script_hash = ?, approved = ?, approved_script_hash = ?, updated_at = ?
      WHERE id = ?
    `),
    approveFeeder: db.prepare(`
      UPDATE feeders SET approved = ?, approved_script_hash = ?, updated_at = ? WHERE id = ?
    `),
    updateFeederLastRun: db.prepare(`
      UPDATE feeders SET last_run_at = ?, last_status = ?, last_error = ?, updated_at = ? WHERE id = ?
    `),
    deleteFeeder: db.prepare('DELETE FROM feeders WHERE id = ?'),
    createFeederSecret: db.prepare(`
      INSERT INTO feeder_secrets (id, name, encrypted_value, last_used_at, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?)
    `),
    updateFeederSecret: db.prepare(`
      UPDATE feeder_secrets SET encrypted_value = ?, updated_at = ? WHERE id = ?
    `),
    getFeederSecretByName: db.prepare('SELECT * FROM feeder_secrets WHERE name = ?'),
    listFeederSecrets: db.prepare('SELECT id, name, last_used_at, created_at, updated_at FROM feeder_secrets ORDER BY name ASC'),
    touchFeederSecretUsed: db.prepare('UPDATE feeder_secrets SET last_used_at = ? WHERE id = ?'),
    deleteFeederSecret: db.prepare('DELETE FROM feeder_secrets WHERE id = ?'),
    createFeederRun: db.prepare(`
      INSERT INTO feeder_runs (
        id, feeder_id, started_at, finished_at, status, exit_code, stdout_excerpt, stderr_excerpt,
        data_bytes, triggered_by, automation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateFeederRun: db.prepare(`
      UPDATE feeder_runs
      SET finished_at = ?, status = ?, exit_code = ?, stdout_excerpt = ?, stderr_excerpt = ?, data_bytes = ?
      WHERE id = ?
    `),
    listFeederRuns: db.prepare(`
      SELECT * FROM feeder_runs WHERE feeder_id = ? ORDER BY started_at DESC LIMIT ?
    `),

    // Pipelines (Kanban) — migration 52
    createPipeline: db.prepare(`
      INSERT INTO pipelines (id, project_id, name, description, icon_index, color, folder_id, archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getPipelineById: db.prepare('SELECT * FROM pipelines WHERE id = ?'),
    listPipelinesByProject: db.prepare(`
      SELECT * FROM pipelines WHERE project_id = ? AND archived = 0 ORDER BY updated_at DESC
    `),
    updatePipeline: db.prepare(`
      UPDATE pipelines
      SET name = ?, description = ?, icon_index = ?, color = ?, folder_id = ?, archived = ?, updated_at = ?
      WHERE id = ?
    `),
    deletePipeline: db.prepare('DELETE FROM pipelines WHERE id = ?'),

    // Pipeline stages
    createPipelineStage: db.prepare(`
      INSERT INTO pipeline_stages (
        id, pipeline_id, project_id, title, position, execution_policy, assigned_agent_id,
        assigned_workflow_id, run_input_template, provider, model, is_terminal, wip_limit,
        config_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getPipelineStageById: db.prepare('SELECT * FROM pipeline_stages WHERE id = ?'),
    listStagesByPipeline: db.prepare(`
      SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY position ASC, created_at ASC
    `),
    updatePipelineStage: db.prepare(`
      UPDATE pipeline_stages
      SET title = ?, position = ?, execution_policy = ?, assigned_agent_id = ?, assigned_workflow_id = ?,
          run_input_template = ?, provider = ?, model = ?, is_terminal = ?, wip_limit = ?, config_json = ?, updated_at = ?
      WHERE id = ?
    `),
    updatePipelineStagePosition: db.prepare('UPDATE pipeline_stages SET position = ?, updated_at = ? WHERE id = ?'),
    deletePipelineStage: db.prepare('DELETE FROM pipeline_stages WHERE id = ?'),

    // Pipeline sources
    createPipelineSource: db.prepare(`
      INSERT INTO pipeline_sources (
        id, pipeline_id, project_id, name, source_type, config_json, target_stage_id,
        enabled, last_sync_at, last_sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getPipelineSourceById: db.prepare('SELECT * FROM pipeline_sources WHERE id = ?'),
    listSourcesByPipeline: db.prepare(`
      SELECT * FROM pipeline_sources WHERE pipeline_id = ? ORDER BY created_at ASC
    `),
    updatePipelineSource: db.prepare(`
      UPDATE pipeline_sources
      SET name = ?, source_type = ?, config_json = ?, target_stage_id = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `),
    updatePipelineSourceSync: db.prepare(`
      UPDATE pipeline_sources SET last_sync_at = ?, last_sync_status = ?, updated_at = ? WHERE id = ?
    `),
    deletePipelineSource: db.prepare('DELETE FROM pipeline_sources WHERE id = ?'),

    // Pipeline items (cards)
    createPipelineItem: db.prepare(`
      INSERT INTO pipeline_items (
        id, pipeline_id, project_id, stage_id, source_id, title, position, data_json, exec_status,
        assigned_kind, assigned_agent_id, current_run_id, last_output, start_at, end_at,
        calendar_event_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getPipelineItemById: db.prepare('SELECT * FROM pipeline_items WHERE id = ?'),
    getPipelineItemByRunId: db.prepare('SELECT * FROM pipeline_items WHERE current_run_id = ?'),
    listItemsByPipeline: db.prepare(`
      SELECT * FROM pipeline_items WHERE pipeline_id = ? ORDER BY stage_id ASC, position ASC, created_at ASC
    `),
    listItemsByStage: db.prepare(`
      SELECT * FROM pipeline_items WHERE stage_id = ? ORDER BY position ASC, created_at ASC
    `),
    updatePipelineItem: db.prepare(`
      UPDATE pipeline_items
      SET stage_id = ?, source_id = ?, title = ?, position = ?, data_json = ?, exec_status = ?,
          assigned_kind = ?, assigned_agent_id = ?, current_run_id = ?, last_output = ?,
          start_at = ?, end_at = ?, calendar_event_id = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `),
    updatePipelineItemStageAndPosition: db.prepare(`
      UPDATE pipeline_items SET stage_id = ?, position = ?, updated_at = ? WHERE id = ?
    `),
    updatePipelineItemExecStatus: db.prepare(`
      UPDATE pipeline_items SET exec_status = ?, assigned_kind = ?, current_run_id = ?, last_output = ?, updated_at = ? WHERE id = ?
    `),
    updatePipelineItemCalendar: db.prepare(`
      UPDATE pipeline_items SET calendar_event_id = ?, updated_at = ? WHERE id = ?
    `),
    deletePipelineItem: db.prepare('DELETE FROM pipeline_items WHERE id = ?'),

    // Pipeline item events (activity log — migration 53)
    createPipelineItemEvent: db.prepare(`
      INSERT INTO pipeline_item_events (id, item_id, project_id, event_type, actor, summary, detail_json, run_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    listPipelineItemEvents: db.prepare(`
      SELECT * FROM pipeline_item_events WHERE item_id = ? ORDER BY created_at ASC
    `),

    // Social hub (migration 59) — accounts, posts, metrics
    createSocialAccount: db.prepare(`
      INSERT INTO social_accounts (
        id, provider, account_kind, display_name, handle, external_id, credentials, scopes,
        status, last_error, connected_at, last_sync_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSocialAccountById: db.prepare('SELECT * FROM social_accounts WHERE id = ?'),
    listSocialAccounts: db.prepare('SELECT * FROM social_accounts ORDER BY created_at ASC'),
    listSocialAccountsByProvider: db.prepare(`
      SELECT * FROM social_accounts WHERE provider = ? ORDER BY created_at ASC
    `),
    updateSocialAccountProfile: db.prepare(`
      UPDATE social_accounts SET display_name = ?, handle = ?, external_id = ?, updated_at = ? WHERE id = ?
    `),
    updateSocialAccountCredentials: db.prepare(`
      UPDATE social_accounts SET credentials = ?, scopes = ?, status = ?, last_error = ?, updated_at = ? WHERE id = ?
    `),
    updateSocialAccountStatus: db.prepare(`
      UPDATE social_accounts SET status = ?, last_error = ?, updated_at = ? WHERE id = ?
    `),
    touchSocialAccountSync: db.prepare(`
      UPDATE social_accounts SET last_sync_at = ?, updated_at = ? WHERE id = ?
    `),
    updateSocialAccountCloudPublishing: db.prepare(`
      UPDATE social_accounts SET cloud_publishing = ?, updated_at = ? WHERE id = ?
    `),
    updateSocialPostMediaStorage: db.prepare(`
      UPDATE social_posts SET media_storage = ?, updated_at = ? WHERE id = ?
    `),
    deleteSocialAccount: db.prepare('DELETE FROM social_accounts WHERE id = ?'),

    createSocialCampaign: db.prepare(`
      INSERT INTO social_campaigns (id, name, goal, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getSocialCampaignById: db.prepare('SELECT * FROM social_campaigns WHERE id = ?'),
    getSocialCampaignByName: db.prepare('SELECT * FROM social_campaigns WHERE name = ?'),
    updateSocialCampaign: db.prepare(`
      UPDATE social_campaigns SET name = ?, goal = ?, status = ?, updated_at = ? WHERE id = ?
    `),
    listSocialCampaigns: db.prepare(`
      SELECT * FROM social_campaigns ORDER BY
        CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC
    `),
    listSocialCampaignsByStatus: db.prepare(`
      SELECT * FROM social_campaigns WHERE status = ? ORDER BY updated_at DESC
    `),
    countSocialPostsByCampaignId: db.prepare(`
      SELECT status, COUNT(*) AS c FROM social_posts WHERE campaign_id = ? GROUP BY status
    `),

    createSocialPost: db.prepare(`
      INSERT INTO social_posts (
        id, account_id, provider, status, body, media, link_url, topics, campaign, campaign_id,
        scheduled_at, published_at, external_post_id, external_url, error,
        created_by, group_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getSocialPostById: db.prepare('SELECT * FROM social_posts WHERE id = ?'),
    updateSocialPostContent: db.prepare(`
      UPDATE social_posts
      SET account_id = ?, body = ?, media = ?, link_url = ?, topics = ?, campaign = ?, campaign_id = ?,
          scheduled_at = ?, status = ?, updated_at = ?
      WHERE id = ?
    `),
    updateSocialPostPublishResult: db.prepare(`
      UPDATE social_posts
      SET status = ?, published_at = ?, external_post_id = ?, external_url = ?, error = ?, updated_at = ?
      WHERE id = ?
    `),
    listSocialPosts: db.prepare(`
      SELECT * FROM social_posts ORDER BY COALESCE(scheduled_at, published_at, created_at) DESC LIMIT ?
    `),
    listSocialPostsByStatus: db.prepare(`
      SELECT * FROM social_posts WHERE status = ? ORDER BY COALESCE(scheduled_at, published_at, created_at) DESC LIMIT ?
    `),
    listSocialPostsByGroup: db.prepare('SELECT * FROM social_posts WHERE group_id = ? ORDER BY created_at ASC'),
    listDueSocialPosts: db.prepare(`
      SELECT * FROM social_posts WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
    `),
    listRecentPublishedSocialPosts: db.prepare(`
      SELECT * FROM social_posts WHERE status = 'published' AND published_at >= ?
      ORDER BY published_at DESC LIMIT ?
    `),
    deleteSocialPost: db.prepare('DELETE FROM social_posts WHERE id = ?'),
    countSocialPostsByStatus: db.prepare('SELECT status, COUNT(*) AS c FROM social_posts GROUP BY status'),

    insertSocialMetric: db.prepare(`
      INSERT INTO social_metrics (
        id, post_id, captured_at, impressions, likes, comments, shares, saves, clicks, followers, raw, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getLatestSocialMetricForPost: db.prepare(`
      SELECT * FROM social_metrics WHERE post_id = ? ORDER BY captured_at DESC LIMIT 1
    `),
    listSocialMetricsForPost: db.prepare(`
      SELECT * FROM social_metrics WHERE post_id = ? ORDER BY captured_at ASC
    `),
    listLatestSocialMetrics: db.prepare(`
      SELECT m.* FROM social_metrics m
      JOIN (
        SELECT post_id, MAX(captured_at) AS max_at FROM social_metrics GROUP BY post_id
      ) latest ON latest.post_id = m.post_id AND latest.max_at = m.captured_at
    `),

    insertSocialAccountMetric: db.prepare(`
      INSERT INTO social_account_metrics (
        id, account_id, captured_at, followers, following, posts_count, raw, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getLatestSocialAccountMetric: db.prepare(`
      SELECT * FROM social_account_metrics WHERE account_id = ? ORDER BY captured_at DESC LIMIT 1
    `),
    listSocialAccountMetrics: db.prepare(`
      SELECT * FROM social_account_metrics WHERE account_id = ? AND captured_at >= ?
      ORDER BY captured_at ASC
    `),
    listLatestSocialAccountMetrics: db.prepare(`
      SELECT m.* FROM social_account_metrics m
      JOIN (
        SELECT account_id, MAX(captured_at) AS max_at FROM social_account_metrics GROUP BY account_id
      ) latest ON latest.account_id = m.account_id AND latest.max_at = m.captured_at
    `),

    createSocialReport: db.prepare(`
      INSERT INTO social_reports (
        id, status, trigger, period_days, title, content, model, error, data, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateSocialReportResult: db.prepare(`
      UPDATE social_reports
      SET status = ?, title = ?, content = ?, model = ?, error = ?, data = ?, completed_at = ?
      WHERE id = ?
    `),
    getSocialReportById: db.prepare('SELECT * FROM social_reports WHERE id = ?'),
    listSocialReports: db.prepare('SELECT * FROM social_reports ORDER BY created_at DESC LIMIT ?'),
    getLatestSocialReportByTrigger: db.prepare(`
      SELECT * FROM social_reports WHERE trigger = ? ORDER BY created_at DESC LIMIT 1
    `),
    deleteSocialReport: db.prepare('DELETE FROM social_reports WHERE id = ?'),
  };
}

module.exports = { buildQueries };
