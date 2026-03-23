/* eslint-disable no-console */
const crypto = require('crypto');
const resourceIndexer = require('../resource-indexer.cjs');

function register({ ipcMain, windowManager, database, fileStorage, validateSender, initModule, ollamaService }) {
  const indexerDeps = { database, fileStorage, windowManager, initModule, ollamaService };

  function parseJson(raw, fallback) {
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

  function serializeManyAgent(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      systemInstructions: row.system_instructions || '',
      toolIds: parseJson(row.tool_ids, []),
      mcpServerIds: parseJson(row.mcp_server_ids, []),
      skillIds: parseJson(row.skill_ids, []),
      iconIndex: row.icon_index,
      marketplaceId: row.marketplace_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function serializeWorkflow(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      nodes: parseJson(row.nodes_json, []),
      edges: parseJson(row.edges_json, []),
      marketplace: row.marketplace_json ? parseJson(row.marketplace_json, null) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function serializeWorkflowExecution(row) {
    if (!row) return null;
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      startedAt: row.started_at,
      finishedAt: row.finished_at || undefined,
      status: row.status,
      entries: parseJson(row.entries_json, []),
      nodeOutputs: row.node_outputs_json ? parseJson(row.node_outputs_json, {}) : undefined,
    };
  }

  function serializeMcpServer(row) {
    if (!row) return null;
    return {
      name: row.name,
      type: row.type,
      command: row.command || undefined,
      args: parseJson(row.args_json, []),
      url: row.url || undefined,
      headers: row.headers_json ? parseJson(row.headers_json, {}) : undefined,
      env: row.env_json ? parseJson(row.env_json, {}) : undefined,
      enabled: row.enabled !== 0,
      tools: row.tools_json ? parseJson(row.tools_json, []) : undefined,
      enabledToolIds: row.enabled_tool_ids_json ? parseJson(row.enabled_tool_ids_json, []) : undefined,
      lastDiscoveryAt: row.last_discovery_at || undefined,
      lastDiscoveryError: row.last_discovery_error ?? undefined,
    };
  }

  function serializeSkill(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      prompt: row.prompt || '',
      enabled: row.enabled !== 0,
    };
  }

  function serializeMarketplaceAgentInstall(row) {
    if (!row) return null;
    return {
      marketplaceId: row.marketplace_id,
      localAgentId: row.local_agent_id,
      version: row.version || 'unknown',
      author: row.author || 'Unknown',
      source: row.source || 'official',
      installedAt: row.installed_at,
      updatedAt: row.updated_at,
      capabilities: parseJson(row.capabilities_json, []),
      resourceAffinity: parseJson(row.resource_affinity_json, []),
    };
  }

  function serializeMarketplaceWorkflowInstall(row) {
    if (!row) return null;
    return {
      templateId: row.template_id,
      localWorkflowId: row.local_workflow_id,
      version: row.version || 'unknown',
      author: row.author || 'Unknown',
      source: row.source || 'official',
      installedAt: row.installed_at,
      updatedAt: row.updated_at,
      capabilities: parseJson(row.capabilities_json, []),
      resourceAffinity: parseJson(row.resource_affinity_json, []),
    };
  }

  // Projects
  ipcMain.handle('db:projects:create', (event, project) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.createProject.run(
        project.id,
        project.name,
        project.description || null,
        project.parent_id || null,
        project.created_at,
        project.updated_at
      );

      // Broadcast evento a todas las ventanas
      windowManager.broadcast('project:created', project);

      return { success: true, data: project };
    } catch (error) {
      console.error('[DB] Error creating project:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:projects:getAll', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const projects = queries.getProjects.all();
      return { success: true, data: projects };
    } catch (error) {
      console.error('[DB] Error getting projects:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:projects:getById', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const project = queries.getProjectById.get(id);
      return { success: true, data: project };
    } catch (error) {
      console.error('[DB] Error getting project:', error);
      return { success: false, error: error.message };
    }
  });

  // Resources
  ipcMain.handle('db:resources:create', (event, resource) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.createResource.run(
        resource.id,
        resource.project_id,
        resource.type,
        resource.title,
        resource.content || null,
        resource.file_path || null,
        resource.folder_id ?? null,
        resource.metadata ? JSON.stringify(resource.metadata) : null,
        resource.created_at,
        resource.updated_at
      );

      // Broadcast evento a todas las ventanas
      windowManager.broadcast('resource:created', resource);

      if (indexerDeps && resourceIndexer.shouldIndex(resource)) {
        resourceIndexer.scheduleIndexing(resource.id, indexerDeps);
      }

      return { success: true, data: resource };
    } catch (error) {
      console.error('[DB] Error creating resource:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:resources:getByProject', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resources = queries.getResourcesByProject.all(projectId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting resources:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:resources:getById', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(id);
      return { success: true, data: resource };
    } catch (error) {
      console.error('[DB] Error getting resource:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:resources:update', (event, resource) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = queries.getResourceById.get(resource.id);
      if (!current) {
        return { success: false, error: 'Resource not found' };
      }

      // Merge partial updates: only overwrite fields explicitly provided
      // Fallbacks ensure we never pass null to NOT NULL columns (e.g. title)
      const mergedTitle = (resource.title !== undefined ? resource.title : current.title) ?? 'Untitled';
      const mergedContent = resource.content !== undefined ? (resource.content || null) : (current.content || null);
      let mergedMetadata = null;
      if (resource.metadata !== undefined) {
        mergedMetadata = typeof resource.metadata === 'object' && resource.metadata !== null
          ? JSON.stringify(resource.metadata)
          : resource.metadata;
      } else {
        mergedMetadata = current.metadata;
      }
      const mergedUpdatedAt = resource.updated_at !== undefined ? resource.updated_at : current.updated_at;

      queries.updateResource.run(mergedTitle, mergedContent, mergedMetadata, mergedUpdatedAt, resource.id);

      // Broadcast evento a todas las ventanas (merged values)
      const mergedResource = {
        ...current,
        title: mergedTitle,
        content: mergedContent,
        metadata: mergedMetadata,
        updated_at: mergedUpdatedAt,
      };
      windowManager.broadcast('resource:updated', {
        id: resource.id,
        updates: mergedResource,
      });

      // NOTE: We intentionally do NOT call scheduleIndexing on update.
      // Generating embeddings on every note save would exhaust heap memory (OOM).
      // Embeddings are generated once on initial resource creation only.

      return { success: true, data: mergedResource };
    } catch (error) {
      console.error('[DB] Error updating resource:', error);

      // Try to handle corruption errors
      const handled = database.handleCorruptionError(error);
      if (handled) {
        // Retry the operation after repair (merged values from above scope)
        try {
          const queries = database.getQueries();
          const current = queries.getResourceById.get(resource.id);
          if (!current) return { success: false, error: 'Resource not found' };
          const mergedTitle = (resource.title !== undefined ? resource.title : current.title) ?? 'Untitled';
          const mergedContent = resource.content !== undefined ? (resource.content || null) : (current.content || null);
          let mergedMetadata = null;
          if (resource.metadata !== undefined) {
            mergedMetadata = typeof resource.metadata === 'object' && resource.metadata !== null
              ? JSON.stringify(resource.metadata) : resource.metadata;
          } else {
            mergedMetadata = current.metadata;
          }
          const mergedUpdatedAt = resource.updated_at !== undefined ? resource.updated_at : current.updated_at;
          queries.updateResource.run(mergedTitle, mergedContent, mergedMetadata, mergedUpdatedAt, resource.id);
          const mergedResource = {
            ...current,
            title: mergedTitle,
            content: mergedContent,
            metadata: mergedMetadata,
            updated_at: mergedUpdatedAt,
          };
          windowManager.broadcast('resource:updated', { id: resource.id, updates: mergedResource });
          return { success: true, data: mergedResource };
        } catch (retryError) {
          console.error('[DB] Error retrying after repair:', retryError);
          if (retryError.code === 'SQLITE_CORRUPT' || retryError.code === 'SQLITE_CORRUPT_VTAB') {
            console.warn('[DB] Corruption persists, attempting more aggressive repair...');
            database.invalidateQueries();
            const repairedAgain = database.repairFTSTables();
            if (repairedAgain) {
              try {
                const queries = database.getQueries();
                const current = queries.getResourceById.get(resource.id);
                if (!current) return { success: false, error: 'Resource not found' };
                const mergedTitle = resource.title !== undefined ? resource.title : current.title;
                const mergedContent = resource.content !== undefined ? (resource.content || null) : (current.content || null);
                let mergedMetadata = null;
                if (resource.metadata !== undefined) {
                  mergedMetadata = typeof resource.metadata === 'object' && resource.metadata !== null
                    ? JSON.stringify(resource.metadata) : resource.metadata;
                } else {
                  mergedMetadata = current.metadata;
                }
                const mergedUpdatedAt = resource.updated_at !== undefined ? resource.updated_at : current.updated_at;
                queries.updateResource.run(mergedTitle, mergedContent, mergedMetadata, mergedUpdatedAt, resource.id);
                const mergedResource = {
                  ...current,
                  title: mergedTitle,
                  content: mergedContent,
                  metadata: mergedMetadata,
                  updated_at: mergedUpdatedAt,
                };
                windowManager.broadcast('resource:updated', { id: resource.id, updates: mergedResource });
                return { success: true, data: mergedResource };
              } catch (finalError) {
                console.error('[DB] Error after second repair attempt:', finalError);
                return { success: false, error: finalError.message };
              }
            }
          }
          return { success: false, error: retryError.message };
        }
      }

      return { success: false, error: error.message };
    }
  });

  // Search
  ipcMain.handle('db:resources:search', (event, query) => {
    try {
      validateSender(event, windowManager);
      // Validar query
      if (typeof query !== 'string') {
        throw new Error('Query must be a string');
      }
      if (query.length > 1000) {
        throw new Error('Query too long. Maximum 1000 characters');
      }
      const queries = database.getQueries();
      const results = queries.searchResources.all(query);
      return { success: true, data: results };
    } catch (error) {
      console.error('[DB] Error searching resources:', error);

      // Try to handle corruption errors
      const handled = database.handleCorruptionError(error);
      if (handled) {
        // Retry the operation after repair
        // Queries are automatically invalidated by handleCorruptionError
        try {
          const queries = database.getQueries();
          const results = queries.searchResources.all(query);
          return { success: true, data: results };
        } catch (retryError) {
          console.error('[DB] Error retrying search after repair:', retryError);
          // If it's still corrupt, try one more repair cycle
          if (retryError.code === 'SQLITE_CORRUPT' || retryError.code === 'SQLITE_CORRUPT_VTAB') {
            console.warn('[DB] Corruption persists in search, attempting more aggressive repair...');
            database.invalidateQueries();
            const repairedAgain = database.repairFTSTables();
            if (repairedAgain) {
              try {
                const queries = database.getQueries();
                const results = queries.searchResources.all(query);
                return { success: true, data: results };
              } catch (finalError) {
                console.error('[DB] Error after second repair attempt:', finalError);
                return { success: false, error: finalError.message };
              }
            }
          }
          return { success: false, error: retryError.message };
        }
      }

      return { success: false, error: error.message };
    }
  });

  // Search for mentions (quick autocomplete)
  ipcMain.handle('db:resources:searchForMention', (event, query) => {
    try {
      validateSender(event, windowManager);
      // Validar query
      if (typeof query !== 'string') {
        throw new Error('Query must be a string');
      }
      if (query.length > 200) {
        throw new Error('Query too long. Maximum 200 characters');
      }
      const queries = database.getQueries();
      const searchTerm = `%${query}%`;
      const results = queries.searchForMention.all(searchTerm, searchTerm);
      return { success: true, data: results };
    } catch (error) {
      console.error('[DB] Error searching for mentions:', error);
      return { success: false, error: error.message };
    }
  });

  // Get backlinks (resources that link to this resource)
  ipcMain.handle('db:resources:getBacklinks', (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const results = queries.getBacklinks.all(resourceId);
      return { success: true, data: results };
    } catch (error) {
      console.error('[DB] Error getting backlinks:', error);
      return { success: false, error: error.message };
    }
  });

  // Upload file and create resource (wrapper for resource:import)
  ipcMain.handle('db:resources:uploadFile', async (event, { filePath, projectId, type, title }) => {
    // This is just a convenience wrapper - the actual implementation
    // is in resource:import handler. We'll call it directly.
    // Note: We can't directly call another handler, so we'll duplicate the logic
    // or use a shared function. For now, we'll just redirect to resource:import
    // The client should call resource:import instead, but we keep this for API consistency
    try {
      validateSender(event, windowManager);
      // Import the resource using the existing handler
      // Since we can't call handlers from handlers, we'll need to extract the logic
      // For now, return an error suggesting to use resource:import
      return {
        success: false,
        error: 'Use resource:import instead',
        suggestion: 'Use window.electron.resource.import() instead'
      };
    } catch (error) {
      console.error('[DB] Error uploading file:', error);
      return { success: false, error: error.message };
    }
  });

  // Settings
  ipcMain.handle('db:settings:get', (event, key) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const result = queries.getSetting.get(key);
      return { success: true, data: result ? result.value : null };
    } catch (error) {
      console.error('[DB] Error getting setting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:settings:set', (event, key, value) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();

      queries.setSetting.run(key, value, Date.now());
      return { success: true };
    } catch (error) {
      console.error('[DB] Error setting setting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:settings:saveAI', (event, config) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();

      const { provider, apiKey, model, embeddingModel, baseURL } = config;

      if (provider) queries.setSetting.run('ai_provider', provider, Date.now());
      if (apiKey) queries.setSetting.run('ai_api_key', apiKey, Date.now());
      if (model) queries.setSetting.run('ai_model', model, Date.now());
      if (embeddingModel) queries.setSetting.run('ai_embedding_model', embeddingModel, Date.now());
      if (baseURL) queries.setSetting.run('ai_base_url', baseURL, Date.now());

      return { success: true };
    } catch (error) {
      console.error('[DB] Error saving AI settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Many agents
  ipcMain.handle('db:manyAgents:list', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: queries.listManyAgents.all().map(serializeManyAgent) };
    } catch (error) {
      console.error('[DB] Error listing many agents:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:get', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: serializeManyAgent(queries.getManyAgentById.get(id)) };
    } catch (error) {
      console.error('[DB] Error getting many agent:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:create', (event, agent) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.createManyAgent.run(
        agent.id,
        agent.name,
        agent.description || '',
        agent.systemInstructions || '',
        JSON.stringify(Array.isArray(agent.toolIds) ? agent.toolIds : []),
        JSON.stringify(Array.isArray(agent.mcpServerIds) ? agent.mcpServerIds : []),
        JSON.stringify(Array.isArray(agent.skillIds) ? agent.skillIds : []),
        agent.iconIndex || 1,
        agent.marketplaceId || null,
        agent.createdAt,
        agent.updatedAt,
      );
      windowManager.broadcast('dome:agents-changed');
      return { success: true, data: agent };
    } catch (error) {
      console.error('[DB] Error creating many agent:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:update', (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = queries.getManyAgentById.get(id);
      if (!current) return { success: false, error: 'Agent not found' };
      const next = {
        ...serializeManyAgent(current),
        ...updates,
        id,
        updatedAt: Date.now(),
      };
      queries.updateManyAgent.run(
        next.name,
        next.description || '',
        next.systemInstructions || '',
        JSON.stringify(Array.isArray(next.toolIds) ? next.toolIds : []),
        JSON.stringify(Array.isArray(next.mcpServerIds) ? next.mcpServerIds : []),
        JSON.stringify(Array.isArray(next.skillIds) ? next.skillIds : []),
        next.iconIndex || 1,
        next.marketplaceId || null,
        next.updatedAt,
        id,
      );
      windowManager.broadcast('dome:agents-changed');
      return { success: true, data: next };
    } catch (error) {
      console.error('[DB] Error updating many agent:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:delete', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const result = queries.deleteManyAgent.run(id);
      if (result.changes === 0) return { success: false, error: 'Agent not found' };
      windowManager.broadcast('dome:agents-changed');
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting many agent:', error);
      return { success: false, error: error.message };
    }
  });

  // Workflows
  ipcMain.handle('db:workflows:list', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: queries.listCanvasWorkflows.all().map(serializeWorkflow) };
    } catch (error) {
      console.error('[DB] Error listing workflows:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflows:get', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: serializeWorkflow(queries.getCanvasWorkflowById.get(id)) };
    } catch (error) {
      console.error('[DB] Error getting workflow:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflows:create', (event, workflow) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.createCanvasWorkflow.run(
        workflow.id,
        workflow.name,
        workflow.description || '',
        JSON.stringify(Array.isArray(workflow.nodes) ? workflow.nodes : []),
        JSON.stringify(Array.isArray(workflow.edges) ? workflow.edges : []),
        workflow.marketplace ? JSON.stringify(workflow.marketplace) : null,
        workflow.createdAt,
        workflow.updatedAt,
      );
      windowManager.broadcast('dome:workflows-changed');
      return { success: true, data: workflow };
    } catch (error) {
      console.error('[DB] Error creating workflow:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflows:update', (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = queries.getCanvasWorkflowById.get(id);
      if (!current) return { success: false, error: 'Workflow not found' };
      const next = {
        ...serializeWorkflow(current),
        ...updates,
        id,
        updatedAt: Date.now(),
      };
      queries.updateCanvasWorkflow.run(
        next.name,
        next.description || '',
        JSON.stringify(Array.isArray(next.nodes) ? next.nodes : []),
        JSON.stringify(Array.isArray(next.edges) ? next.edges : []),
        next.marketplace ? JSON.stringify(next.marketplace) : null,
        next.updatedAt,
        id,
      );
      windowManager.broadcast('dome:workflows-changed');
      return { success: true, data: next };
    } catch (error) {
      console.error('[DB] Error updating workflow:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflows:delete', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const result = queries.deleteCanvasWorkflow.run(id);
      if (result.changes === 0) return { success: false, error: 'Workflow not found' };
      windowManager.broadcast('dome:workflows-changed');
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting workflow:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowExecutions:save', (event, execution) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const updatedAt = execution.finishedAt || execution.startedAt || Date.now();
      queries.upsertWorkflowExecution.run(
        execution.id,
        execution.workflowId,
        execution.workflowName,
        execution.startedAt,
        execution.finishedAt || null,
        execution.status,
        JSON.stringify(Array.isArray(execution.entries) ? execution.entries : []),
        execution.nodeOutputs ? JSON.stringify(execution.nodeOutputs) : null,
        updatedAt,
      );
      queries.trimWorkflowExecutions.run(execution.workflowId, execution.workflowId, 50);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error saving workflow execution:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowExecutions:listByWorkflow', (event, workflowId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return {
        success: true,
        data: queries.listWorkflowExecutionsByWorkflow.all(workflowId).map(serializeWorkflowExecution),
      };
    } catch (error) {
      console.error('[DB] Error listing workflow executions:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowExecutions:get', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: serializeWorkflowExecution(queries.getWorkflowExecutionById.get(id)) };
    } catch (error) {
      console.error('[DB] Error getting workflow execution:', error);
      return { success: false, error: error.message };
    }
  });

  // MCP
  ipcMain.handle('db:mcp:list', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: queries.listMcpServers.all().map(serializeMcpServer) };
    } catch (error) {
      console.error('[DB] Error listing MCP servers:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:mcp:replaceAll', (event, servers) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const tx = database.getDB().transaction((items) => {
        queries.deleteAllMcpServers.run();
        for (const server of items) {
          const serverId = normalizeServerId(server.name) || crypto.randomUUID();
          queries.createMcpServer.run(
            serverId,
            server.name,
            server.type === 'http' || server.type === 'sse' ? server.type : 'stdio',
            server.command || null,
            JSON.stringify(Array.isArray(server.args) ? server.args : []),
            server.url || null,
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
      });
      tx(Array.isArray(servers) ? servers : []);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing MCP servers:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:mcp:getGlobalEnabled', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const row = queries.getMcpGlobalSettings.get();
      return { success: true, data: row ? row.enabled !== 0 : true };
    } catch (error) {
      console.error('[DB] Error reading MCP global settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:mcp:setGlobalEnabled', (event, enabled) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      queries.upsertMcpGlobalSettings.run(enabled ? 1 : 0, Date.now());
      return { success: true };
    } catch (error) {
      console.error('[DB] Error updating MCP global settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Skills
  ipcMain.handle('db:skills:list', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: queries.listAiSkills.all().map(serializeSkill) };
    } catch (error) {
      console.error('[DB] Error listing skills:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:skills:replaceAll', (event, skills) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const tx = database.getDB().transaction((items) => {
        queries.deleteAllAiSkills.run();
        for (const skill of items) {
          queries.createAiSkill.run(
            skill.id,
            skill.name,
            skill.description || '',
            skill.prompt || '',
            skill.enabled === false ? 0 : 1,
            now,
            now,
          );
        }
      });
      tx(Array.isArray(skills) ? skills : []);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing skills:', error);
      return { success: false, error: error.message };
    }
  });

  // Marketplace persistence
  ipcMain.handle('db:marketplace:getAgentInstalls', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const rows = queries.listMarketplaceAgentInstalls.all();
      const data = {};
      for (const row of rows) {
        const record = serializeMarketplaceAgentInstall(row);
        data[record.marketplaceId] = record;
      }
      return { success: true, data };
    } catch (error) {
      console.error('[DB] Error reading marketplace agent installs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:marketplace:replaceAgentInstalls', (event, records) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const tx = database.getDB().transaction((nextRecords) => {
        queries.deleteAllMarketplaceAgentInstalls.run();
        for (const [marketplaceId, record] of Object.entries(nextRecords || {})) {
          if (!record || typeof record.localAgentId !== 'string') continue;
          queries.upsertMarketplaceAgentInstall.run(
            marketplaceId,
            record.localAgentId,
            record.version || null,
            record.author || null,
            record.source || null,
            record.installedAt || Date.now(),
            record.updatedAt || Date.now(),
            JSON.stringify(Array.isArray(record.capabilities) ? record.capabilities : []),
            JSON.stringify(Array.isArray(record.resourceAffinity) ? record.resourceAffinity : []),
          );
        }
      });
      tx(records || {});
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing marketplace agent installs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:marketplace:getWorkflowInstalls', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const rows = queries.listMarketplaceWorkflowInstalls.all();
      const data = {};
      for (const row of rows) {
        const record = serializeMarketplaceWorkflowInstall(row);
        data[record.templateId] = record;
      }
      return { success: true, data };
    } catch (error) {
      console.error('[DB] Error reading marketplace workflow installs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:marketplace:replaceWorkflowInstalls', (event, records) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const tx = database.getDB().transaction((nextRecords) => {
        queries.deleteAllMarketplaceWorkflowInstalls.run();
        for (const [templateId, record] of Object.entries(nextRecords || {})) {
          if (!record || typeof record.localWorkflowId !== 'string') continue;
          queries.upsertMarketplaceWorkflowInstall.run(
            templateId,
            record.localWorkflowId,
            record.version || null,
            record.author || null,
            record.source || null,
            record.installedAt || Date.now(),
            record.updatedAt || Date.now(),
            JSON.stringify(Array.isArray(record.capabilities) ? record.capabilities : []),
            JSON.stringify(Array.isArray(record.resourceAffinity) ? record.resourceAffinity : []),
          );
        }
      });
      tx(records || {});
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing marketplace workflow installs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:marketplace:getTemplateMappings', (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const rows = queries.listMarketplaceTemplateMappings.all();
      const data = {};
      for (const row of rows) {
        data[row.template_id] = row.workflow_id;
      }
      return { success: true, data };
    } catch (error) {
      console.error('[DB] Error reading marketplace template mappings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:marketplace:replaceTemplateMappings', (event, mapping) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const tx = database.getDB().transaction((nextMapping) => {
        queries.deleteAllMarketplaceTemplateMappings.run();
        for (const [templateId, workflowId] of Object.entries(nextMapping || {})) {
          if (typeof workflowId !== 'string') continue;
          queries.upsertMarketplaceTemplateMapping.run(templateId, workflowId, Date.now());
        }
      });
      tx(mapping || {});
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing marketplace template mappings:', error);
      return { success: false, error: error.message };
    }
  });

  // Unified search
  ipcMain.handle('db:search:unified', (event, query) => {
    // Validate and sanitize query BEFORE the try block so retry catch blocks can use it
    validateSender(event, windowManager);
    if (typeof query !== 'string') {
      return { success: false, error: 'Query must be a string' };
    }
    if (query.length > 1000) {
      return { success: false, error: 'Query too long. Maximum 1000 characters' };
    }

    // Sanitize query for FTS5 — quote each term to prevent special chars
    // (like /, -, etc.) from being interpreted as FTS5 operators
    const sanitizedQuery = query
      .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ')  // Replace special chars with spaces
      .split(/\s+/)
      .filter(term => term.length > 0)
      .map(term => `"${term}"`)
      .join(' ');

    if (!sanitizedQuery) {
      return {
        success: true,
        data: { resources: [], interactions: [], studioOutputs: [] },
      };
    }

    try {
      const queries = database.getQueries();

      // Search resources
      const resourceResults = queries.searchResources.all(sanitizedQuery);

      // Search interactions
      const interactionResults = queries.searchInteractions.all(sanitizedQuery);

      // Enrich resources: add parent resources for interactions that matched
      // but whose resource did not match in FTS (e.g. match only in annotation)
      const resourceIds = new Set(resourceResults.map((r) => r.id));
      for (const interaction of interactionResults) {
        const rid = interaction.resource_id;
        if (rid && !resourceIds.has(rid)) {
          const resource = queries.getResourceById.get(rid);
          if (resource) {
            resourceResults.push(resource);
            resourceIds.add(rid);
          }
        }
      }

      // Search studio outputs (study materials) by title/content
      const rawTerms = query.replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ').split(/\s+/).filter((t) => t.length > 0);
      let studioResults = [];
      if (rawTerms.length > 0) {
        try {
          const db = database.getDB();
          const placeholders = rawTerms.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
          const params = rawTerms.flatMap((t) => [`%${t}%`, `%${t}%`]);
          const stmt = db.prepare(
            `SELECT * FROM studio_outputs WHERE ${placeholders} ORDER BY updated_at DESC LIMIT 15`
          );
          studioResults = stmt.all(...params) || [];
        } catch (studioErr) {
          console.warn('[DB] Studio search failed:', studioErr);
        }
      }

      return {
        success: true,
        data: {
          resources: resourceResults,
          interactions: interactionResults,
          studioOutputs: studioResults,
        },
      };
    } catch (error) {
      console.error('[DB] Error in unified search:', error);

      // Try to handle corruption errors
      const handled = database.handleCorruptionError(error);
      if (handled) {
        // Retry the operation after repair
        // Queries are automatically invalidated by handleCorruptionError
        try {
          const queries = database.getQueries();
          const resourceResults = queries.searchResources.all(sanitizedQuery);
          const interactionResults = queries.searchInteractions.all(sanitizedQuery);

          const resourceIds = new Set(resourceResults.map((r) => r.id));
          for (const interaction of interactionResults) {
            const rid = interaction.resource_id;
            if (rid && !resourceIds.has(rid)) {
              const resource = queries.getResourceById.get(rid);
              if (resource) {
                resourceResults.push(resource);
                resourceIds.add(rid);
              }
            }
          }

          const rawTerms = query.replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ').split(/\s+/).filter((t) => t.length > 0);
          let studioResults = [];
          if (rawTerms.length > 0) {
            try {
              const db = database.getDB();
              const placeholders = rawTerms.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
              const params = rawTerms.flatMap((t) => [`%${t}%`, `%${t}%`]);
              const stmt = db.prepare(
                `SELECT * FROM studio_outputs WHERE ${placeholders} ORDER BY updated_at DESC LIMIT 15`
              );
              studioResults = stmt.all(...params) || [];
            } catch {
              /* ignore */
            }
          }

          return {
            success: true,
            data: {
              resources: resourceResults,
              interactions: interactionResults,
              studioOutputs: studioResults,
            },
          };
        } catch (retryError) {
          console.error('[DB] Error retrying unified search after repair:', retryError);
          // If it's still corrupt, try one more repair cycle
          if (retryError.code === 'SQLITE_CORRUPT' || retryError.code === 'SQLITE_CORRUPT_VTAB') {
            console.warn('[DB] Corruption persists in unified search, attempting more aggressive repair...');
            database.invalidateQueries();
            const repairedAgain = database.repairFTSTables();
            if (repairedAgain) {
              try {
                const queries = database.getQueries();
                const resourceResults = queries.searchResources.all(sanitizedQuery);
                const interactionResults = queries.searchInteractions.all(sanitizedQuery);

                const resourceIds = new Set(resourceResults.map((r) => r.id));
                for (const interaction of interactionResults) {
                  const rid = interaction.resource_id;
                  if (rid && !resourceIds.has(rid)) {
                    const resource = queries.getResourceById.get(rid);
                    if (resource) {
                      resourceResults.push(resource);
                      resourceIds.add(rid);
                    }
                  }
                }

                return {
                  success: true,
                  data: {
                    resources: resourceResults,
                    interactions: interactionResults,
                  },
                };
              } catch (finalError) {
                console.error('[DB] Error after second repair attempt:', finalError);
                return { success: false, error: finalError.message };
              }
            }
          }
          return { success: false, error: retryError.message };
        }
      }

      return { success: false, error: error.message };
    }
  });

  // Get all resources (for Command Center)
  ipcMain.handle('db:resources:getAll', (event, limit = 100) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resources = queries.getAllResources.all(limit);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting all resources:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete resource
  ipcMain.handle('db:resources:delete', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      // Get resource to find internal_path
      const resource = queries.getResourceById.get(id);
      if (resource && resource.internal_path) {
        // Delete the internal file
        fileStorage.deleteFile(resource.internal_path);
      }
      // Delete from database
      queries.deleteResource.run(id);

      if (indexerDeps) {
        resourceIndexer.deleteEmbeddings(id, indexerDeps).catch((err) => {
          console.warn('[DB] Error deleting embeddings:', err.message);
        });
      }

      // Broadcast evento a todas las ventanas
      windowManager.broadcast('resource:deleted', { id });

      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting resource:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // FOLDER CONTAINMENT IPC HANDLERS
  // ============================================

  // Get resources in a folder
  ipcMain.handle('db:resources:getByFolder', (event, folderId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resources = queries.getResourcesByFolder.all(folderId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting resources by folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Get root resources (not in any folder)
  ipcMain.handle('db:resources:getRoot', (event, projectId = 'default') => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resources = queries.getRootResources.all(projectId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting root resources:', error);
      return { success: false, error: error.message };
    }
  });

  // Move resource to a folder
  ipcMain.handle('db:resources:moveToFolder', (event, { resourceId, folderId }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();

      // Verify the folder exists and is actually a folder
      if (folderId) {
        const folder = queries.getResourceById.get(folderId);
        if (!folder) {
          return { success: false, error: 'Folder not found' };
        }
        if (folder.type !== 'folder') {
          return { success: false, error: 'Target is not a folder' };
        }
        // Prevent moving folder into itself
        if (resourceId === folderId) {
          return { success: false, error: 'Cannot move folder into itself' };
        }
      }

      queries.moveResourceToFolder.run(folderId || null, Date.now(), resourceId);

      // Broadcast evento a todas las ventanas
      windowManager.broadcast('resource:updated', {
        id: resourceId,
        updates: { folder_id: folderId, updated_at: Date.now() }
      });

      return { success: true };
    } catch (error) {
      console.error('[DB] Error moving resource to folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Remove resource from folder (move to root)
  ipcMain.handle('db:resources:removeFromFolder', (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      queries.removeResourceFromFolder.run(now, resourceId);

      // Broadcast so Home and other windows update immediately
      windowManager.broadcast('resource:updated', {
        id: resourceId,
        updates: { folder_id: null, updated_at: now },
      });

      return { success: true };
    } catch (error) {
      console.error('[DB] Error removing resource from folder:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
