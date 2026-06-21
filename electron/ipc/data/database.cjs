/* eslint-disable no-console */
const crypto = require('crypto');
const kbShared = require('../../agents/kb-llm-shared.cjs');
const semanticIndexScheduler = require('../../storage/semantic-index-scheduler.cjs');
const vaultStore = require('../../storage/vault-store.cjs');
const lancedbSemantic = require('../../services/lancedb-semantic.cjs');
const autoMetadata = require('../../ai/auto-metadata.cjs');
const { isSecretSettingKey, readSettingSecret, writeSettingSecret, maskSettingForRenderer, isMaskedSecret } = require('../../core/settings-secrets.cjs');

function register({ ipcMain, windowManager, database, fileStorage, validateSender, initModule, ollamaService }) {
  semanticIndexScheduler.init(database);
  const indexerDeps = { database, fileStorage, windowManager, initModule, ollamaService };

  function parseJson(raw, fallback) {
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  /**
   * Semantic reindex (debounced) when: metadata.dome_kb.reindexOnSave, or KB LLM is enabled for
   * the project and autoReindexWikiOnSave is true in global settings.
   * See docs/indexing.md and docs/kb-llm-wiki-model.md.
   */
  async function maybeScheduleKbReindex(resourceId, mergedResource, current) {
    try {
      const queries = database.getQueries();
      const meta = parseJson(mergedResource.metadata, {});
      const candidate = { ...current, ...mergedResource, type: current.type };
      if (!semanticIndexScheduler.shouldIndex(candidate)) return;

      const global = { ...kbShared.defaultGlobalConfig(), ...parseJson((await queries.getSetting.get(kbShared.KB_GLOBAL_KEY))?.value, {}) };
      const projectId = current.project_id;
      const ov = parseJson((await queries.getSetting.get(kbShared.projectKey(projectId)))?.value, {});
      const kbActive = kbShared.effectiveKbEnabled(global, ov);
      const autoAll = kbActive && global.autoReindexWikiOnSave === true;
      const explicit = meta.dome_kb?.reindexOnSave === true;
      if (!explicit && !autoAll) return;

      semanticIndexScheduler.scheduleSemanticReindex(resourceId);
    } catch (e) {
      console.warn('[DB] maybeScheduleKbReindex:', e?.message || e);
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
      folderId: row.folder_id != null ? row.folder_id : undefined,
      favorite: row.favorite === 1 || row.favorite === true,
      projectId: row.project_id ?? 'default',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function serializeAgentFolderRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      parentId: row.parent_id != null ? row.parent_id : null,
      name: row.name,
      sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
      projectId: row.project_id ?? 'default',
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
      folderId: row.folder_id != null ? row.folder_id : undefined,
      projectId: row.project_id ?? 'default',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function serializeWorkflowFolderRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      parentId: row.parent_id != null ? row.parent_id : null,
      name: row.name,
      sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
      projectId: row.project_id ?? 'default',
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
  ipcMain.handle('db:projects:create', async (event, project) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      await queries.createProject.run(
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

  ipcMain.handle('db:projects:getAll', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const projects = await queries.getProjects.all();
      return { success: true, data: projects };
    } catch (error) {
      console.error('[DB] Error getting projects:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:projects:getById', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const project = await queries.getProjectById.get(id);
      return { success: true, data: project };
    } catch (error) {
      console.error('[DB] Error getting project:', error);
      return { success: false, error: error.message };
    }
  });

  // Set (or clear) a project's custom Markdown vault root. Moves existing note
  // .md files to the new location and (re)watches it for external edits.
  ipcMain.handle('db:projects:setVaultRoot', async (event, args) => {
    try {
      validateSender(event, windowManager);
      const projectId = args?.projectId;
      const vaultRoot = args?.vaultRoot;
      if (!projectId) return { success: false, error: 'projectId required' };
      const result = vaultStore.setProjectVaultRoot(projectId, vaultRoot, { database, fileStorage });
      if (result.success) {
        try { require('../../storage/vault-watcher.cjs').addRoot(result.root); } catch { /* non-fatal */ }
        windowManager.broadcast('project:updated', { id: projectId });
      }
      return result;
    } catch (error) {
      console.error('[DB] Error setting project vault root:', error);
      return { success: false, error: error.message };
    }
  });

  // Effective vault root (custom or default) for display.
  ipcMain.handle('db:projects:getVaultRoot', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const root = vaultStore.getProjectVaultRoot(projectId, database.getQueries(), fileStorage);
      const project = await database.getQueries().getProjectById.get(projectId);
      return { success: true, data: { root, custom: !!(project && project.vault_root) } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:projects:getDeletionImpact', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      return database.getProjectDeletionImpact(projectId);
    } catch (error) {
      console.error('[DB] Error project deletion impact:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:projects:deleteWithContent', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const result = database.deleteProjectWithContent(projectId);
      if (result.success) {
        windowManager.broadcast('project:deleted', { id: projectId });
      }
      return result;
    } catch (error) {
      console.error('[DB] Error deleting project:', error);
      return { success: false, error: error.message };
    }
  });

  // Resources
  ipcMain.handle('db:resources:create', async (event, resource) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      await queries.createResource.run(
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

      // Seed the plain-text cache for notes created with content (e.g. by an
      // AI tool) so FTS/preview/semantic search show readable text immediately.
      // The .md mirror is written on first open/edit.
      if (resource.type === 'note' && resource.content) {
        try {
          const { extractPlainTextFromProseMirror, stripTags } = require('../../services/resource-text.cjs');
          const raw = String(resource.content || '');
          let text = '';
          if (raw.trim().startsWith('{')) {
            try { text = extractPlainTextFromProseMirror(JSON.parse(raw)); } catch { /* fall through */ }
          }
          if (!text) text = stripTags(raw);
          if (text) await database.getDB().run('UPDATE resources SET content_text = ? WHERE id = ?', [text, resource.id]);
        } catch { /* non-fatal */ }
      }

      // Broadcast evento a todas las ventanas
      windowManager.broadcast('resource:created', resource);

      semanticIndexScheduler.scheduleSemanticReindex(resource.id);

      autoMetadata.scheduleCloudAutoMetadata(resource.id, { database, fileStorage, windowManager });

      return { success: true, data: resource };
    } catch (error) {
      console.error('[DB] Error creating resource:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:resources:getByProject', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resources = await queries.getResourcesByProject.all(projectId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting resources:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:resources:getById', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resource = await queries.getResourceById.get(id);
      return { success: true, data: resource };
    } catch (error) {
      console.error('[DB] Error getting resource:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Find or create a minimal `url` resource for a canonical HTTP(S) URL (same project as source).
   */
  ipcMain.handle('db:resources:ensureUrl', async (event, payload) => {
    try {
      validateSender(event, windowManager);
      const urlRaw = typeof payload === 'string' ? payload : payload?.url;
      const sourceResourceId =
        typeof payload === 'object' && payload && typeof payload.sourceResourceId === 'string'
          ? payload.sourceResourceId
          : null;
      if (typeof urlRaw !== 'string' || !urlRaw.trim()) {
        return { success: false, error: 'Invalid URL' };
      }
      let canonical;
      try {
        const u = new URL(urlRaw.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return { success: false, error: 'Only http(s) URLs are supported' };
        }
        canonical = u.href;
      } catch {
        return { success: false, error: 'Invalid URL' };
      }

      const queries = database.getQueries();
      if (!queries.findUrlResourceByCanonicalUrl) {
        return { success: false, error: 'URL lookup not available' };
      }

      const existing = await queries.findUrlResourceByCanonicalUrl.get(canonical, canonical);
      if (existing) {
        return { success: true, data: existing };
      }

      if (!sourceResourceId) {
        return { success: false, error: 'sourceResourceId required to create URL resource' };
      }

      const source = await queries.getResourceById.get(sourceResourceId);
      if (!source) {
        return { success: false, error: 'Source resource not found' };
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      let title = 'Link';
      try {
        const u = new URL(canonical);
        const host = u.hostname.replace(/^www\./i, '');
        let path = u.pathname === '/' ? '' : u.pathname;
        if (path.length > 48) path = `${path.slice(0, 45)}…`;
        title = `${host}${path}`;
        if (title.length > 96) title = `${title.slice(0, 93)}…`;
      } catch {
        /* keep default */
      }

      const metadata = JSON.stringify({ url: canonical });
      await queries.createResource.run(
        id,
        source.project_id,
        'url',
        title,
        canonical,
        null,
        null,
        metadata,
        now,
        now
      );

      const created = await queries.getResourceById.get(id);
      if (created) {
        windowManager.broadcast('resource:created', created);
        semanticIndexScheduler.scheduleSemanticReindex(id);
      }

      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error ensureUrl:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:resources:update', async (event, resource) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = await queries.getResourceById.get(resource.id);
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

      await queries.updateResource.run(mergedTitle, mergedContent, mergedMetadata, mergedUpdatedAt, resource.id);

      // Vault reconciliation: keep the on-disk Markdown tree + search caches in
      // sync with this DB write (covers AI/tool edits as well as renderer saves).
      try {
        if (current.type === 'folder') {
          if (resource.title !== undefined && resource.title !== current.title) {
            vaultStore.relocateDescendants(resource.id, { database, fileStorage });
          }
        } else if (current.type === 'note') {
          // Refresh the plain-text cache from the (possibly AI-updated) Tiptap
          // JSON so FTS/semantic search stay current. The renderer additionally
          // writes the .md via notes:writeMirror; AI edits rely on this refresh
          // and the .md is regenerated on the next editor save.
          if (resource.content !== undefined) {
            try {
              const { extractPlainTextFromProseMirror, stripTags } = require('../../services/resource-text.cjs');
              const raw = String(mergedContent || '');
              let text = '';
              if (raw.trim().startsWith('{')) {
                try { text = extractPlainTextFromProseMirror(JSON.parse(raw)); } catch { /* fall through */ }
              }
              if (!text) text = stripTags(raw);
              await database.getDB().run('UPDATE resources SET content_text = ? WHERE id = ?', [text, resource.id]);
            } catch { /* non-fatal */ }
          }
          if (resource.title !== undefined && resource.title !== current.title) {
            vaultStore.relocateResource(resource.id, { database, fileStorage });
          }
        }
      } catch (e) { console.warn('[DB] vault reconcile (update) failed:', e?.message); }

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

      await maybeScheduleKbReindex(resource.id, mergedResource, current);
      semanticIndexScheduler.scheduleSemanticReindex(resource.id);

      return { success: true, data: mergedResource };
    } catch (error) {
      console.error('[DB] Error updating resource:', error);

      // Try to handle corruption errors
      const handled = database.handleCorruptionError(error);
      if (handled) {
        // Retry the operation after repair (merged values from above scope)
        try {
          const queries = database.getQueries();
          const current = await queries.getResourceById.get(resource.id);
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
          await queries.updateResource.run(mergedTitle, mergedContent, mergedMetadata, mergedUpdatedAt, resource.id);
          const mergedResource = {
            ...current,
            title: mergedTitle,
            content: mergedContent,
            metadata: mergedMetadata,
            updated_at: mergedUpdatedAt,
          };
          windowManager.broadcast('resource:updated', { id: resource.id, updates: mergedResource });
          await maybeScheduleKbReindex(resource.id, mergedResource, current);
          semanticIndexScheduler.scheduleSemanticReindex(resource.id);
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
                const current = await queries.getResourceById.get(resource.id);
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
                await queries.updateResource.run(mergedTitle, mergedContent, mergedMetadata, mergedUpdatedAt, resource.id);
                const mergedResource = {
                  ...current,
                  title: mergedTitle,
                  content: mergedContent,
                  metadata: mergedMetadata,
                  updated_at: mergedUpdatedAt,
                };
                windowManager.broadcast('resource:updated', { id: resource.id, updates: mergedResource });
                await maybeScheduleKbReindex(resource.id, mergedResource, current);
                semanticIndexScheduler.scheduleSemanticReindex(resource.id);
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
  ipcMain.handle('db:resources:search', async (event, query) => {
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
      const results = await queries.searchResources.all(query);
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
          const results = await queries.searchResources.all(query);
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
                const results = await queries.searchResources.all(query);
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
  ipcMain.handle('db:resources:searchForMention', async (event, query, projectId) => {
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
      // Mentions are hard-scoped to the active project when provided.
      const results =
        typeof projectId === 'string' && projectId
          ? await queries.searchForMentionByProject.all(searchTerm, searchTerm, projectId)
          : await queries.searchForMention.all(searchTerm, searchTerm);
      return { success: true, data: results };
    } catch (error) {
      console.error('[DB] Error searching for mentions:', error);
      return { success: false, error: error.message };
    }
  });

  // Get backlinks (resources that link to this resource)
  ipcMain.handle('db:resources:getBacklinks', async (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const results = await queries.getBacklinks.all(resourceId);
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
  ipcMain.handle('db:settings:get', async (event, key) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (isSecretSettingKey(key)) {
        const masked = maskSettingForRenderer(queries, key);
        return { success: true, data: masked, hasSecret: Boolean(masked) };
      }
      const result = await queries.getSetting.get(key);
      return { success: true, data: result ? result.value : null };
    } catch (error) {
      console.error('[DB] Error getting setting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:settings:set', async (event, key, value) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (isSecretSettingKey(key)) {
        // A masked display value (sk-…abc4) means "unchanged" — writing it
        // would destroy the stored secret.
        if (!isMaskedSecret(value)) writeSettingSecret(queries, key, value);
      } else {
        await queries.setSetting.run(key, value, Date.now());
      }
      return { success: true };
    } catch (error) {
      console.error('[DB] Error setting setting:', error);
      return { success: false, error: error.message };
    }
  });

  // Which AI providers have a stored API key (for the provider picker UI).
  ipcMain.handle('db:settings:aiProviderKeyStatus', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const { hasProviderApiKey } = require('../../ai/provider-keys.cjs');
      const providers = ['openai', 'anthropic', 'google', 'minimax', 'openrouter', 'deepseek', 'moonshot', 'qwen', 'opencode', 'opencode-go'];
      const status = {};
      for (const p of providers) status[p] = hasProviderApiKey(queries, p);
      return { success: true, data: status };
    } catch (error) {
      console.error('[DB] Error getting provider key status:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:settings:saveAI', async (event, config) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();

      const { provider, apiKey, model, embeddingModel, baseURL } = config;
      const { writeProviderApiKey, writeProviderBaseUrl, KEYLESS_PROVIDERS } = require('../../ai/provider-keys.cjs');

      if (provider) await queries.setSetting.run('ai_provider', provider, Date.now());
      const targetProvider = provider || (await queries.getSetting.get('ai_provider'))?.value;
      if (apiKey && !isMaskedSecret(apiKey) && targetProvider && !KEYLESS_PROVIDERS.has(targetProvider)) {
        // Per-provider slot (cambiar de provider conserva cada clave); la
        // ai_api_key legacy compartida se mantiene para lectores antiguos.
        writeProviderApiKey(queries, targetProvider, apiKey);
        writeSettingSecret(queries, 'ai_api_key', apiKey);
      }
      if (model) await queries.setSetting.run('ai_model', model, Date.now());
      if (embeddingModel) await queries.setSetting.run('ai_embedding_model', embeddingModel, Date.now());
      if (baseURL && targetProvider) writeProviderBaseUrl(queries, targetProvider, baseURL);
      if (baseURL) await queries.setSetting.run('ai_base_url', baseURL, Date.now());

      return { success: true };
    } catch (error) {
      console.error('[DB] Error saving AI settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Many agents
  ipcMain.handle('db:manyAgents:list', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      return { success: true, data: (await queries.listManyAgents.all(pid)).map(serializeManyAgent) };
    } catch (error) {
      console.error('[DB] Error listing many agents:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:get', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: serializeManyAgent(await queries.getManyAgentById.get(id)) };
    } catch (error) {
      console.error('[DB] Error getting many agent:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:create', async (event, agent) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const favorite = agent.favorite === true ? 1 : 0;
      const projectId = agent.projectId && String(agent.projectId).trim() ? String(agent.projectId).trim() : 'default';
      await queries.createManyAgent.run(
        agent.id,
        projectId,
        agent.name,
        agent.description || '',
        agent.systemInstructions || '',
        JSON.stringify(Array.isArray(agent.toolIds) ? agent.toolIds : []),
        JSON.stringify(Array.isArray(agent.mcpServerIds) ? agent.mcpServerIds : []),
        JSON.stringify(Array.isArray(agent.skillIds) ? agent.skillIds : []),
        agent.iconIndex || 1,
        agent.marketplaceId || null,
        agent.folderId != null && agent.folderId !== '' ? agent.folderId : null,
        favorite,
        agent.createdAt,
        agent.updatedAt,
      );
      windowManager.broadcast('dome:agents-changed');
      return {
        success: true,
        data: serializeManyAgent(await queries.getManyAgentById.get(agent.id)),
      };
    } catch (error) {
      console.error('[DB] Error creating many agent:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:update', async (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = await queries.getManyAgentById.get(id);
      if (!current) return { success: false, error: 'Agent not found' };

      // Snapshot current state as a new version before applying the update.
      const snapshotChanged =
        (updates.name !== undefined && updates.name !== current.name) ||
        (updates.systemInstructions !== undefined &&
          updates.systemInstructions !== current.system_instructions) ||
        (updates.mcpServerIds !== undefined &&
          JSON.stringify(updates.mcpServerIds) !== (current.mcp_server_ids ?? '[]'));
      if (snapshotChanged) {
        try {
          const latestRow = await queries.getLatestAgentVersion.get(id);
          const nextVersion = (latestRow?.max_version ?? 0) + 1;
          await queries.createAgentVersion.run(
            crypto.randomUUID(),
            id,
            nextVersion,
            current.name,
            current.description ?? '',
            current.system_instructions ?? '',
            current.tool_ids ?? '[]',
            current.mcp_server_ids ?? '[]',
            current.skill_ids ?? '[]',
            current.icon_index ?? 1,
            updates._changeNote ?? null,
            Date.now(),
          );
        } catch (vErr) {
          console.warn('[DB] Could not snapshot agent version (table may not exist yet):', vErr?.message);
        }
      }

      const next = {
        ...serializeManyAgent(current),
        ...updates,
        id,
        updatedAt: Date.now(),
      };
      const folderId =
        next.folderId !== undefined
          ? next.folderId && next.folderId !== ''
            ? next.folderId
            : null
          : current.folder_id != null
            ? current.folder_id
            : null;
      const favorite =
        next.favorite !== undefined ? (next.favorite === true ? 1 : 0) : current.favorite === 1 ? 1 : 0;
      const projectId =
        next.projectId !== undefined && String(next.projectId || '').trim()
          ? String(next.projectId).trim()
          : current.project_id ?? 'default';
      await queries.updateManyAgent.run(
        projectId,
        next.name,
        next.description || '',
        next.systemInstructions || '',
        JSON.stringify(Array.isArray(next.toolIds) ? next.toolIds : []),
        JSON.stringify(Array.isArray(next.mcpServerIds) ? next.mcpServerIds : []),
        JSON.stringify(Array.isArray(next.skillIds) ? next.skillIds : []),
        next.iconIndex || 1,
        next.marketplaceId || null,
        folderId,
        favorite,
        next.updatedAt,
        id,
      );
      windowManager.broadcast('dome:agents-changed');
      return { success: true, data: serializeManyAgent(await queries.getManyAgentById.get(id)) };
    } catch (error) {
      console.error('[DB] Error updating many agent:', error);
      return { success: false, error: error.message };
    }
  });

  // Agent version history
  ipcMain.handle('db:manyAgents:listVersions', async (event, agentId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const rows = await queries.listAgentVersions.all(agentId);
      return { success: true, data: rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        versionNumber: r.version_number,
        name: r.name,
        description: r.description ?? '',
        systemInstructions: r.system_instructions ?? '',
        toolIds: parseJson(r.tool_ids, []),
        mcpServerIds: parseJson(r.mcp_server_ids, []),
        skillIds: parseJson(r.skill_ids, []),
        iconIndex: r.icon_index,
        changeNote: r.change_note ?? null,
        createdAt: r.created_at,
      }))};
    } catch (error) {
      console.error('[DB] Error listing agent versions:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:restoreVersion', async (event, agentId, versionId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const ver = await queries.getAgentVersionById.get(versionId);
      if (!ver || ver.agent_id !== agentId) return { success: false, error: 'Version not found' };
      const current = await queries.getManyAgentById.get(agentId);
      if (!current) return { success: false, error: 'Agent not found' };

      // Snapshot current state before restoring
      const latestRow = await queries.getLatestAgentVersion.get(agentId);
      const nextVersion = (latestRow?.max_version ?? 0) + 1;
      await queries.createAgentVersion.run(
        crypto.randomUUID(),
        agentId,
        nextVersion,
        current.name,
        current.description ?? '',
        current.system_instructions ?? '',
        current.tool_ids ?? '[]',
        current.mcp_server_ids ?? '[]',
        current.skill_ids ?? '[]',
        current.icon_index ?? 1,
        `Auto-snapshot before restoring to v${ver.version_number}`,
        Date.now(),
      );

      // Apply the restored version
      const folderId = current.folder_id ?? null;
      const favorite = current.favorite ?? 0;
      const projectId = current.project_id ?? 'default';
      await queries.updateManyAgent.run(
        projectId,
        ver.name,
        ver.description ?? '',
        ver.system_instructions ?? '',
        ver.tool_ids ?? '[]',
        ver.mcp_server_ids ?? '[]',
        ver.skill_ids ?? '[]',
        ver.icon_index ?? 1,
        current.marketplace_id ?? null,
        folderId,
        favorite,
        Date.now(),
        agentId,
      );
      windowManager.broadcast('dome:agents-changed');
      return { success: true, data: serializeManyAgent(await queries.getManyAgentById.get(agentId)) };
    } catch (error) {
      console.error('[DB] Error restoring agent version:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:manyAgents:delete', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const result = await queries.deleteManyAgent.run(id);
      if (result.changes === 0) return { success: false, error: 'Agent not found' };
      windowManager.broadcast('dome:agents-changed');
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting many agent:', error);
      return { success: false, error: error.message };
    }
  });

  // Agent folders
  ipcMain.handle('db:agentFolders:list', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      return { success: true, data: (await queries.listAgentFolders.all(pid)).map(serializeAgentFolderRow) };
    } catch (error) {
      console.error('[DB] Error listing agent folders:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:agentFolders:create', async (event, folder) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const pid = folder.projectId && String(folder.projectId).trim() ? String(folder.projectId).trim() : 'default';
      await queries.createAgentFolder.run(
        folder.id,
        pid,
        folder.parentId != null && folder.parentId !== '' ? folder.parentId : null,
        String(folder.name || 'Carpeta').trim() || 'Carpeta',
        typeof folder.sortOrder === 'number' ? folder.sortOrder : 0,
        folder.createdAt ?? now,
        folder.updatedAt ?? now,
      );
      windowManager.broadcast('dome:agents-changed');
      return { success: true, data: serializeAgentFolderRow(await queries.getAgentFolderById.get(folder.id)) };
    } catch (error) {
      console.error('[DB] Error creating agent folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:agentFolders:update', async (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = await queries.getAgentFolderById.get(id);
      if (!current) return { success: false, error: 'Folder not found' };
      const parentId =
        updates.parentId !== undefined
          ? updates.parentId && updates.parentId !== ''
            ? updates.parentId
            : null
          : current.parent_id;
      const name =
        updates.name !== undefined
          ? String(updates.name || '').trim() || current.name
          : current.name;
      const sortOrder =
        updates.sortOrder !== undefined ? updates.sortOrder : current.sort_order ?? 0;
      const now = Date.now();
      await queries.updateAgentFolder.run(parentId, name, sortOrder, now, id);
      windowManager.broadcast('dome:agents-changed');
      return { success: true, data: serializeAgentFolderRow(await queries.getAgentFolderById.get(id)) };
    } catch (error) {
      console.error('[DB] Error updating agent folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:agentFolders:delete', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const result = database.deleteAgentFolderCascade(id);
      if (!result.success) return result;
      windowManager.broadcast('dome:agents-changed');
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting agent folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Workflows
  ipcMain.handle('db:workflows:list', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      return { success: true, data: (await queries.listCanvasWorkflows.all(pid)).map(serializeWorkflow) };
    } catch (error) {
      console.error('[DB] Error listing workflows:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflows:get', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: serializeWorkflow(await queries.getCanvasWorkflowById.get(id)) };
    } catch (error) {
      console.error('[DB] Error getting workflow:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflows:create', async (event, workflow) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = workflow.projectId && String(workflow.projectId).trim() ? String(workflow.projectId).trim() : 'default';
      await queries.createCanvasWorkflow.run(
        workflow.id,
        pid,
        workflow.name,
        workflow.description || '',
        JSON.stringify(Array.isArray(workflow.nodes) ? workflow.nodes : []),
        JSON.stringify(Array.isArray(workflow.edges) ? workflow.edges : []),
        workflow.marketplace ? JSON.stringify(workflow.marketplace) : null,
        workflow.folderId != null && workflow.folderId !== '' ? workflow.folderId : null,
        workflow.createdAt,
        workflow.updatedAt,
      );
      windowManager.broadcast('dome:workflows-changed');
      return {
        success: true,
        data: serializeWorkflow(await queries.getCanvasWorkflowById.get(workflow.id)),
      };
    } catch (error) {
      console.error('[DB] Error creating workflow:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflows:update', async (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = await queries.getCanvasWorkflowById.get(id);
      if (!current) return { success: false, error: 'Workflow not found' };
      const next = {
        ...serializeWorkflow(current),
        ...updates,
        id,
        updatedAt: Date.now(),
      };
      const folderId =
        next.folderId !== undefined
          ? next.folderId && next.folderId !== ''
            ? next.folderId
            : null
          : current.folder_id != null
            ? current.folder_id
            : null;
      const wfProjectId =
        next.projectId !== undefined && String(next.projectId || '').trim()
          ? String(next.projectId).trim()
          : current.project_id ?? 'default';
      await queries.updateCanvasWorkflow.run(
        wfProjectId,
        next.name,
        next.description || '',
        JSON.stringify(Array.isArray(next.nodes) ? next.nodes : []),
        JSON.stringify(Array.isArray(next.edges) ? next.edges : []),
        next.marketplace ? JSON.stringify(next.marketplace) : null,
        folderId,
        next.updatedAt,
        id,
      );
      windowManager.broadcast('dome:workflows-changed');
      return { success: true, data: serializeWorkflow(await queries.getCanvasWorkflowById.get(id)) };
    } catch (error) {
      console.error('[DB] Error updating workflow:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflows:delete', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const result = await queries.deleteCanvasWorkflow.run(id);
      if (result.changes === 0) return { success: false, error: 'Workflow not found' };
      windowManager.broadcast('dome:workflows-changed');
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting workflow:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowFolders:list', async (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      return { success: true, data: (await queries.listWorkflowFolders.all(pid)).map(serializeWorkflowFolderRow) };
    } catch (error) {
      console.error('[DB] Error listing workflow folders:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowFolders:create', async (event, folder) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const pid = folder.projectId && String(folder.projectId).trim() ? String(folder.projectId).trim() : 'default';
      await queries.createWorkflowFolder.run(
        folder.id,
        pid,
        folder.parentId != null && folder.parentId !== '' ? folder.parentId : null,
        String(folder.name || 'Carpeta').trim() || 'Carpeta',
        typeof folder.sortOrder === 'number' ? folder.sortOrder : 0,
        folder.createdAt ?? now,
        folder.updatedAt ?? now,
      );
      windowManager.broadcast('dome:workflows-changed');
      return {
        success: true,
        data: serializeWorkflowFolderRow(await queries.getWorkflowFolderById.get(folder.id)),
      };
    } catch (error) {
      console.error('[DB] Error creating workflow folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowFolders:update', async (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = await queries.getWorkflowFolderById.get(id);
      if (!current) return { success: false, error: 'Folder not found' };
      const parentId =
        updates.parentId !== undefined
          ? updates.parentId && updates.parentId !== ''
            ? updates.parentId
            : null
          : current.parent_id;
      const name =
        updates.name !== undefined
          ? String(updates.name || '').trim() || current.name
          : current.name;
      const sortOrder =
        updates.sortOrder !== undefined ? updates.sortOrder : current.sort_order ?? 0;
      const now = Date.now();
      await queries.updateWorkflowFolder.run(parentId, name, sortOrder, now, id);
      windowManager.broadcast('dome:workflows-changed');
      return { success: true, data: serializeWorkflowFolderRow(await queries.getWorkflowFolderById.get(id)) };
    } catch (error) {
      console.error('[DB] Error updating workflow folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowFolders:delete', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const result = database.deleteWorkflowFolderCascade(id);
      if (!result.success) return result;
      windowManager.broadcast('dome:workflows-changed');
      return { success: true };
    } catch (error) {
      console.error('[DB] Error deleting workflow folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowExecutions:save', async (event, execution) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const updatedAt = execution.finishedAt || execution.startedAt || Date.now();
      let projectId = execution.projectId ?? execution.project_id ?? 'default';
      if ((!execution.projectId && !execution.project_id) && execution.workflowId) {
        const wf = await queries.getCanvasWorkflowById.get(execution.workflowId);
        projectId = wf?.project_id ?? 'default';
      }
      await queries.upsertWorkflowExecution.run(
        execution.id,
        execution.workflowId,
        projectId,
        execution.workflowName,
        execution.startedAt,
        execution.finishedAt || null,
        execution.status,
        JSON.stringify(Array.isArray(execution.entries) ? execution.entries : []),
        execution.nodeOutputs ? JSON.stringify(execution.nodeOutputs) : null,
        updatedAt,
      );
      await queries.trimWorkflowExecutions.run(execution.workflowId, execution.workflowId, 50);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error saving workflow execution:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowExecutions:listByWorkflow', async (event, workflowId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return {
        success: true,
        data: (await queries.listWorkflowExecutionsByWorkflow.all(workflowId)).map(serializeWorkflowExecution),
      };
    } catch (error) {
      console.error('[DB] Error listing workflow executions:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowExecutions:get', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: serializeWorkflowExecution(await queries.getWorkflowExecutionById.get(id)) };
    } catch (error) {
      console.error('[DB] Error getting workflow execution:', error);
      return { success: false, error: error.message };
    }
  });

  // MCP
  ipcMain.handle('db:mcp:list', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: (await queries.listMcpServers.all()).map(serializeMcpServer) };
    } catch (error) {
      console.error('[DB] Error listing MCP servers:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:mcp:replaceAll', async (event, servers) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
await database.getDB().transaction(async (items) => {
        await queries.deleteAllMcpServers.run();
        for (const server of items) {
          const serverId = normalizeServerId(server.name) || crypto.randomUUID();
          await queries.createMcpServer.run(
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
      })(Array.isArray(servers) ? servers : []);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing MCP servers:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:mcp:getGlobalEnabled', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const row = await queries.getMcpGlobalSettings.get();
      return { success: true, data: row ? row.enabled !== 0 : true };
    } catch (error) {
      console.error('[DB] Error reading MCP global settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:mcp:setGlobalEnabled', async (event, enabled) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      await queries.upsertMcpGlobalSettings.run(enabled ? 1 : 0, Date.now());
      return { success: true };
    } catch (error) {
      console.error('[DB] Error updating MCP global settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Skills
  ipcMain.handle('db:skills:list', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      return { success: true, data: (await queries.listAiSkills.all()).map(serializeSkill) };
    } catch (error) {
      console.error('[DB] Error listing skills:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:skills:replaceAll', async (event, skills) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      await database.getDB().transaction(async (items) => {
        await queries.deleteAllAiSkills.run();
        for (const skill of items) {
          await queries.createAiSkill.run(
            skill.id,
            skill.name,
            skill.description || '',
            skill.prompt || '',
            skill.enabled === false ? 0 : 1,
            now,
            now,
          );
        }
      })(Array.isArray(skills) ? skills : []);
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing skills:', error);
      return { success: false, error: error.message };
    }
  });

  // Marketplace persistence
  ipcMain.handle('db:marketplace:getAgentInstalls', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const rows = await queries.listMarketplaceAgentInstalls.all();
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

  ipcMain.handle('db:marketplace:replaceAgentInstalls', async (event, records) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      await database.getDB().transaction(async (nextRecords) => {
        await queries.deleteAllMarketplaceAgentInstalls.run();
        for (const [marketplaceId, record] of Object.entries(nextRecords || {})) {
          if (!record || typeof record.localAgentId !== 'string') continue;
          await queries.upsertMarketplaceAgentInstall.run(
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
      })(records || {});
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing marketplace agent installs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:marketplace:getWorkflowInstalls', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const rows = await queries.listMarketplaceWorkflowInstalls.all();
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

  ipcMain.handle('db:marketplace:replaceWorkflowInstalls', async (event, records) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      await database.getDB().transaction(async (nextRecords) => {
        await queries.deleteAllMarketplaceWorkflowInstalls.run();
        for (const [templateId, record] of Object.entries(nextRecords || {})) {
          if (!record || typeof record.localWorkflowId !== 'string') continue;
          await queries.upsertMarketplaceWorkflowInstall.run(
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
      })(records || {});
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing marketplace workflow installs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:marketplace:getTemplateMappings', async (event) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const rows = await queries.listMarketplaceTemplateMappings.all();
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

  ipcMain.handle('db:marketplace:replaceTemplateMappings', async (event, mapping) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      await database.getDB().transaction(async (nextMapping) => {
        await queries.deleteAllMarketplaceTemplateMappings.run();
        for (const [templateId, workflowId] of Object.entries(nextMapping || {})) {
          if (typeof workflowId !== 'string') continue;
          await queries.upsertMarketplaceTemplateMapping.run(templateId, workflowId, Date.now());
        }
      })(mapping || {});
      return { success: true };
    } catch (error) {
      console.error('[DB] Error replacing marketplace template mappings:', error);
      return { success: false, error: error.message };
    }
  });

  // Unified search
  //
  // Hard-scoped to a single project: when `projectId` is provided, resources,
  // interactions and studio outputs from other projects are dropped so search
  // never leaks across projects. `projectId` omitted = global (meta) search.
  const scopeUnifiedData = (data, projectId) => {
    if (typeof projectId !== 'string' || !projectId) return data;
    return {
      resources: (data.resources || []).filter((r) => r.project_id === projectId),
      interactions: (data.interactions || []).filter((i) => i.project_id === projectId),
      studioOutputs: (data.studioOutputs || []).filter((s) => s.project_id === projectId),
    };
  };

  ipcMain.handle('db:search:unified', async (event, query, projectId) => {
    // Validate and sanitize query BEFORE the try block so retry catch blocks can use it
    validateSender(event, windowManager);
    if (typeof query !== 'string') {
      return { success: false, error: 'Query must be a string' };
    }
    const scopeProjectId = typeof projectId === 'string' && projectId ? projectId : undefined;
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

      const rawTerms = query
        .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 0);
      const lanceQuery = rawTerms.join(' ');

      /** @type {any[]} */
      let resourceResults = [];
      if (lanceQuery) {
        try {
          const lexHits = await lancedbSemantic.searchLexResources(lanceQuery, 25, scopeProjectId ? { project_id: scopeProjectId } : {});
          for (const h of lexHits) {
            const r = await queries.getResourceById.get(h.id);
            if (r) resourceResults.push(r);
          }
        } catch (le) {
          console.warn('[DB] unified search Lance:', le?.message || le);
        }
      }
      if (!resourceResults.length) {
        resourceResults = await queries.searchResources.all(sanitizedQuery);
      }

      // Search interactions
      const interactionResults = await queries.searchInteractions.all(sanitizedQuery);

      // Enrich resources: add parent resources for interactions that matched
      // but whose resource did not match in FTS (e.g. match only in annotation)
      const resourceIds = new Set(resourceResults.map((r) => r.id));
      for (const interaction of interactionResults) {
        const rid = interaction.resource_id;
        if (rid && !resourceIds.has(rid)) {
          const resource = await queries.getResourceById.get(rid);
          if (resource) {
            resourceResults.push(resource);
            resourceIds.add(rid);
          }
        }
      }

      // Search studio outputs (study materials) by title/content
      let studioResults = [];
      if (rawTerms.length > 0) {
        try {
          const placeholders = rawTerms.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
          const params = rawTerms.flatMap((t) => [`%${t}%`, `%${t}%`]);
          studioResults = await database.getDB().all(
            `SELECT * FROM studio_outputs WHERE ${placeholders} ORDER BY updated_at DESC LIMIT 15`,
            params
          ) || [];
        } catch (studioErr) {
          console.warn('[DB] Studio search failed:', studioErr);
        }
      }

      return {
        success: true,
        data: scopeUnifiedData(
          {
            resources: resourceResults,
            interactions: interactionResults,
            studioOutputs: studioResults,
          },
          scopeProjectId,
        ),
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
          const resourceResults = await queries.searchResources.all(sanitizedQuery);
          const interactionResults = await queries.searchInteractions.all(sanitizedQuery);

          const resourceIds = new Set(resourceResults.map((r) => r.id));
          for (const interaction of interactionResults) {
            const rid = interaction.resource_id;
            if (rid && !resourceIds.has(rid)) {
              const resource = await queries.getResourceById.get(rid);
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
              const placeholders = rawTerms.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
              const params = rawTerms.flatMap((t) => [`%${t}%`, `%${t}%`]);
              studioResults = await database.getDB().all(
                `SELECT * FROM studio_outputs WHERE ${placeholders} ORDER BY updated_at DESC LIMIT 15`,
                params
              ) || [];
            } catch {
              /* ignore */
            }
          }

          return {
            success: true,
            data: scopeUnifiedData(
              {
                resources: resourceResults,
                interactions: interactionResults,
                studioOutputs: studioResults,
              },
              scopeProjectId,
            ),
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
                const resourceResults = await queries.searchResources.all(sanitizedQuery);
                const interactionResults = await queries.searchInteractions.all(sanitizedQuery);

                const resourceIds = new Set(resourceResults.map((r) => r.id));
                for (const interaction of interactionResults) {
                  const rid = interaction.resource_id;
                  if (rid && !resourceIds.has(rid)) {
                    const resource = await queries.getResourceById.get(rid);
                    if (resource) {
                      resourceResults.push(resource);
                      resourceIds.add(rid);
                    }
                  }
                }

                return {
                  success: true,
                  data: scopeUnifiedData(
                    {
                      resources: resourceResults,
                      interactions: interactionResults,
                    },
                    scopeProjectId,
                  ),
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
  ipcMain.handle('db:resources:getAll', async (event, limit = 100) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resources = await queries.getAllResources.all(limit);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting all resources:', error);
      return { success: false, error: error.message };
    }
  });

  // Lightweight resource list (no content / thumbnail_data) for sidebar and dashboard
  ipcMain.handle('db:resources:listLight', async (event, limit = 500, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      // Project-scoped when a projectId is provided (filters in SQL before LIMIT
      // to avoid the global-truncation leak). Omit projectId only for meta views
      // that intentionally span all projects (e.g. the Projects dashboard).
      const resources =
        typeof projectId === 'string' && projectId
          ? await queries.listResourcesLightByProject.all(projectId, limit)
          : await queries.listResourcesLight.all(limit);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error listing resources (light):', error);
      return { success: false, error: error.message };
    }
  });

  // Delete resource
  ipcMain.handle('db:resources:delete', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      // Get resource to find internal_path
      const resource = await queries.getResourceById.get(id);
      if (resource && resource.internal_path) {
        // Delete the internal file
        fileStorage.deleteFile(resource.internal_path);
      }
      // Remove the Markdown mirror from the vault (no-op for non-notes).
      try { vaultStore.removeMirrorForResource(id, { database, fileStorage }); } catch { /* non-fatal */ }
      // Delete from database
      await queries.deleteResource.run(id);

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
  ipcMain.handle('db:resources:getByFolder', async (event, folderId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resources = await queries.getResourcesByFolder.all(folderId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting resources by folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Get root resources (not in any folder)
  ipcMain.handle('db:resources:getRoot', async (event, projectId = 'default') => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const resources = await queries.getRootResources.all(projectId);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error getting root resources:', error);
      return { success: false, error: error.message };
    }
  });

  /** Collect resource id and all descendants (folder tree) for move/delete operations */
  async function collectResourceSubtreeIds(queries, rootId) {
    const ids = [];
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift();
      ids.push(id);
      const children = await queries.getResourcesByFolder.all(id);
      for (const child of children) {
        queue.push(child.id);
      }
    }
    return ids;
  }

  // Move resource (and folder subtree) to another project root (clears folder_id on root only)
  ipcMain.handle('db:resources:moveToProject', async (event, { resourceId, projectId: targetProjectId }) => {
    try {
      validateSender(event, windowManager);
      if (!resourceId || !targetProjectId) {
        return { success: false, error: 'resourceId and projectId are required' };
      }
      const queries = database.getQueries();
      const resource = await queries.getResourceById.get(resourceId);
      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }
      const project = await queries.getProjectById.get(targetProjectId);
      if (!project) {
        return { success: false, error: 'Target project not found' };
      }
      if (resource.project_id === targetProjectId) {
        return { success: true, data: { movedIds: [resourceId] } };
      }

      const subtreeIds = await collectResourceSubtreeIds(queries, resourceId);
      const snapshot = new Map();
      for (const id of subtreeIds) {
        const row = await queries.getResourceById.get(id);
        if (row) snapshot.set(id, row);
      }
      const now = Date.now();

      await database.getDB().transaction(async () => {
        for (const id of subtreeIds) {
          const prev = snapshot.get(id);
          if (!prev) continue;
          const newFolderId = id === resourceId ? null : prev.folder_id;
          await queries.moveResourceToProject.run(targetProjectId, newFolderId, now, id);
        }
      })();

      for (const id of subtreeIds) {
        const prev = snapshot.get(id);
        const newFolderId = id === resourceId ? null : prev?.folder_id ?? null;
        windowManager.broadcast('resource:updated', {
          id,
          updates: {
            project_id: targetProjectId,
            folder_id: newFolderId,
            updated_at: now,
          },
        });
      }

      return { success: true, data: { movedIds: subtreeIds } };
    } catch (error) {
      console.error('[DB] Error moving resource to project:', error);
      return { success: false, error: error.message };
    }
  });

  // Move resource to a folder
  ipcMain.handle('db:resources:moveToFolder', async (event, { resourceId, folderId }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();

      // Verify the folder exists and is actually a folder
      if (folderId) {
        const folder = await queries.getResourceById.get(folderId);
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

      await queries.moveResourceToFolder.run(folderId || null, Date.now(), resourceId);

      // Keep the on-disk vault tree in sync: move the .md (and any descendants).
      try {
        const moved = await queries.getResourceById.get(resourceId);
        if (moved?.type === 'folder') vaultStore.relocateDescendants(resourceId, { database, fileStorage });
        else vaultStore.relocateResource(resourceId, { database, fileStorage });
      } catch (e) { console.warn('[DB] vault relocate (move) failed:', e?.message); }

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
  ipcMain.handle('db:resources:removeFromFolder', async (event, resourceId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      await queries.removeResourceFromFolder.run(now, resourceId);

      try {
        const moved = await queries.getResourceById.get(resourceId);
        if (moved?.type === 'folder') vaultStore.relocateDescendants(resourceId, { database, fileStorage });
        else vaultStore.relocateResource(resourceId, { database, fileStorage });
      } catch (e) { console.warn('[DB] vault relocate (removeFromFolder) failed:', e?.message); }

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

  /** Bulk delete: expands folder subtrees, deletes deepest nodes first */
  ipcMain.handle('db:resources:bulkDelete', async (event, resourceIds) => {
    try {
      validateSender(event, windowManager);
      if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
        return { success: false, error: 'resourceIds array required' };
      }
      const queries = database.getQueries();
      const deleteSet = new Set();
      for (const rid of resourceIds) {
        if (typeof rid !== 'string' || !rid) continue;
        for (const id of await collectResourceSubtreeIds(queries, rid)) {
          deleteSet.add(id);
        }
      }
      const memo = new Map();
      async function depthInDeleteSet(id) {
        if (memo.has(id)) return memo.get(id);
        const row = await queries.getResourceById.get(id);
        if (!row?.folder_id || !deleteSet.has(row.folder_id)) {
          memo.set(id, 0);
          return 0;
        }
        const v = (await depthInDeleteSet(row.folder_id)) + 1;
        memo.set(id, v);
        return v;
      }
      for (const id of deleteSet) {
        await depthInDeleteSet(id);
      }
      const ordered = [...deleteSet].sort((a, b) => memo.get(b) - memo.get(a));

      for (const id of ordered) {
        const resource = await queries.getResourceById.get(id);
        if (resource?.internal_path) {
          try {
            fileStorage.deleteFile(resource.internal_path);
          } catch (e) {
            console.warn('[DB] bulkDelete file:', e?.message);
          }
        }
        try { vaultStore.removeMirrorForResource(id, { database, fileStorage }); } catch { /* non-fatal */ }
        await queries.deleteResource.run(id);
        windowManager.broadcast('resource:deleted', { id });
      }

      return { success: true, data: { deletedIds: ordered } };
    } catch (error) {
      console.error('[DB] Error bulk deleting resources:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
