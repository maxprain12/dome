/* eslint-disable no-console */
const crypto = require('crypto');
const kbShared = require('../../agents/kb-llm-shared.cjs');
const semanticIndexScheduler = require('../../storage/semantic-index-scheduler.cjs');
const vaultStore = require('../../storage/vault-store.cjs');
const lancedbSemantic = require('../../services/lancedb-semantic.cjs');
const autoMetadata = require('../../ai/auto-metadata.cjs');
const { isSecretSettingKey, readSettingSecret, writeSettingSecret, maskSettingForRenderer, isMaskedSecret } = require('../../core/settings-secrets.cjs');

/** Accept `{ resourceId, … }` (preload) or positional args (dev browser IPC shim). */
function pickPairPayload(arg1, arg2, keyA, keyB) {
  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
    return { [keyA]: arg1[keyA], [keyB]: arg1[keyB] };
  }
  return { [keyA]: arg1, [keyB]: arg2 };
}

function createFolderMirror(resource, { database, fileStorage }) {
  try {
    vaultStore.createFolderOnDisk(resource.id, { database, fileStorage });
  } catch (e) {
    console.warn('[DB] createFolderOnDisk failed:', e?.message);
  }
}

function seedNotePlainText(resource, database) {
  // Seed the plain-text cache for notes created with content (e.g. by an
  // AI tool) so FTS/preview/semantic search show readable text immediately.
  // The .md mirror is written on first open/edit.
  try {
    const { extractPlainTextFromProseMirror, stripTags } = require('../../services/resource-text.cjs');
    const raw = String(resource.content || '');
    let text = '';
    if (raw.trim().startsWith('{')) {
      try {
        text = extractPlainTextFromProseMirror(JSON.parse(raw));
      } catch {
        /* fall through */
      }
    }
    if (!text) text = stripTags(raw);
    if (text) {
      database
        .getDB()
        .prepare('UPDATE resources SET content_text = ? WHERE id = ?')
        .run(text, resource.id);
    }
  } catch {
    /* non-fatal */
  }
}

