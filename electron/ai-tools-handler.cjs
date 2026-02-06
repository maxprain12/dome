/**
 * AI Tools Handler - Main Process
 * 
 * Provides functions to execute AI tools that require access to:
 * - SQLite database (resources, projects, interactions)
 * - Vector database (LanceDB for semantic search)
 * - File storage
 * 
 * These functions are called via IPC from the renderer process
 * when the AI model requests tool execution.
 */

const database = require('./database.cjs');

// Reference to vector database (set by init.cjs)
let vectorDB = null;

/**
 * Set vector database reference
 * @param {Object} db - LanceDB connection
 */
function setVectorDB(db) {
  vectorDB = db;
}

/**
 * Get vector database reference
 * @returns {Object|null}
 */
function getVectorDB() {
  return vectorDB;
}

// =============================================================================
// Resource Tools
// =============================================================================

/**
 * Search resources using full-text search
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {string} [options.project_id] - Filter by project
 * @param {string} [options.type] - Filter by resource type
 * @param {number} [options.limit=10] - Max results
 * @returns {Promise<Object>}
 */
async function resourceSearch(query, options = {}) {
  try {
    const db = database.getDB();
    const limit = Math.min(options.limit || 10, 50); // Cap at 50

    // Escape FTS special characters
    const safeQuery = query.replace(/['"*()]/g, ' ').trim();
    if (!safeQuery) {
      return { success: true, results: [] };
    }

    // Build FTS query with prefix matching
    const ftsQuery = safeQuery.split(/\s+/).map(word => `${word}*`).join(' ');

    let results;
    
    // Use different queries based on filters
    if (options.project_id && options.type) {
      const stmt = db.prepare(`
        SELECT r.id, r.title, r.type, r.content, r.project_id, r.created_at, r.updated_at,
               r.thumbnail_data, r.metadata,
               snippet(resources_fts, 2, '<mark>', '</mark>', '...', 50) as snippet
        FROM resources r
        JOIN resources_fts fts ON r.id = fts.resource_id
        WHERE resources_fts MATCH ?
          AND r.project_id = ?
          AND r.type = ?
        ORDER BY rank
        LIMIT ?
      `);
      results = stmt.all(ftsQuery, options.project_id, options.type, limit);
    } else if (options.project_id) {
      const stmt = db.prepare(`
        SELECT r.id, r.title, r.type, r.content, r.project_id, r.created_at, r.updated_at,
               r.thumbnail_data, r.metadata,
               snippet(resources_fts, 2, '<mark>', '</mark>', '...', 50) as snippet
        FROM resources r
        JOIN resources_fts fts ON r.id = fts.resource_id
        WHERE resources_fts MATCH ?
          AND r.project_id = ?
        ORDER BY rank
        LIMIT ?
      `);
      results = stmt.all(ftsQuery, options.project_id, limit);
    } else if (options.type) {
      const stmt = db.prepare(`
        SELECT r.id, r.title, r.type, r.content, r.project_id, r.created_at, r.updated_at,
               r.thumbnail_data, r.metadata,
               snippet(resources_fts, 2, '<mark>', '</mark>', '...', 50) as snippet
        FROM resources r
        JOIN resources_fts fts ON r.id = fts.resource_id
        WHERE resources_fts MATCH ?
          AND r.type = ?
        ORDER BY rank
        LIMIT ?
      `);
      results = stmt.all(ftsQuery, options.type, limit);
    } else {
      const stmt = db.prepare(`
        SELECT r.id, r.title, r.type, r.content, r.project_id, r.created_at, r.updated_at,
               r.thumbnail_data, r.metadata,
               snippet(resources_fts, 2, '<mark>', '</mark>', '...', 50) as snippet
        FROM resources r
        JOIN resources_fts fts ON r.id = fts.resource_id
        WHERE resources_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      results = stmt.all(ftsQuery, limit);
    }

    // Parse metadata and limit content length for AI consumption
    const processedResults = results.map(r => ({
      id: r.id,
      title: r.title,
      type: r.type,
      project_id: r.project_id,
      snippet: r.snippet || (r.content ? r.content.substring(0, 200) + '...' : ''),
      created_at: r.created_at,
      updated_at: r.updated_at,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }));

    return {
      success: true,
      query: query,
      count: processedResults.length,
      results: processedResults,
    };
  } catch (error) {
    console.error('[AI Tools] resourceSearch error:', error);
    
    // Try to repair FTS if corrupted
    if (error.code === 'SQLITE_CORRUPT' || error.code === 'SQLITE_CORRUPT_VTAB') {
      database.handleCorruptionError(error);
    }
    
    return {
      success: false,
      error: error.message,
      results: [],
    };
  }
}

/**
 * Get a resource by ID with full content
 * @param {string} resourceId - Resource ID
 * @param {Object} options - Options
 * @param {boolean} [options.includeContent=true] - Include full content
 * @param {number} [options.maxContentLength=10000] - Max content length
 * @returns {Promise<Object>}
 */
async function resourceGet(resourceId, options = {}) {
  try {
    if (!resourceId) {
      return { success: false, error: 'Resource ID is required' };
    }

    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Parse metadata
    let metadata = null;
    try {
      metadata = resource.metadata ? JSON.parse(resource.metadata) : null;
    } catch {
      metadata = null;
    }

    // Prepare response with controlled content length
    const maxLen = options.maxContentLength || 10000;
    const includeContent = options.includeContent !== false;

    const result = {
      id: resource.id,
      title: resource.title,
      type: resource.type,
      project_id: resource.project_id,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
      metadata: metadata,
    };

    // Include content with length limit
    if (includeContent && resource.content) {
      if (resource.content.length > maxLen) {
        result.content = resource.content.substring(0, maxLen);
        result.content_truncated = true;
        result.full_length = resource.content.length;
      } else {
        result.content = resource.content;
        result.content_truncated = false;
      }
    }

    // Include transcription if available
    if (metadata?.transcription) {
      if (metadata.transcription.length > maxLen) {
        result.transcription = metadata.transcription.substring(0, maxLen);
        result.transcription_truncated = true;
      } else {
        result.transcription = metadata.transcription;
      }
    }

    // Include summary if available
    if (metadata?.summary) {
      result.summary = metadata.summary;
    }

    return {
      success: true,
      resource: result,
    };
  } catch (error) {
    console.error('[AI Tools] resourceGet error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * List resources with optional filters
 * @param {Object} options - List options
 * @param {string} [options.project_id] - Filter by project
 * @param {string} [options.folder_id] - Filter by folder
 * @param {string} [options.type] - Filter by type
 * @param {number} [options.limit=20] - Max results
 * @param {string} [options.sort='updated_at'] - Sort field
 * @returns {Promise<Object>}
 */
async function resourceList(options = {}) {
  try {
    const db = database.getDB();
    const limit = Math.min(options.limit || 20, 100); // Cap at 100

    let sql = `
      SELECT id, title, type, project_id, folder_id, 
             created_at, updated_at, thumbnail_data, metadata
      FROM resources
      WHERE 1=1
    `;
    const params = [];

    if (options.project_id) {
      sql += ' AND project_id = ?';
      params.push(options.project_id);
    }

    if (options.folder_id !== undefined) {
      if (options.folder_id === null) {
        sql += ' AND folder_id IS NULL';
      } else {
        sql += ' AND folder_id = ?';
        params.push(options.folder_id);
      }
    }

    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    // Sort order
    const sortField = options.sort === 'created_at' ? 'created_at' : 'updated_at';
    sql += ` ORDER BY ${sortField} DESC LIMIT ?`;
    params.push(limit);

    const stmt = db.prepare(sql);
    const results = stmt.all(...params);

    // Parse metadata
    const processedResults = results.map(r => ({
      id: r.id,
      title: r.title,
      type: r.type,
      project_id: r.project_id,
      folder_id: r.folder_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }));

    return {
      success: true,
      count: processedResults.length,
      resources: processedResults,
    };
  } catch (error) {
    console.error('[AI Tools] resourceList error:', error);
    return {
      success: false,
      error: error.message,
      resources: [],
    };
  }
}

/**
 * Semantic search using embeddings and vector database
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {string} [options.project_id] - Filter by project
 * @param {number} [options.limit=10] - Max results
 * @returns {Promise<Object>}
 */
async function resourceSemanticSearch(query, options = {}) {
  try {
    if (!vectorDB) {
      // Fall back to FTS if vector DB not available
      console.log('[AI Tools] Vector DB not available, falling back to FTS');
      return resourceSearch(query, options);
    }

    const limit = Math.min(options.limit || 10, 50);

    // Generate embedding for the query
    // This requires Ollama or another embedding provider
    const ollamaService = require('./ollama.cjs');
    const isAvailable = await ollamaService.checkAvailability();

    if (!isAvailable) {
      console.log('[AI Tools] Ollama not available for embeddings, falling back to FTS');
      return resourceSearch(query, options);
    }

    // Generate query embedding
    const embeddingResult = await ollamaService.generateEmbedding(query);
    if (!embeddingResult || !embeddingResult.embedding) {
      console.log('[AI Tools] Failed to generate embedding, falling back to FTS');
      return resourceSearch(query, options);
    }

    // Search in vector database
    const tables = await vectorDB.tableNames();
    
    if (!tables.includes('resources')) {
      console.log('[AI Tools] Resources table not found in vector DB, falling back to FTS');
      return resourceSearch(query, options);
    }

    const resourcesTable = await vectorDB.openTable('resources');
    let searchResults = await resourcesTable
      .search(embeddingResult.embedding)
      .limit(limit)
      .toArray();

    // Filter by project if specified
    if (options.project_id) {
      searchResults = searchResults.filter(r => r.project_id === options.project_id);
    }

    // Get full resource data from SQLite for each result
    const queries = database.getQueries();
    const results = searchResults
      .map(r => {
        const resource = queries.getResourceById.get(r.resource_id || r.id);
        if (!resource) return null;
        
        let metadata = null;
        try {
          metadata = resource.metadata ? JSON.parse(resource.metadata) : null;
        } catch {
          metadata = null;
        }

        return {
          id: resource.id,
          title: resource.title,
          type: resource.type,
          project_id: resource.project_id,
          similarity: r._distance ? 1 - r._distance : r.score,
          snippet: resource.content ? resource.content.substring(0, 200) + '...' : '',
          created_at: resource.created_at,
          updated_at: resource.updated_at,
          metadata: metadata,
        };
      })
      .filter(r => r !== null);

    return {
      success: true,
      query: query,
      method: 'semantic',
      count: results.length,
      results: results,
    };
  } catch (error) {
    console.error('[AI Tools] resourceSemanticSearch error:', error);
    
    // Fall back to FTS on error
    console.log('[AI Tools] Falling back to FTS due to error');
    return resourceSearch(query, options);
  }
}

// =============================================================================
// Project Tools
// =============================================================================

/**
 * List all projects
 * @returns {Promise<Object>}
 */
async function projectList() {
  try {
    const queries = database.getQueries();
    const projects = queries.getProjects.all();

    const processedProjects = projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      parent_id: p.parent_id,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    return {
      success: true,
      count: processedProjects.length,
      projects: processedProjects,
    };
  } catch (error) {
    console.error('[AI Tools] projectList error:', error);
    return {
      success: false,
      error: error.message,
      projects: [],
    };
  }
}

/**
 * Get project by ID
 * @param {string} projectId - Project ID
 * @returns {Promise<Object>}
 */
async function projectGet(projectId) {
  try {
    if (!projectId) {
      return { success: false, error: 'Project ID is required' };
    }

    const queries = database.getQueries();
    const project = queries.getProjectById.get(projectId);

    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // Count resources in this project
    const db = database.getDB();
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM resources WHERE project_id = ?');
    const countResult = countStmt.get(projectId);

    return {
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        parent_id: project.parent_id,
        created_at: project.created_at,
        updated_at: project.updated_at,
        resource_count: countResult.count,
      },
    };
  } catch (error) {
    console.error('[AI Tools] projectGet error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// =============================================================================
// Interaction Tools
// =============================================================================

/**
 * List interactions for a resource
 * @param {string} resourceId - Resource ID
 * @param {Object} options - Options
 * @param {string} [options.type] - Filter by type (note, annotation, chat)
 * @param {number} [options.limit=50] - Max results
 * @returns {Promise<Object>}
 */
async function interactionList(resourceId, options = {}) {
  try {
    if (!resourceId) {
      return { success: false, error: 'Resource ID is required' };
    }

    const queries = database.getQueries();
    const limit = Math.min(options.limit || 50, 200);

    let interactions;
    if (options.type) {
      interactions = queries.getInteractionsByType.all(resourceId, options.type);
    } else {
      interactions = queries.getInteractionsByResource.all(resourceId);
    }

    // Limit results
    interactions = interactions.slice(0, limit);

    const processedInteractions = interactions.map(i => {
      let positionData = null;
      let metadata = null;

      try {
        positionData = i.position_data ? JSON.parse(i.position_data) : null;
        metadata = i.metadata ? JSON.parse(i.metadata) : null;
      } catch {
        // Ignore JSON parse errors
      }

      return {
        id: i.id,
        type: i.type,
        content: i.content,
        position_data: positionData,
        metadata: metadata,
        created_at: i.created_at,
        updated_at: i.updated_at,
      };
    });

    return {
      success: true,
      resource_id: resourceId,
      count: processedInteractions.length,
      interactions: processedInteractions,
    };
  } catch (error) {
    console.error('[AI Tools] interactionList error:', error);
    return {
      success: false,
      error: error.message,
      interactions: [],
    };
  }
}

// =============================================================================
// Context Helpers
// =============================================================================

/**
 * Get recent resources for context
 * @param {number} limit - Max results
 * @returns {Promise<Array>}
 */
async function getRecentResources(limit = 5) {
  try {
    const queries = database.getQueries();
    const resources = queries.getAllResources.all(limit);

    return resources.map(r => ({
      id: r.id,
      title: r.title,
      type: r.type,
      project_id: r.project_id,
      updated_at: r.updated_at,
    }));
  } catch (error) {
    console.error('[AI Tools] getRecentResources error:', error);
    return [];
  }
}

/**
 * Get current/default project
 * @returns {Promise<Object|null>}
 */
async function getCurrentProject() {
  try {
    const queries = database.getQueries();
    
    // Try to get the last used project from settings
    const lastProjectSetting = queries.getSetting.get('last_project_id');
    if (lastProjectSetting?.value) {
      const project = queries.getProjectById.get(lastProjectSetting.value);
      if (project) {
        return {
          id: project.id,
          name: project.name,
          description: project.description,
        };
      }
    }

    // Fall back to default project
    const defaultProject = queries.getProjectById.get('default');
    if (defaultProject) {
      return {
        id: defaultProject.id,
        name: defaultProject.name,
        description: defaultProject.description,
      };
    }

    return null;
  } catch (error) {
    console.error('[AI Tools] getCurrentProject error:', error);
    return null;
  }
}

// =============================================================================
// Resource Action Tools (Create, Update, Delete)
// =============================================================================

/**
 * Create a new resource via AI tool
 * @param {Object} data - Resource data
 * @param {string} data.title - Resource title
 * @param {string} [data.type='note'] - Resource type
 * @param {string} [data.content=''] - Resource content (HTML or plain text)
 * @param {string} [data.project_id] - Project ID (defaults to current project)
 * @param {string} [data.folder_id] - Folder ID
 * @returns {Promise<Object>}
 */
async function resourceCreate(data) {
  try {
    if (!data || !data.title || !data.title.trim()) {
      return { success: false, error: 'Title is required' };
    }

    const db = database.getDB();
    const queries = database.getQueries();

    const type = data.type || 'note';
    const validTypes = ['note', 'document', 'url', 'folder'];
    if (!validTypes.includes(type)) {
      return { success: false, error: `AI can only create resources of type: ${validTypes.join(', ')}` };
    }

    // Determine project ID
    let projectId = data.project_id;
    if (!projectId) {
      const currentProject = await getCurrentProject();
      projectId = currentProject?.id || 'default';
    }

    const now = Date.now();
    const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;

    queries.createResource.run(
      id,
      projectId,
      type,
      data.title.trim(),
      data.content || '',
      null, // file_path
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now
    );

    const resource = {
      id,
      title: data.title.trim(),
      type,
      project_id: projectId,
      folder_id: data.folder_id || null,
      created_at: now,
      updated_at: now,
    };

    // Move to folder if specified
    if (data.folder_id) {
      const moveStmt = db.prepare('UPDATE resources SET folder_id = ? WHERE id = ?');
      moveStmt.run(data.folder_id, id);
      resource.folder_id = data.folder_id;
    }

    return { success: true, resource };
  } catch (error) {
    console.error('[AI Tools] resourceCreate error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing resource via AI tool
 * @param {string} resourceId - Resource ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.title] - New title
 * @param {string} [updates.content] - New content
 * @param {Object} [updates.metadata] - Metadata to merge
 * @returns {Promise<Object>}
 */
async function resourceUpdate(resourceId, updates) {
  try {
    if (!resourceId) {
      return { success: false, error: 'Resource ID is required' };
    }

    const queries = database.getQueries();
    const existing = queries.getResourceById.get(resourceId);

    if (!existing) {
      return { success: false, error: 'Resource not found' };
    }

    const title = updates.title !== undefined ? updates.title.trim() : existing.title;
    const content = updates.content !== undefined ? updates.content : existing.content;

    // Merge metadata
    let metadata = existing.metadata;
    if (updates.metadata) {
      let existingMeta = {};
      try { existingMeta = metadata ? JSON.parse(metadata) : {}; } catch { existingMeta = {}; }
      metadata = JSON.stringify({ ...existingMeta, ...updates.metadata });
    }

    const now = Date.now();
    queries.updateResource.run(title, content, metadata, now, resourceId);

    return {
      success: true,
      resource: {
        id: resourceId,
        title,
        type: existing.type,
        project_id: existing.project_id,
        updated_at: now,
      },
    };
  } catch (error) {
    console.error('[AI Tools] resourceUpdate error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a resource via AI tool
 * @param {string} resourceId - Resource ID
 * @returns {Promise<Object>}
 */
async function resourceDelete(resourceId) {
  try {
    if (!resourceId) {
      return { success: false, error: 'Resource ID is required' };
    }

    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    // Delete internal file if exists
    if (resource.internal_path) {
      try {
        const fileStorage = require('./file-storage.cjs');
        fileStorage.deleteFile(resource.internal_path);
      } catch (e) {
        console.warn('[AI Tools] Could not delete file:', e.message);
      }
    }

    // Delete from database
    queries.deleteResource.run(resourceId);

    return {
      success: true,
      deleted: {
        id: resourceId,
        title: resource.title,
        type: resource.type,
      },
    };
  } catch (error) {
    console.error('[AI Tools] resourceDelete error:', error);
    return { success: false, error: error.message };
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Vector DB management
  setVectorDB,
  getVectorDB,

  // Resource tools (read)
  resourceSearch,
  resourceGet,
  resourceList,
  resourceSemanticSearch,

  // Resource tools (write)
  resourceCreate,
  resourceUpdate,
  resourceDelete,

  // Project tools
  projectList,
  projectGet,

  // Interaction tools
  interactionList,

  // Context helpers
  getRecentResources,
  getCurrentProject,
};
