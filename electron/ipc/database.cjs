/* eslint-disable no-console */
const crypto = require('crypto');
const resourceIndexer = require('../resource-indexer.cjs');
const notesService = require('../notes-service.cjs');

function register({ ipcMain, windowManager, database, fileStorage, validateSender, initModule, ollamaService }) {
  const pageIndexService = require('../pageindex-service.cjs');
  const indexerDeps = { database, fileStorage, pageIndexService, initModule, ollamaService };
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

      // Debug: log value details for email to diagnose truncation issue
      if (key === 'user_email') {
        console.log(`[DB] Setting user_email:`);
        console.log(`[DB]   - Raw value: "${value}"`);
        console.log(`[DB]   - Length: ${value?.length}`);
        console.log(`[DB]   - Type: ${typeof value}`);
        console.log(`[DB]   - Char codes: ${value?.split('').map(c => c.charCodeAt(0)).join(',')}`);
      } else {
        console.log(`[DB] Setting ${key} = ${value} (type: ${typeof value})`);
      }

      queries.setSetting.run(key, value, Date.now());

      // Verify it was saved
      const saved = queries.getSetting.get(key);
      if (key === 'user_email') {
        console.log(`[DB] Verified saved user_email:`);
        console.log(`[DB]   - Saved value: "${saved?.value}"`);
        console.log(`[DB]   - Saved length: ${saved?.value?.length}`);
      } else {
        console.log(`[DB] Verified saved ${key} = ${saved?.value}`);
      }

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

      console.log('[DB] AI settings saved successfully');
      return { success: true };
    } catch (error) {
      console.error('[DB] Error saving AI settings:', error);
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

  // ============================================
  // Notes (Docmost-style domain)
  // ============================================

  ipcMain.handle('db:notes:create', (event, note) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const id = note.id || crypto.randomUUID();
      const slugId = note.slug_id || notesService.generateSlugId();
      const now = Date.now();
      const projectId = note.project_id || 'default';
      const parentNoteId = note.parent_note_id ?? null;

      const position = note.position || notesService.nextPosition(queries, projectId, parentNoteId);

      queries.createNote.run(
        id,
        slugId,
        projectId,
        parentNoteId,
        note.title || 'Untitled',
        note.icon ?? null,
        note.content_json ?? null,
        note.text_content ?? null,
        position,
        now,
        now,
        null,
        null
      );

      const created = queries.getNoteById.get(id);
      windowManager.broadcast('note:created', created);
      return { success: true, data: created };
    } catch (error) {
      console.error('[DB] Error creating note:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getById', (event, id) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const note = queries.getNoteById.get(id);
      return { success: true, data: note || null };
    } catch (error) {
      console.error('[DB] Error getting note:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getByIdOrSlug', (event, idOrSlug) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const note = queries.getNoteByIdOrSlug.get(idOrSlug, idOrSlug);
      return { success: true, data: note || null };
    } catch (error) {
      console.error('[DB] Error getting note:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:update', (event, note) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const current = queries.getNoteById.get(note.id);
      if (!current) {
        return { success: false, error: 'Note not found' };
      }

      const merged = {
        title: note.title !== undefined ? note.title : current.title,
        icon: note.icon !== undefined ? note.icon : current.icon,
        content_json: note.content_json !== undefined ? note.content_json : current.content_json,
        text_content: note.text_content !== undefined ? note.text_content : current.text_content,
        position: note.position !== undefined ? note.position : current.position,
        parent_note_id: note.parent_note_id !== undefined ? note.parent_note_id : current.parent_note_id,
        updated_at: Date.now(),
        last_updated_by: note.last_updated_by ?? current.last_updated_by,
        contributor_ids: note.contributor_ids ?? current.contributor_ids,
      };

      // Save snapshot to history when content or title changed
      const contentChanged = merged.content_json !== current.content_json || merged.title !== current.title;
      if (contentChanged && (current.content_json || current.title)) {
        const historyId = crypto.randomUUID();
        queries.createNoteHistory.run(
          historyId,
          note.id,
          current.slug_id,
          current.title,
          current.icon,
          current.content_json,
          current.text_content,
          current.last_updated_by,
          current.contributor_ids ? JSON.stringify(current.contributor_ids) : null,
          Date.now()
        );
      }

      queries.updateNote.run(
        merged.title,
        merged.icon,
        merged.content_json,
        merged.text_content,
        merged.position,
        merged.parent_note_id,
        merged.updated_at,
        merged.last_updated_by,
        merged.contributor_ids ? JSON.stringify(merged.contributor_ids) : null,
        note.id
      );

      const updated = { ...current, ...merged };
      windowManager.broadcast('note:updated', { id: note.id, updates: updated });

      // Update note_links from mentions in content (markdown @[label](id) or JSON)
      if (merged.content_json) {
        queries.deleteNoteLinksBySource.run(note.id);
        const mentionIds = extractMentionIdsFromContent(merged.content_json);
        for (const targetId of mentionIds) {
          if (targetId && targetId !== note.id) {
            const targetNote = queries.getNoteById.get(targetId);
            if (targetNote) {
              const linkId = crypto.randomUUID();
              queries.createNoteLink.run(linkId, note.id, targetId, 'mention', Date.now());
            }
          }
        }
      }

      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error updating note:', error);
      return { success: false, error: error.message };
    }
  });

  function extractMentionIdsFromContent(content) {
    const ids = new Set();
    if (typeof content === 'string') {
      const re = /@\[[^\]]*\]\(([^)\s]+)\)/g;
      let m;
      while ((m = re.exec(content)) !== null) ids.add(m[1]);
    } else if (content && typeof content === 'object') {
      const str = JSON.stringify(content);
      const re = /"resourceId"\s*:\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(str)) !== null) ids.add(m[1]);
    }
    return Array.from(ids);
  }

  ipcMain.handle('db:notes:remove', (event, noteId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      queries.softDeleteNote.run(now, now, noteId);
      windowManager.broadcast('note:removed', { id: noteId });
      return { success: true };
    } catch (error) {
      console.error('[DB] Error removing note:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:restore', (event, noteId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const now = Date.now();
      queries.restoreNote.run(now, noteId);
      const restored = queries.getNoteById.get(noteId);
      windowManager.broadcast('note:restored', restored);
      return { success: true, data: restored };
    } catch (error) {
      console.error('[DB] Error restoring note:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getRoot', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const notes = queries.getRootNotes.all(projectId || 'default');
      return { success: true, data: notes };
    } catch (error) {
      console.error('[DB] Error getting root notes:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getByProject', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const notes = queries.getNotesByProject.all(projectId || 'default');
      return { success: true, data: notes };
    } catch (error) {
      console.error('[DB] Error getting notes by project:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getChildren', (event, parentNoteId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const notes = queries.getChildNotes.all(parentNoteId);
      return { success: true, data: notes };
    } catch (error) {
      console.error('[DB] Error getting child notes:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getDeleted', (event, projectId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const notes = queries.getDeletedNotes.all(projectId || 'default');
      return { success: true, data: notes };
    } catch (error) {
      console.error('[DB] Error getting deleted notes:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:search', (event, { query, projectId }) => {
    try {
      validateSender(event, windowManager);
      if (typeof query !== 'string' || query.length > 500) {
        return { success: false, error: 'Invalid query' };
      }
      const queries = database.getQueries();
      const sanitized = query.split(/\s+/).filter(t => t.length).map(t => `"${t}"`).join(' ');
      const notes = sanitized ? queries.searchNotes.all(sanitized, projectId || 'default') : [];
      return { success: true, data: notes };
    } catch (error) {
      console.error('[DB] Error searching notes:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getBacklinks', (event, noteId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const links = queries.getNoteBacklinks.all(noteId);
      return { success: true, data: links };
    } catch (error) {
      console.error('[DB] Error getting note backlinks:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getHistory', (event, noteId, limit = 50) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const history = queries.getNoteHistory.all(noteId, limit);
      return { success: true, data: history };
    } catch (error) {
      console.error('[DB] Error getting note history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:restoreFromHistory', (event, historyId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const snapshot = queries.getNoteHistoryById.get(historyId);
      if (!snapshot) return { success: false, error: 'History snapshot not found' };
      const note = queries.getNoteById.get(snapshot.note_id);
      if (!note) return { success: false, error: 'Note not found' };
      const now = Date.now();
      queries.updateNote.run(
        snapshot.title,
        snapshot.icon,
        snapshot.content_json,
        snapshot.text_content,
        note.position,
        note.parent_note_id,
        now,
        note.last_updated_by,
        note.contributor_ids ? JSON.stringify(note.contributor_ids) : null,
        note.id
      );
      // Recompute note_links from restored content (mentions may have changed)
      if (snapshot.content_json) {
        queries.deleteNoteLinksBySource.run(note.id);
        const mentionIds = extractMentionIdsFromContent(snapshot.content_json);
        for (const targetId of mentionIds) {
          if (targetId && targetId !== note.id) {
            const targetNote = queries.getNoteById.get(targetId);
            if (targetNote) {
              const linkId = crypto.randomUUID();
              queries.createNoteLink.run(linkId, note.id, targetId, 'mention', Date.now());
            }
          }
        }
      }
      const updated = queries.getNoteById.get(note.id);
      windowManager.broadcast('note:updated', { id: note.id, updates: updated });
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error restoring from history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:move', (event, { noteId, parentNoteId, index }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const note = queries.getNoteById.get(noteId);
      if (!note) return { success: false, error: 'Note not found' };
      const projectId = note.project_id || 'default';
      const newParent = parentNoteId !== undefined ? parentNoteId : note.parent_note_id;
      const { position, parentNoteId: resolvedParent } = notesService.computeMovePosition(
        queries, noteId, newParent, typeof index === 'number' ? index : undefined, projectId
      );
      const now = Date.now();
      queries.moveNotePosition.run(position, resolvedParent, now, noteId);
      const updated = queries.getNoteById.get(noteId);
      windowManager.broadcast('note:updated', { id: noteId, updates: updated });
      return { success: true, data: updated };
    } catch (error) {
      console.error('[DB] Error moving note:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:getBreadcrumbs', (event, noteId) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const breadcrumbs = notesService.getBreadcrumbs(queries, noteId);
      return { success: true, data: breadcrumbs };
    } catch (error) {
      console.error('[DB] Error getting note breadcrumbs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:notes:duplicate', (event, { noteId, projectId, parentNoteId }) => {
    try {
      validateSender(event, windowManager);
      const queries = database.getQueries();
      const note = queries.getNoteById.get(noteId);
      if (!note) return { success: false, error: 'Note not found' };
      const projId = projectId || note.project_id || 'default';
      const newNote = notesService.duplicateNote(queries, noteId, projId, parentNoteId ?? null);
      if (!newNote) return { success: false, error: 'Failed to duplicate' };
      windowManager.broadcast('note:created', newNote);
      return { success: true, data: newNote };
    } catch (error) {
      console.error('[DB] Error duplicating note:', error);
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