function mirrorResourceToDisk(resource, { database, fileStorage }) {
  // Mirror to disk right away — the workspace tree must equal the
  // filesystem, so notes/urls/notebooks get their file at creation.
  try {
    const { ensureResourceMirror } = require('../../storage/vault-sync.cjs');
    ensureResourceMirror(resource.id, { database, fileStorage });
  } catch (e) {
    console.warn('[DB] ensureResourceMirror (create) failed:', e?.message);
  }
}

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
  function maybeScheduleKbReindex(resourceId, mergedResource, current) {
    try {
      const queries = database.getQueries();
      const meta = parseJson(mergedResource.metadata, {});
      const candidate = { ...current, ...mergedResource, type: current.type };
      if (!semanticIndexScheduler.shouldIndex(candidate)) return;

      const global = { ...kbShared.defaultGlobalConfig(), ...parseJson(queries.getSetting.get(kbShared.KB_GLOBAL_KEY)?.value, {}) };
      const projectId = current.project_id;
      const ov = parseJson(queries.getSetting.get(kbShared.projectKey(projectId))?.value, {});
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

  // Set (or clear) a project's custom Markdown vault root. Moves existing note
  // .md files to the new location and (re)watches it for external edits.
  ipcMain.handle('db:projects:setVaultRoot', (event, args) => {
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
  ipcMain.handle('db:projects:getVaultRoot', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const root = vaultStore.getProjectVaultRoot(projectId, database.getQueries(), fileStorage);
      const project = database.getQueries().getProjectById.get(projectId);
      return { success: true, data: { root, custom: !!(project && project.vault_root) } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:projects:getDeletionImpact', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      return database.getProjectDeletionImpact(projectId);
    } catch (error) {
      console.error('[DB] Error project deletion impact:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:projects:deleteWithContent', (event, projectId) => {
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

      if (resource.type === 'folder') {
        createFolderMirror(resource, { database, fileStorage });
      }

      // Seed the plain-text cache for notes created with content (e.g. by an
      // AI tool) so FTS/preview/semantic search show readable text immediately.
      // The .md mirror is written on first open/edit.
      if (resource.type === 'note' && resource.content) {
        seedNotePlainText(resource, database);
      }

      // Mirror to disk right away — the workspace tree must equal the
      // filesystem, so notes/urls/notebooks get their file at creation.
      if (['note', 'url', 'notebook'].includes(resource.type)) {
        mirrorResourceToDisk(resource, { database, fileStorage });
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

  /**
   * Find or create a minimal `url` resource for a canonical HTTP(S) URL (same project as source).
   */
  ipcMain.handle('db:resources:ensureUrl', (event, payload) => {
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

      const existing = queries.findUrlResourceByCanonicalUrl.get(canonical, canonical);
      if (existing) {
        return { success: true, data: existing };
      }

      if (!sourceResourceId) {
        return { success: false, error: 'sourceResourceId required to create URL resource' };
      }

      const source = queries.getResourceById.get(sourceResourceId);
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
      queries.createResource.run(
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

      const created = queries.getResourceById.get(id);
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

      // Vault reconciliation: keep the on-disk Markdown tree + search caches in
      // sync with this DB write (covers AI/tool edits as well as renderer saves).
      try {
        if (current.type === 'folder') {
          if (
            (resource.title !== undefined && resource.title !== current.title)
            || (resource.folder_id !== undefined && resource.folder_id !== current.folder_id)
          ) {
            vaultStore.relocateFolder(resource.id, { database, fileStorage });
          }
        } else if (current.type === 'note') {
        // AI agent writes markdown to vault mirror directly via writeNoteMarkdownFromAgent;
        // refresh content_text from vault on the next mirror write or editor save.
          if (resource.content !== undefined) {
            try {
              const { extractPlainTextFromProseMirror, stripTags } = require('../../services/resource-text.cjs');
              const raw = String(mergedContent || '');
              let text = '';
              if (raw.trim().startsWith('{')) {
                try { text = extractPlainTextFromProseMirror(JSON.parse(raw)); } catch { /* fall through */ }
              }
              if (!text) text = stripTags(raw);
              database.getDB().prepare('UPDATE resources SET content_text = ? WHERE id = ?').run(text, resource.id);
            } catch { /* non-fatal */ }
          }
          if (resource.title !== undefined && resource.title !== current.title) {
            vaultStore.relocateResource(resource.id, { database, fileStorage });
          }
        } else if (current.type === 'url') {
          // Rewrites the .url file at the title-derived path (rename + content).
          if (
            (resource.title !== undefined && resource.title !== current.title)
            || (resource.content !== undefined && resource.content !== current.content)
          ) {
            vaultStore.writeUrlMirror({ id: resource.id }, { database, fileStorage });
          }
        } else if (current.type === 'notebook') {
          if (
            (resource.title !== undefined && resource.title !== current.title)
            || (resource.content !== undefined && resource.content !== current.content)
          ) {
            vaultStore.writeNotebookMirror({ id: resource.id }, { database, fileStorage });
          }
        } else if (current.type === 'artifact') {
          // Title-derived path; relocateResource also moves the .dome sidecar.
          if (resource.title !== undefined && resource.title !== current.title) {
            vaultStore.relocateResource(resource.id, { database, fileStorage });
          }
        } else if (current.vault_path) {
          // Binary file types: renaming in Dome renames the file on disk too.
          if (resource.title !== undefined && resource.title !== current.title) {
            vaultStore.renameResourceFileToTitle(resource.id, { database, fileStorage });
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

      maybeScheduleKbReindex(resource.id, mergedResource, current);
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
          maybeScheduleKbReindex(resource.id, mergedResource, current);
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
                maybeScheduleKbReindex(resource.id, mergedResource, current);
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
  ipcMain.handle('db:resources:searchForMention', (event, query, projectId) => {
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
          ? queries.searchForMentionByProject.all(searchTerm, searchTerm, projectId)
          : queries.searchForMention.all(searchTerm, searchTerm);
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
      if (isSecretSettingKey(key)) {
        const masked = maskSettingForRenderer(queries, key);
        return { success: true, data: masked, hasSecret: Boolean(masked) };
      }
      const result = database.getSettingsRepo().get(key);
      return { success: true, data: result };
    } catch (error) {
      console.error('[DB] Error getting setting:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:settings:set', (event, key, value) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      if (isSecretSettingKey(key)) {
        // A masked display value (sk-…abc4) means "unchanged" — writing it
        // would destroy the stored secret.
        if (!isMaskedSecret(value)) writeSettingSecret(queries, key, value);
      } else {
        database.getSettingsRepo().set(key, value, Date.now());
      }
      return { success: true };
    } catch (error) {
      console.error('[DB] Error setting setting:', error);
      return { success: false, error: error.message };
    }
  });

  // Which AI providers have a stored API key (for the provider picker UI).
  ipcMain.handle('db:settings:aiProviderKeyStatus', (event) => {
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

  ipcMain.handle('db:settings:saveAI', (event, config) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();

      const { provider, apiKey, model, embeddingModel, baseURL } = config;
      const { writeProviderApiKey, writeProviderBaseUrl, KEYLESS_PROVIDERS } = require('../../ai/provider-keys.cjs');

      if (provider) queries.setSetting.run('ai_provider', provider, Date.now());
      const targetProvider = provider || queries.getSetting.get('ai_provider')?.value;
      if (apiKey && !isMaskedSecret(apiKey) && targetProvider && !KEYLESS_PROVIDERS.has(targetProvider)) {
        // Per-provider slot (cambiar de provider conserva cada clave); la
        // ai_api_key legacy compartida se mantiene para lectores antiguos.
        writeProviderApiKey(queries, targetProvider, apiKey);
        writeSettingSecret(queries, 'ai_api_key', apiKey);
      }
      if (model) queries.setSetting.run('ai_model', model, Date.now());
      if (embeddingModel) queries.setSetting.run('ai_embedding_model', embeddingModel, Date.now());
      if (baseURL && targetProvider) writeProviderBaseUrl(queries, targetProvider, baseURL);
      if (baseURL) queries.setSetting.run('ai_base_url', baseURL, Date.now());

      return { success: true };
    } catch (error) {
      console.error('[DB] Error saving AI settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Many agents
  ipcMain.handle('db:manyAgents:list', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      return { success: true, data: queries.listManyAgents.all(pid).map(serializeManyAgent) };
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
      const favorite = agent.favorite === true ? 1 : 0;
      const projectId = agent.projectId && String(agent.projectId).trim() ? String(agent.projectId).trim() : 'default';
      queries.createManyAgent.run(
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
        data: serializeManyAgent(queries.getManyAgentById.get(agent.id)),
      };
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

      // Snapshot current state as a new version before applying the update.
      const snapshotChanged =
        (updates.name !== undefined && updates.name !== current.name) ||
        (updates.systemInstructions !== undefined &&
          updates.systemInstructions !== current.system_instructions) ||
        (updates.mcpServerIds !== undefined &&
          JSON.stringify(updates.mcpServerIds) !== (current.mcp_server_ids ?? '[]'));
      if (snapshotChanged) {
        try {
          const latestRow = queries.getLatestAgentVersion.get(id);
          const nextVersion = (latestRow?.max_version ?? 0) + 1;
          queries.createAgentVersion.run(
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
      queries.updateManyAgent.run(
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
      return { success: true, data: serializeManyAgent(queries.getManyAgentById.get(id)) };
    } catch (error) {
      console.error('[DB] Error updating many agent:', error);
      return { success: false, error: error.message };
    }
  });

  // Agent version history
  ipcMain.handle('db:manyAgents:listVersions', (event, agentId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const rows = queries.listAgentVersions.all(agentId);
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

  ipcMain.handle('db:manyAgents:restoreVersion', (event, agentId, versionId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const ver = queries.getAgentVersionById.get(versionId);
      if (!ver || ver.agent_id !== agentId) return { success: false, error: 'Version not found' };
      const current = queries.getManyAgentById.get(agentId);
      if (!current) return { success: false, error: 'Agent not found' };

      // Snapshot current state before restoring
      const latestRow = queries.getLatestAgentVersion.get(agentId);
      const nextVersion = (latestRow?.max_version ?? 0) + 1;
      queries.createAgentVersion.run(
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
      queries.updateManyAgent.run(
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
      return { success: true, data: serializeManyAgent(queries.getManyAgentById.get(agentId)) };
    } catch (error) {
      console.error('[DB] Error restoring agent version:', error);
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

  // Agent folders
  ipcMain.handle('db:agentFolders:list', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      return { success: true, data: queries.listAgentFolders.all(pid).map(serializeAgentFolderRow) };
    } catch (error) {
      console.error('[DB] Error listing agent folders:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:agentFolders:create', (event, folder) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const pid = folder.projectId && String(folder.projectId).trim() ? String(folder.projectId).trim() : 'default';
      queries.createAgentFolder.run(
        folder.id,
        pid,
        folder.parentId != null && folder.parentId !== '' ? folder.parentId : null,
        String(folder.name || 'Carpeta').trim() || 'Carpeta',
        typeof folder.sortOrder === 'number' ? folder.sortOrder : 0,
        folder.createdAt ?? now,
        folder.updatedAt ?? now,
      );
      windowManager.broadcast('dome:agents-changed');
      return { success: true, data: serializeAgentFolderRow(queries.getAgentFolderById.get(folder.id)) };
    } catch (error) {
      console.error('[DB] Error creating agent folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:agentFolders:update', (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = queries.getAgentFolderById.get(id);
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
      queries.updateAgentFolder.run(parentId, name, sortOrder, now, id);
      windowManager.broadcast('dome:agents-changed');
      return { success: true, data: serializeAgentFolderRow(queries.getAgentFolderById.get(id)) };
    } catch (error) {
      console.error('[DB] Error updating agent folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:agentFolders:delete', (event, id) => {
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
  ipcMain.handle('db:workflows:list', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      return { success: true, data: queries.listCanvasWorkflows.all(pid).map(serializeWorkflow) };
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
      const pid = workflow.projectId && String(workflow.projectId).trim() ? String(workflow.projectId).trim() : 'default';
      queries.createCanvasWorkflow.run(
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
        data: serializeWorkflow(queries.getCanvasWorkflowById.get(workflow.id)),
      };
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
      queries.updateCanvasWorkflow.run(
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
      return { success: true, data: serializeWorkflow(queries.getCanvasWorkflowById.get(id)) };
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

  ipcMain.handle('db:workflowFolders:list', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const pid = projectId && String(projectId).trim() ? String(projectId).trim() : 'default';
      return { success: true, data: queries.listWorkflowFolders.all(pid).map(serializeWorkflowFolderRow) };
    } catch (error) {
      console.error('[DB] Error listing workflow folders:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowFolders:create', (event, folder) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      const pid = folder.projectId && String(folder.projectId).trim() ? String(folder.projectId).trim() : 'default';
      queries.createWorkflowFolder.run(
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
        data: serializeWorkflowFolderRow(queries.getWorkflowFolderById.get(folder.id)),
      };
    } catch (error) {
      console.error('[DB] Error creating workflow folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowFolders:update', (event, id, updates) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = queries.getWorkflowFolderById.get(id);
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
      queries.updateWorkflowFolder.run(parentId, name, sortOrder, now, id);
      windowManager.broadcast('dome:workflows-changed');
      return { success: true, data: serializeWorkflowFolderRow(queries.getWorkflowFolderById.get(id)) };
    } catch (error) {
      console.error('[DB] Error updating workflow folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:workflowFolders:delete', (event, id) => {
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

  ipcMain.handle('db:workflowExecutions:save', (event, execution) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const updatedAt = execution.finishedAt || execution.startedAt || Date.now();
      let projectId = execution.projectId ?? execution.project_id ?? 'default';
      if ((!execution.projectId && !execution.project_id) && execution.workflowId) {
        const wf = queries.getCanvasWorkflowById.get(execution.workflowId);
        projectId = wf?.project_id ?? 'default';
      }
      queries.upsertWorkflowExecution.run(
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

  // Regex used by both FTS5 sanitization and raw term extraction.
  const UNIFIED_SEARCH_NON_WORD = /[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g;

  // Build an FTS5-safe quoted query from a raw user query.
  const buildFtsSanitizedQuery = (rawQuery) =>
    rawQuery
      .replace(UNIFIED_SEARCH_NON_WORD, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term}"`)
      .join(' ');

  // Extract plain search terms (no FTS quoting) — used for LIKE/Lance queries.
  const extractSearchTerms = (rawQuery) =>
    rawQuery.replace(UNIFIED_SEARCH_NON_WORD, ' ').split(/\s+/).filter((t) => t.length > 0);

  // Add parent resources for interactions that matched but whose resource did
  // not match in FTS (e.g. match only in the annotation).
  const enrichResourcesFromInteractions = (queries, resourceResults, interactionResults) => {
    const resourceIds = new Set(resourceResults.map((r) => r.id));
    for (const interaction of interactionResults) {
      const rid = interaction.resource_id;
      if (!rid || resourceIds.has(rid)) continue;
      const resource = queries.getResourceById.get(rid);
      if (resource) {
        resourceResults.push(resource);
        resourceIds.add(rid);
      }
    }
  };

  // Search studio_outputs by title/content using LIKE. Returns [] on error
  // so callers don't need to wrap in try/catch.
  const searchStudioOutputs = (rawTerms) => {
    if (rawTerms.length === 0) return [];
    try {
      const db = database.getDB();
      const placeholders = rawTerms.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
      const params = rawTerms.flatMap((t) => [`%${t}%`, `%${t}%`]);
      const stmt = db.prepare(
        `SELECT * FROM studio_outputs WHERE ${placeholders} ORDER BY updated_at DESC LIMIT 15`
      );
      return stmt.all(...params) || [];
    } catch (studioErr) {
      console.warn('[DB] Studio search failed:', studioErr);
      return [];
    }
  };

  // Search resources via Lance first, then fall back to FTS if nothing matched.
  const searchResourcesUnified = async (queries, lanceQuery, sanitizedQuery, scopeProjectId) => {
    /** @type {any[]} */
    let resourceResults = [];
    if (lanceQuery) {
      try {
        const lexHits = await lancedbSemantic.searchLexResources(
          lanceQuery,
          25,
          scopeProjectId ? { project_id: scopeProjectId } : {}
        );
        for (const h of lexHits) {
          const r = queries.getResourceById.get(h.id);
          if (r) resourceResults.push(r);
        }
      } catch (le) {
        console.warn('[DB] unified search Lance:', le?.message || le);
      }
    }
    if (!resourceResults.length) {
      resourceResults = queries.searchResources.all(sanitizedQuery);
    }
    return resourceResults;
  };

  // First-pass search: Lance + FTS + interactions + studio outputs.
  const performUnifiedSearch = async (queries, sanitizedQuery, rawTerms, scopeProjectId, lanceQuery) => {
    const resourceResults = await searchResourcesUnified(queries, lanceQuery, sanitizedQuery, scopeProjectId);
    const interactionResults = queries.searchInteractions.all(sanitizedQuery);
    enrichResourcesFromInteractions(queries, resourceResults, interactionResults);
    const studioResults = searchStudioOutputs(rawTerms);
    return { resources: resourceResults, interactions: interactionResults, studioOutputs: studioResults };
  };

  // Retry path after a corruption repair: skip Lance (it may be why we failed),
  // but still include studio outputs.
  const retryUnifiedSearchAfterRepair = (sanitizedQuery, rawTerms) => {
    const queries = database.getQueries();
    const resourceResults = queries.searchResources.all(sanitizedQuery);
    const interactionResults = queries.searchInteractions.all(sanitizedQuery);
    enrichResourcesFromInteractions(queries, resourceResults, interactionResults);
    const studioResults = searchStudioOutputs(rawTerms);
    return { resources: resourceResults, interactions: interactionResults, studioOutputs: studioResults };
  };

  // Last-ditch retry after a second repair cycle. Mirrors the original: studio
  // outputs are intentionally omitted on this path.
  const finalRetryUnifiedSearchAfterRepair = (sanitizedQuery) => {
    const queries = database.getQueries();
    const resourceResults = queries.searchResources.all(sanitizedQuery);
    const interactionResults = queries.searchInteractions.all(sanitizedQuery);
    enrichResourcesFromInteractions(queries, resourceResults, interactionResults);
    return { resources: resourceResults, interactions: interactionResults };
  };

  // After a corruption repair fails, run a more aggressive repair cycle.
  const attemptSecondRepair = (retryError, sanitizedQuery, scopeProjectId) => {
    if (retryError.code !== 'SQLITE_CORRUPT' && retryError.code !== 'SQLITE_CORRUPT_VTAB') {
      return { success: false, error: retryError.message };
    }
    console.warn('[DB] Corruption persists in unified search, attempting more aggressive repair...');
    database.invalidateQueries();
    if (!database.repairFTSTables()) {
      return { success: false, error: retryError.message };
    }
    try {
      const data = finalRetryUnifiedSearchAfterRepair(sanitizedQuery);
      return { success: true, data: scopeUnifiedData(data, scopeProjectId) };
    } catch (finalError) {
      console.error('[DB] Error after second repair attempt:', finalError);
      return { success: false, error: finalError.message };
    }
  };

  // Catch-block for the unified search handler. Owns the corruption-recovery
  // branching; called from a single try/catch in the handler itself.
  const handleUnifiedSearchError = (error, sanitizedQuery, rawTerms, scopeProjectId) => {
    console.error('[DB] Error in unified search:', error);
    if (!database.handleCorruptionError(error)) {
      return { success: false, error: error.message };
    }
    try {
      const data = retryUnifiedSearchAfterRepair(sanitizedQuery, rawTerms);
      return { success: true, data: scopeUnifiedData(data, scopeProjectId) };
    } catch (retryError) {
      console.error('[DB] Error retrying unified search after repair:', retryError);
      return attemptSecondRepair(retryError, sanitizedQuery, scopeProjectId);
    }
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
    const sanitizedQuery = buildFtsSanitizedQuery(query);
    if (!sanitizedQuery) {
      return {
        success: true,
        data: { resources: [], interactions: [], studioOutputs: [] },
      };
    }

    const rawTerms = extractSearchTerms(query);
    const lanceQuery = rawTerms.join(' ');

    try {
      const queries = database.getQueries();
      const data = await performUnifiedSearch(queries, sanitizedQuery, rawTerms, scopeProjectId, lanceQuery);
      return { success: true, data: scopeUnifiedData(data, scopeProjectId) };
    } catch (error) {
      return handleUnifiedSearchError(error, sanitizedQuery, rawTerms, scopeProjectId);
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

  // Lightweight resource list (no content / thumbnail_data) for sidebar and dashboard
  ipcMain.handle('db:resources:listLight', (event, limit = 500, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      // Project-scoped when a projectId is provided (filters in SQL before LIMIT
      // to avoid the global-truncation leak). Omit projectId only for meta views
      // that intentionally span all projects (e.g. the Projects dashboard).
      const resources =
        typeof projectId === 'string' && projectId
          ? queries.listResourcesLightByProject.all(projectId, limit)
          : queries.listResourcesLight.all(limit);
      return { success: true, data: resources };
    } catch (error) {
      console.error('[DB] Error listing resources (light):', error);
      return { success: false, error: error.message };
    }
  });

  // Delete resource (cascades folder subtrees — unified pipeline)
  ipcMain.handle('db:resources:delete', async (event, id) => {
    try {
      validateSender(event, windowManager);
      const { deleteResourcesCascade } = require('../../storage/resource-delete.cjs');
      deleteResourcesCascade([id], { database, fileStorage, windowManager });
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

  /** Collect resource id and all descendants (folder tree) for move/delete operations */
  const { collectSubtreeIds: collectResourceSubtreeIds } = require('../../storage/resource-delete.cjs');

  // Move resource (and folder subtree) to another project root (clears folder_id on root only)
  ipcMain.handle('db:resources:moveToProject', (event, arg1, arg2) => {
    const { resourceId, projectId: targetProjectId } = pickPairPayload(arg1, arg2, 'resourceId', 'projectId');
    try {
      validateSender(event, windowManager);
      if (!resourceId || !targetProjectId) {
        return { success: false, error: 'resourceId and projectId are required' };
      }
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }
      const project = queries.getProjectById.get(targetProjectId);
      if (!project) {
        return { success: false, error: 'Target project not found' };
      }
      if (resource.project_id === targetProjectId) {
        return { success: true, data: { movedIds: [resourceId] } };
      }

      const subtreeIds = collectResourceSubtreeIds(queries, resourceId);
      const snapshot = new Map();
      for (const id of subtreeIds) {
        const row = queries.getResourceById.get(id);
        if (row) snapshot.set(id, row);
      }
      const now = Date.now();

      const tx = database.getDB().transaction(() => {
        for (const id of subtreeIds) {
          const prev = snapshot.get(id);
          if (!prev) continue;
          const newFolderId = id === resourceId ? null : prev.folder_id;
          queries.moveResourceToProject.run(targetProjectId, newFolderId, now, id);
        }
      });
      tx();

      // Mirror on disk: move files/folders from source project vault to target vault.
      try {
        const sourceProjectId = resource.project_id;
        vaultStore.relocateSubtreeToProject(resourceId, sourceProjectId, { database, fileStorage });
      } catch (e) {
        console.warn('[DB] vault relocate (moveToProject) failed:', e?.message);
      }

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
  ipcMain.handle('db:resources:moveToFolder', (event, arg1, arg2) => {
    const { resourceId, folderId } = pickPairPayload(arg1, arg2, 'resourceId', 'folderId');
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

      const { syncVaultAfterMoveToFolder } = require('../../storage/vault-sync.cjs');
      syncVaultAfterMoveToFolder(resourceId, { database, fileStorage });

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

      const { syncVaultAfterMoveToFolder } = require('../../storage/vault-sync.cjs');
      syncVaultAfterMoveToFolder(resourceId, { database, fileStorage });

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

  /** Bulk delete: expands folder subtrees, deletes deepest nodes first (unified pipeline) */
  ipcMain.handle('db:resources:bulkDelete', async (event, resourceIds) => {
    try {
      validateSender(event, windowManager);
      if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
        return { success: false, error: 'resourceIds array required' };
      }
      const { deleteResourcesCascade } = require('../../storage/resource-delete.cjs');
      const { deletedIds } = deleteResourcesCascade(resourceIds, { database, fileStorage, windowManager });
      return { success: true, data: { deletedIds } };
    } catch (error) {
      console.error('[DB] Error bulk deleting resources:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
