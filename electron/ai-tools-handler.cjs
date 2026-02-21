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

const TOOL_TRACE = process.env.NODE_ENV === 'development' || process.env.DEBUG_AI_TOOLS === '1';

function traceLog(fn, params, result, err) {
  if (!TOOL_TRACE) return;
  const sanitize = (obj, maxLen = 80) => {
    if (obj == null) return obj;
    if (typeof obj === 'string') return obj.length > maxLen ? obj.slice(0, maxLen) + '...' : obj;
    if (Array.isArray(obj)) return obj.length;
    if (typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (['content', 'snippet', 'embedding', 'thumbnail_data'].includes(k)) continue;
        out[k] = sanitize(v, 60);
      }
      return out;
    }
    return obj;
  };
  if (err) {
    console.log(`[AI:Tools:Handler] ${fn} ERROR`, { params: sanitize(params), error: err.message });
  } else {
    const summary = result?.success === false
      ? { success: false, error: result.error }
      : (typeof result === 'object' && result !== null && !Array.isArray(result))
        ? sanitize(result)
        : { success: true, count: result?.count ?? result?.resources?.length ?? result?.results?.length ?? (result?.resource ? 1 : null) ?? result?.interactions?.length ?? '?' };
    console.log(`[AI:Tools:Handler] ${fn}`, { params: sanitize(params), result: summary });
  }
}

const database = require('./database.cjs');
const fileStorage = require('./file-storage.cjs');
const documentExtractor = require('./document-extractor.cjs');
const docxConverter = require('./docx-converter.cjs');
const webScraper = require('./web-scraper.cjs');
const excelToolsHandler = require('./excel-tools-handler.cjs');
const pptToolsHandler = require('./ppt-tools-handler.cjs');

// Reference to vector database (set by init.cjs)
let vectorDB = null;

// Reference to window manager (set by main.cjs) for broadcasting resource:updated when tools modify resources
let windowManagerRef = null;

/**
 * Set window manager reference for broadcasting updates when tools run in main process
 * @param {Object} wm - Window manager instance
 */
function setWindowManager(wm) {
  windowManagerRef = wm;
}

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
      traceLog('resourceSearch', { query, options }, { success: true, results: [] });
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

    const out = { success: true, query: query, count: processedResults.length, results: processedResults };
    traceLog('resourceSearch', { query, options }, out);
    return out;
  } catch (error) {
    traceLog('resourceSearch', { query, options }, null, error);
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

    // For PDFs without content: extract text on-demand
    if (includeContent && !result.content) {
      const isPdf = resource.type === 'pdf' || (resource.type === 'document' && (resource.file_mime_type || '').includes('pdf'));
      const ext = (resource.original_filename || resource.title || '').toLowerCase();
      if (isPdf || ext.endsWith('.pdf')) {
        const fs = require('fs');
        let fullPath = null;
        if (resource.internal_path) {
          fullPath = fileStorage.getFullPath(resource.internal_path);
        } else if (resource.file_path && fs.existsSync(resource.file_path)) {
          fullPath = resource.file_path; // Legacy external path
        }
        if (fullPath && fs.existsSync(fullPath)) {
          try {
            const extracted = await documentExtractor.extractTextFromPDF(fullPath, maxLen);
            if (extracted && extracted.trim()) {
              result.content = extracted;
              result.content_truncated = extracted.length >= maxLen;
            }
          } catch (e) {
            console.warn('[AI Tools] PDF extraction failed for', resourceId, e.message);
          }
        }
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

    const out = { success: true, resource: result };
    traceLog('resourceGet', { resourceId, options }, {
      success: true,
      hasContent: !!result.content,
      contentLength: result.content?.length ?? 0,
      contentTruncated: result.content_truncated,
    });
    return out;
  } catch (error) {
    traceLog('resourceGet', { resourceId, options }, null, error);
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

    const out = { success: true, count: processedResults.length, resources: processedResults };
    traceLog('resourceList', options, out);
    return out;
  } catch (error) {
    traceLog('resourceList', options, null, error);
    console.error('[AI Tools] resourceList error:', error);
    return {
      success: false,
      error: error.message,
      resources: [],
    };
  }
}

/**
 * Get library structure overview: folders and resources per folder.
 * Helps the AI understand the current organization when the user asks to organize documents.
 * @param {Object} options - Options
 * @param {string} [options.project_id] - Project to use. Defaults to current project.
 * @returns {Promise<Object>}
 */
async function getLibraryOverview(options = {}) {
  try {
    let projectId = options.project_id;
    if (!projectId) {
      const current = await getCurrentProject();
      projectId = current?.id || 'default';
    }

    const queries = database.getQueries();
    const project = queries.getProjectById.get(projectId);
    if (!project) {
      return { success: false, error: 'Project not found', project_id: projectId };
    }

    const db = database.getDB();
    const allResources = db.prepare(`
      SELECT id, title, type, folder_id, metadata
      FROM resources
      WHERE project_id = ?
      ORDER BY type = 'folder' DESC, title ASC
    `).all(projectId);

    const folders = allResources.filter(r => r.type === 'folder');
    const nonFolders = allResources.filter(r => r.type !== 'folder');

    const rootResources = nonFolders.filter(r => !r.folder_id);
    const rootFolders = folders.filter(f => !f.folder_id);

    const folderMap = new Map(folders.map(f => {
      let meta = null;
      try { meta = f.metadata ? JSON.parse(f.metadata) : null; } catch { meta = null; }
      return [f.id, { id: f.id, title: f.title, folder_id: f.folder_id, metadata: meta }];
    }));
    const folderContents = new Map();

    for (const folder of folders) {
      folderContents.set(folder.id, {
        title: folder.title,
        resources: nonFolders.filter(r => r.folder_id === folder.id).map(r => ({ id: r.id, title: r.title, type: r.type })),
        subfolders: folders.filter(f => f.folder_id === folder.id).map(f => ({ id: f.id, title: f.title })),
      });
    }

    const root = {
      resources: rootResources.map(r => ({ id: r.id, title: r.title, type: r.type })),
      folders: rootFolders.map(f => {
        const meta = folderMap.get(f.id)?.metadata;
        return {
          id: f.id,
          title: f.title,
          color: meta?.color ?? null,
          resource_count: (folderContents.get(f.id)?.resources?.length ?? 0),
          subfolder_count: (folderContents.get(f.id)?.subfolders?.length ?? 0),
        };
      }),
    };

    const foldersDetail = [];
    for (const [folderId, contents] of folderContents) {
      const folderMeta = folderMap.get(folderId);
      if (!folderMeta) continue;
      const parentPath = folderMeta.folder_id
        ? buildFolderPath(folderMeta.folder_id, folderMap) + '/'
        : '';
      foldersDetail.push({
        id: folderId,
        title: contents.title,
        path: 'Root/' + parentPath + contents.title,
        color: folderMeta.metadata?.color ?? null,
        resources: contents.resources,
        subfolders: contents.subfolders,
      });
    }

    const out = {
      success: true,
      project: { id: project.id, name: project.name },
      root,
      folders: foldersDetail,
      total_resources: nonFolders.length,
      total_folders: folders.length,
    };
    traceLog('getLibraryOverview', { project_id: projectId }, out);
    return out;
  } catch (error) {
    console.error('[AI Tools] getLibraryOverview error:', error);
    return { success: false, error: error.message };
  }
}

function buildFolderPath(folderId, folderMap) {
  const parts = [];
  let current = folderMap.get(folderId);
  while (current) {
    parts.unshift(current.title);
    current = current.folder_id ? folderMap.get(current.folder_id) : null;
  }
  return parts.join('/');
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
const DEFAULT_NOTEBOOK_JSON = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 1,
  cells: [
    { cell_type: 'markdown', source: '# Python Notebook\n\nEscribe y ejecuta código Python.', metadata: {} },
    { cell_type: 'code', source: 'print("Hello from Python!")', outputs: [], execution_count: null, metadata: {} },
  ],
  metadata: { kernelspec: { display_name: 'Python 3 (Pyodide)', name: 'python3', language: 'python' } },
});

async function resourceCreate(data) {
  try {
    if (!data || !data.title || !data.title.trim()) {
      return { success: false, error: 'Title is required' };
    }

    const db = database.getDB();
    const queries = database.getQueries();

    const type = data.type || 'note';
    const validTypes = ['note', 'notebook', 'document', 'url', 'folder', 'excel'];
    if (!validTypes.includes(type)) {
      return { success: false, error: `AI can only create resources of type: ${validTypes.join(', ')}` };
    }

    if (type === 'excel') {
      let projectId = data.project_id;
      if (!projectId) {
        const currentProject = await getCurrentProject();
        projectId = currentProject?.id || 'default';
      }
      const result = await excelToolsHandler.excelCreate(projectId, data.title.trim(), {
        sheet_name: data.sheet_name,
        initial_data: data.initial_data,
        folder_id: data.folder_id,
      });
      if (!result.success) return result;
      return {
        success: true,
        resource: {
          id: result.resource.id,
          title: result.resource.title,
          type: result.resource.type,
          project_id: result.resource.project_id,
          folder_id: data.folder_id || null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      };
    }

    let content = data.content || '';
    if (type === 'folder') {
      content = '';
    } else if (type === 'notebook') {
      if (!content.trim()) {
        content = DEFAULT_NOTEBOOK_JSON;
      } else {
        try {
          const parsed = JSON.parse(content);
          if (!parsed.nbformat || !Array.isArray(parsed.cells)) {
            content = DEFAULT_NOTEBOOK_JSON;
          }
        } catch {
          content = DEFAULT_NOTEBOOK_JSON;
        }
      }
    }

    // Determine project ID and validate it exists
    let projectId = data.project_id;
    if (!projectId) {
      const currentProject = await getCurrentProject();
      projectId = currentProject?.id || 'default';
    }
    const projectExists = queries.getProjectById.get(projectId);
    if (!projectExists) {
      const projects = queries.getProjects.all();
      projectId = projects[0]?.id || 'default';
      const defaultExists = queries.getProjectById.get('default');
      if (!defaultExists && !projects.length) {
        return { success: false, error: 'No valid project found. Create a project first.' };
      }
    }

    // Validate folder_id exists and is type folder (avoid FOREIGN KEY)
    let resolvedFolderId = null;
    if (data.folder_id != null && data.folder_id !== '') {
      const folder = queries.getResourceById.get(data.folder_id);
      if (folder && folder.type === 'folder') {
        resolvedFolderId = data.folder_id;
      } else {
        console.warn('[AI Tools] folder_id invalid or not a folder, using root:', data.folder_id);
      }
    }

    const now = Date.now();
    const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;

    if (type === 'document' && content && content.trim()) {
      try {
        let html = content.trim();
        if (!html.startsWith('<') || !html.includes('>')) {
          const { marked } = await import('marked');
          html = marked.parse(html);
        }
        const buffer = await docxConverter.htmlToDocxBuffer(html);
        if (buffer) {
          const safeTitle = data.title.trim().replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
          const importResult = await fileStorage.importFromBuffer(buffer, `${safeTitle}.docx`, 'document');
          const fullPath = fileStorage.getFullPath(importResult.internalPath);
          let contentText = null;
          try {
            contentText = await documentExtractor.extractDocxText(fullPath, 50000);
          } catch (e) {
            console.warn('[AI Tools] DOCX text extraction failed:', e?.message);
          }
          queries.createResourceWithFile.run(
            id,
            projectId,
            type,
            data.title.trim(),
            contentText || content,
            null,
            importResult.internalPath,
            importResult.mimeType,
            importResult.size,
            importResult.hash,
            null,
            importResult.originalName,
            data.metadata ? JSON.stringify(data.metadata) : null,
            now,
            now
          );
        } else {
          queries.createResource.run(id, projectId, type, data.title.trim(), content, null, resolvedFolderId, data.metadata ? JSON.stringify(data.metadata) : null, now, now);
        }
      } catch (docxErr) {
        console.warn('[AI Tools] DOCX creation failed, falling back to note-style:', docxErr?.message);
        queries.createResource.run(id, projectId, type, data.title.trim(), content, null, resolvedFolderId, data.metadata ? JSON.stringify(data.metadata) : null, now, now);
      }
    } else {
      queries.createResource.run(
        id,
        projectId,
        type,
        data.title.trim(),
        content,
        null, // file_path
        resolvedFolderId,
        data.metadata ? JSON.stringify(data.metadata) : null,
        now,
        now
      );
    }

    const resource = {
      id,
      title: data.title.trim(),
      type,
      project_id: projectId,
      folder_id: resolvedFolderId,
      created_at: now,
      updated_at: now,
    };

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
    let content = updates.content !== undefined ? updates.content : existing.content;

    // Merge metadata
    let metadata = existing.metadata;
    if (updates.metadata) {
      let existingMeta = {};
      try { existingMeta = metadata ? JSON.parse(metadata) : {}; } catch { existingMeta = {}; }
      metadata = JSON.stringify({ ...existingMeta, ...updates.metadata });
    }

    const now = Date.now();

    const filename = (existing.original_filename || existing.title || '').toLowerCase();
    const mime = existing.file_mime_type || '';
    const isDocx = existing.type === 'document' && (
      existing.internal_path?.toLowerCase().endsWith('.docx') ||
      filename.endsWith('.docx') || filename.endsWith('.doc') ||
      mime.includes('wordprocessingml') || mime.includes('msword')
    );

    if (isDocx && updates.content !== undefined && content) {
      try {
        let html = String(content).trim();
        if (!html.startsWith('<') || !html.includes('>')) {
          const { marked } = await import('marked');
          html = marked.parse(html);
        }
        const buffer = await docxConverter.htmlToDocxBuffer(html);
        if (buffer && existing.internal_path) {
          fileStorage.overwriteFile(existing.internal_path, buffer);
          const fullPath = fileStorage.getFullPath(existing.internal_path);
          let contentText = null;
          try {
            contentText = await documentExtractor.extractDocxText(fullPath, 50000);
          } catch (e) {
            console.warn('[AI Tools] DOCX text extraction failed:', e?.message);
          }
          content = contentText || content;
        } else if (buffer && !existing.internal_path) {
          const safeTitle = (existing.title || 'document').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
          const importResult = await fileStorage.importFromBuffer(buffer, `${safeTitle}.docx`, 'document');
          const fullPath = fileStorage.getFullPath(importResult.internalPath);
          let contentText = null;
          try {
            contentText = await documentExtractor.extractDocxText(fullPath, 50000);
          } catch (e) {
            console.warn('[AI Tools] DOCX text extraction failed:', e?.message);
          }
          content = contentText || content;
          queries.updateResourceFile.run(importResult.internalPath, importResult.mimeType, importResult.size, importResult.hash, existing.thumbnail_data, importResult.originalName, now, resourceId);
        }
      } catch (docxErr) {
        console.warn('[AI Tools] DOCX update failed:', docxErr?.message);
      }
    }

    queries.updateResource.run(title, content, metadata, now, resourceId);

    let metadataObj = null;
    try {
      metadataObj = metadata ? JSON.parse(metadata) : null;
    } catch {
      metadataObj = null;
    }

    // Broadcast so notebook and other viewers get updates in real time when tools run in main (e.g. subagent notebook_add_cell)
    if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
      const broadcastUpdates = { title, updated_at: now };
      if (updates.content !== undefined) broadcastUpdates.content = content;
      if (metadataObj != null) broadcastUpdates.metadata = metadataObj;
      windowManagerRef.broadcast('resource:updated', { id: resourceId, updates: broadcastUpdates });
    }

    return {
      success: true,
      resource: {
        id: resourceId,
        title,
        type: existing.type,
        project_id: existing.project_id,
        metadata: metadataObj,
        updated_at: now,
      },
    };
  } catch (error) {
    console.error('[AI Tools] resourceUpdate error:', error);
    return { success: false, error: error.message };
  }
}

// -----------------------------------------------------------------------------
// Notebook tools
// -----------------------------------------------------------------------------
function parseNotebookContent(content) {
  if (!content || !content.trim()) return { nbformat: 4, nbformat_minor: 1, cells: [], metadata: {} };
  try {
    const parsed = JSON.parse(content);
    if (parsed.nbformat && Array.isArray(parsed.cells)) return parsed;
  } catch {}
  return { nbformat: 4, nbformat_minor: 1, cells: [], metadata: {} };
}

function sourceToString(source) {
  return typeof source === 'string' ? source : (Array.isArray(source) ? source.join('') : '');
}

async function notebookGet(resourceId) {
  const result = await resourceGet(resourceId, { includeContent: true, maxContentLength: 50000 });
  if (!result.success || !result.resource) {
    return { success: false, error: result.error || 'Resource not found' };
  }
  const resource = result.resource;
  if (resource.type !== 'notebook') {
    return { success: false, error: `Resource "${resourceId}" is not a notebook (type: ${resource.type}).` };
  }
  const nb = parseNotebookContent(resource.content);
  const cells = nb.cells.map((cell, idx) => {
    const source = sourceToString(cell.source);
    const item = { index: idx, cell_type: cell.cell_type, source };
    if (cell.cell_type === 'code') {
      item.outputs = cell.outputs?.length ?? 0;
      item.execution_count = cell.execution_count;
    }
    return item;
  });
  return {
    success: true,
    resource_id: resourceId,
    title: resource.title,
    cell_count: cells.length,
    cells,
  };
}

function buildNotebookCell(cellType, source) {
  if (cellType === 'code') {
    return { cell_type: 'code', source, outputs: [], execution_count: null, metadata: {} };
  }
  return { cell_type: 'markdown', source, metadata: {} };
}

async function notebookAddCell(resourceId, cellType, source, position) {
  const getResult = await resourceGet(resourceId, { includeContent: true, maxContentLength: 50000 });
  if (!getResult.success || !getResult.resource) {
    return { success: false, error: getResult.error || 'Notebook not found' };
  }
  if (getResult.resource.type !== 'notebook') {
    return { success: false, error: 'Resource is not a notebook.' };
  }
  const nb = parseNotebookContent(getResult.resource.content);
  const newCell = buildNotebookCell(cellType, source);
  const pos = position != null && position >= 0 && position <= nb.cells.length ? position : nb.cells.length;
  nb.cells.splice(pos, 0, newCell);
  const newContent = JSON.stringify(nb, null, 0);
  const updateResult = await resourceUpdate(resourceId, { content: newContent });
  if (!updateResult.success) return { success: false, error: updateResult.error || 'Failed to update notebook' };
  return { success: true, message: `Added ${cellType} cell at position ${pos}.`, resource_id: resourceId, cell_index: pos, cell_type: cellType };
}

async function notebookUpdateCell(resourceId, cellIndex, source) {
  const getResult = await resourceGet(resourceId, { includeContent: true, maxContentLength: 50000 });
  if (!getResult.success || !getResult.resource) {
    return { success: false, error: getResult.error || 'Notebook not found' };
  }
  if (getResult.resource.type !== 'notebook') {
    return { success: false, error: 'Resource is not a notebook.' };
  }
  const nb = parseNotebookContent(getResult.resource.content);
  if (cellIndex >= nb.cells.length) {
    return { success: false, error: `Cell index ${cellIndex} out of range (notebook has ${nb.cells.length} cells).` };
  }
  nb.cells[cellIndex] = { ...nb.cells[cellIndex], source };
  const newContent = JSON.stringify(nb, null, 0);
  const updateResult = await resourceUpdate(resourceId, { content: newContent });
  if (!updateResult.success) return { success: false, error: updateResult.error || 'Failed to update notebook' };
  return { success: true, message: `Updated cell ${cellIndex}.`, resource_id: resourceId, cell_index: cellIndex };
}

async function notebookDeleteCell(resourceId, cellIndex) {
  const getResult = await resourceGet(resourceId, { includeContent: true, maxContentLength: 50000 });
  if (!getResult.success || !getResult.resource) {
    return { success: false, error: getResult.error || 'Notebook not found' };
  }
  if (getResult.resource.type !== 'notebook') {
    return { success: false, error: 'Resource is not a notebook.' };
  }
  const nb = parseNotebookContent(getResult.resource.content);
  if (nb.cells.length <= 1) {
    return { success: false, error: 'Cannot delete the last cell. A notebook must have at least one cell.' };
  }
  if (cellIndex >= nb.cells.length) {
    return { success: false, error: `Cell index ${cellIndex} out of range (notebook has ${nb.cells.length} cells).` };
  }
  nb.cells.splice(cellIndex, 1);
  const newContent = JSON.stringify(nb, null, 0);
  const updateResult = await resourceUpdate(resourceId, { content: newContent });
  if (!updateResult.success) return { success: false, error: updateResult.error || 'Failed to update notebook' };
  return { success: true, message: `Deleted cell ${cellIndex}.`, resource_id: resourceId, cell_count: nb.cells.length };
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

/**
 * Move a resource (or folder) to a target folder or to root.
 * Prevents cycles when moving folders into their descendants.
 * @param {string} resourceId - Resource ID to move
 * @param {string|null} folderId - Target folder ID, or null to move to root
 * @returns {Promise<Object>}
 */
async function resourceMoveToFolder(resourceId, folderId) {
  try {
    if (!resourceId) {
      return { success: false, error: 'Resource ID is required' };
    }

    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    if (folderId != null && folderId !== '') {
      const folder = queries.getResourceById.get(folderId);
      if (!folder) {
        return { success: false, error: 'Folder not found' };
      }
      if (folder.type !== 'folder') {
        return { success: false, error: 'Target is not a folder' };
      }
      if (resourceId === folderId) {
        return { success: false, error: 'Cannot move folder into itself' };
      }
      // Prevent cycle: moving folder A into B where B is inside A
      if (resource.type === 'folder') {
        let current = folder;
        while (current && current.folder_id) {
          if (current.folder_id === resourceId) {
            return { success: false, error: 'Cannot move folder into its own descendant (would create a cycle)' };
          }
          current = queries.getResourceById.get(current.folder_id);
        }
      }
    }

    const now = Date.now();
    const targetFolderId = folderId == null || folderId === '' ? null : folderId;

    if (targetFolderId) {
      queries.moveResourceToFolder.run(targetFolderId, now, resourceId);
    } else {
      queries.removeResourceFromFolder.run(now, resourceId);
    }

    return { success: true, resource_id: resourceId, folder_id: targetFolderId };
  } catch (error) {
    console.error('[AI Tools] resourceMoveToFolder error:', error);
    return { success: false, error: error.message };
  }
}

// =============================================================================
// Flashcard Tools
// =============================================================================

/**
 * Create a flashcard deck from AI-generated Q&A pairs
 * @param {Object} data - Flashcard deck data
 * @param {string} [data.resource_id] - Source resource ID
 * @param {string} data.project_id - Project ID
 * @param {string} data.title - Deck title
 * @param {string} [data.description] - Deck description
 * @param {Array<{question: string, answer: string, difficulty?: string, tags?: string}>} data.cards - Cards to create
 * @returns {Promise<Object>}
 */
async function flashcardCreate(data) {
  try {
    if (!data || !data.title || !data.cards || !Array.isArray(data.cards) || data.cards.length === 0) {
      const out = { success: false, error: 'Title and at least one card are required' };
      traceLog('flashcardCreate', { title: data?.title, cardsCount: data?.cards?.length }, out);
      return out;
    }

    const db = database.getDB();
    const queries = database.getQueries();
    const crypto = require('crypto');

    // Determine project ID (must exist for FK constraint)
    let projectId = data.project_id;
    if (!projectId) {
      const currentProject = await getCurrentProject();
      projectId = currentProject?.id || 'default';
    }
    const projectExists = queries.getProjectById.get(projectId);
    if (!projectExists) {
      projectId = 'default';
      const defaultExists = queries.getProjectById.get('default');
      if (!defaultExists) {
        const out = { success: false, error: 'No valid project found. Create a project first.' };
        traceLog('flashcardCreate', { title: data?.title }, out);
        return out;
      }
    }

    // Validate resource_id exists (FK constraint); use null if invalid
    let resourceId = data.resource_id || null;
    if (resourceId) {
      const resourceExists = queries.getResourceById.get(resourceId);
      if (!resourceExists) {
        resourceId = null;
      }
    }

    const now = Date.now();
    const deckId = crypto.randomUUID();

    // Create deck
    queries.createFlashcardDeck.run(
      deckId,
      resourceId,
      projectId,
      data.title.trim(),
      data.description || null,
      data.cards.length,
      null, // tags
      null, // settings
      now,
      now
    );

    // Sanitize card values for SQLite (arrays/objects must be stringified to avoid "Too many parameter values")
    function sanitizeCardValue(val) {
      if (val == null || val === '') return null;
      if (typeof val === 'string') return val;
      if (Array.isArray(val) || typeof val === 'object') return JSON.stringify(val);
      return String(val);
    }

    // Bulk create cards in a transaction
    const insertCards = db.transaction((cards) => {
      for (const card of cards) {
        if (!card.question || !card.answer) continue;
        const cardId = crypto.randomUUID();
        const difficulty = ['easy', 'medium', 'hard'].includes(card.difficulty) ? card.difficulty : 'medium';
        const tags = sanitizeCardValue(card.tags);
        queries.createFlashcard.run(
          cardId,
          deckId,
          String(card.question).trim(),
          String(card.answer).trim(),
          difficulty,
          tags,
          null, // metadata
          2.5, // ease_factor
          0,   // interval
          0,   // repetitions
          null, // next_review_at
          null, // last_reviewed_at
          now,
          now
        );
      }
    });

    insertCards(data.cards);

    // Get final card count
    const allCards = queries.getFlashcardsByDeck.all(deckId);

    // Create studio_output for unified Studio list (type=flashcards)
    const studioOutputId = crypto.randomUUID();
    const now2 = Date.now();
    db.prepare(`
      INSERT INTO studio_outputs (id, project_id, type, title, content, source_ids, file_path, metadata, deck_id, resource_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studioOutputId,
      projectId,
      'flashcards',
      data.title.trim(),
      null, // content - flashcards use deck
      data.source_ids ? (typeof data.source_ids === 'string' ? data.source_ids : JSON.stringify(data.source_ids)) : null,
      null,
      null,
      deckId,
      resourceId,
      now2,
      now2
    );

    // Update deck with studio_output_id backlink
    db.prepare('UPDATE flashcard_decks SET studio_output_id = ? WHERE id = ?').run(studioOutputId, deckId);

    const studioOutput = db.prepare('SELECT * FROM studio_outputs WHERE id = ?').get(studioOutputId);

    const out = {
      success: true,
      deck: {
        id: deckId,
        title: data.title.trim(),
        card_count: allCards.length,
        resource_id: resourceId,
        project_id: projectId,
      },
      studioOutput,
    };
    traceLog('flashcardCreate', { title: data.title, cardsCount: data.cards.length }, { success: true, deckId, cardCount: allCards.length });
    return out;
  } catch (error) {
    traceLog('flashcardCreate', { title: data?.title }, null, error);
    console.error('[AI Tools] flashcardCreate error:', error);
    return { success: false, error: error.message };
  }
}

// =============================================================================
// Web Fetch Tool (LangGraph)
// =============================================================================

/**
 * Fetch and extract content from a web page using BrowserWindow (handles JS, cookies).
 * Used by LangGraph when the AI requests to read a URL.
 * @param {Object} args - Tool arguments
 * @param {string} args.url - URL to fetch (required)
 * @param {number} [args.maxLength=50000] - Max content length
 * @param {boolean} [args.includeMetadata=true] - Include page metadata
 * @returns {Promise<Object>} Result compatible with web_fetch tool format
 */
async function webFetch(args) {
  const url = args?.url;
  if (!url || typeof url !== 'string') {
    return { status: 'error', error: 'URL is required for web_fetch' };
  }
  try {
    new URL(url);
  } catch {
    return { status: 'error', error: 'Invalid URL provided' };
  }

  const maxLength = Math.min(Math.max(1000, parseInt(args?.max_length ?? args?.maxLength ?? 50000, 10) || 50000), 100000);
  const includeMetadata = args?.include_metadata !== false && args?.includeMetadata !== false;

  try {
    const scraped = await webScraper.scrapeUrl(url);
    if (!scraped?.success) {
      return {
        status: 'error',
        error: scraped?.error || 'Failed to fetch page',
      };
    }

    let content = scraped.content || '';
    const truncated = content.length > maxLength;
    if (truncated) {
      content = content.substring(0, maxLength);
    }

    const out = {
      url: scraped.url,
      finalUrl: scraped.url,
      content,
      contentLength: content.length,
      truncated,
      statusCode: 200,
    };
    if (includeMetadata && scraped.metadata) {
      out.metadata = {
        title: scraped.title || scraped.metadata?.title,
        description: scraped.metadata?.description,
        author: scraped.metadata?.author,
        sourceUrl: scraped.url,
      };
    }
    traceLog('webFetch', { url }, { success: true, contentLength: out.contentLength });
    return out;
  } catch (error) {
    traceLog('webFetch', { url }, null, error);
    console.error('[AI Tools] webFetch error:', error);
    return { status: 'error', error: error.message };
  }
}

// =============================================================================
// Web Search Tool (LangGraph / Subagents)
// =============================================================================

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_PERPLEXITY_BASE = 'https://api.perplexity.ai';
const DEFAULT_PERPLEXITY_MODEL = 'perplexity/sonar-pro';

async function webSearch(args) {
  const query = args?.query;
  if (!query || typeof query !== 'string') {
    return { status: 'error', error: 'Query is required for web_search' };
  }

  const braveKey = process.env.BRAVE_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY || process.env.OPENROUTER_API_KEY;
  const provider = perplexityKey ? 'perplexity' : (braveKey ? 'brave' : null);

  if (!provider) {
    return {
      status: 'error',
      error: 'Web search requires BRAVE_API_KEY or PERPLEXITY_API_KEY environment variable.',
    };
  }

  const count = Math.min(Math.max(1, parseInt(args?.count, 10) || 5), 10);
  const timeoutMs = 15000;

  try {
    if (provider === 'perplexity') {
      const endpoint = `${DEFAULT_PERPLEXITY_BASE}/chat/completions`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${perplexityKey}`,
          'HTTP-Referer': 'https://dome.app',
        },
        body: JSON.stringify({
          model: DEFAULT_PERPLEXITY_MODEL,
          messages: [{ role: 'user', content: query }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Perplexity API error (${res.status}): ${detail || res.statusText}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? 'No response';
      traceLog('webSearch', { query, provider }, { success: true });
      return { query, provider: 'perplexity', content, citations: data.citations ?? [] };
    }

    // Brave
    const url = new URL(BRAVE_SEARCH_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(count));
    if (args?.country) url.searchParams.set('country', args.country);
    if (args?.search_lang) url.searchParams.set('search_lang', args.search_lang);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': braveKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Brave Search API error (${res.status}): ${detail || res.statusText}`);
    }

    const data = await res.json();
    const results = Array.isArray(data.web?.results) ? data.web.results : [];
    const mapped = results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      description: r.description ?? '',
      published: r.age ?? undefined,
    }));
    traceLog('webSearch', { query, provider }, { success: true, count: mapped.length });
    return { query, provider: 'brave', count: mapped.length, results: mapped };
  } catch (err) {
    traceLog('webSearch', { query }, null, err);
    return { status: 'error', error: err?.message || String(err) };
  }
}

// =============================================================================
// Deep Research Tool (returns instructions for subagent)
// =============================================================================

function deepResearch(args) {
  const topic = args?.topic || 'General topic';
  const depthRaw = (args?.depth || 'standard').toLowerCase().trim();
  const validDepths = ['quick', 'standard', 'comprehensive'];
  const depth = validDepths.includes(depthRaw) ? depthRaw : 'standard';

  const subtopicCount = depth === 'quick' ? '3-4' : depth === 'comprehensive' ? '6-8' : '4-6';
  const sourceCount = depth === 'quick' ? '3-5' : depth === 'comprehensive' ? '15+' : '8-12';

  return {
    status: 'success',
    message:
      `Research initiated on: "${topic}" at ${depth} depth. ` +
      'Create a research plan with subtopics, then use web_search and web_fetch tools to gather information. ' +
      'After gathering data, synthesize findings into a structured report with type: "deep_research".',
    topic,
    depth,
    instructions: {
      plan: `List ${subtopicCount} subtopics to investigate based on the topic`,
      search: 'Use web_search for each subtopic to find relevant sources',
      fetch: 'Use web_fetch to read key pages and extract detailed information',
      report:
        `Synthesize into a structured report with sections and ${sourceCount} source citations. ` +
        'Include an Executive Summary, Key Findings, Detailed Analysis per subtopic, and a Sources section.',
    },
    output_format: {
      type: 'deep_research',
      schema: {
        title: 'string',
        sections: '[{ id: string, heading: string, content: string (markdown) }]',
        sources: '[{ id: string, title: string, url?: string, snippet: string }]',
      },
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Vector DB management
  setVectorDB,
  getVectorDB,

  // Window manager (for broadcast when tools modify resources in main)
  setWindowManager,


  // Resource tools (read)
  resourceSearch,
  resourceGet,
  resourceList,
  resourceSemanticSearch,
  getLibraryOverview,

  // Resource tools (write)
  resourceCreate,
  resourceUpdate,
  resourceDelete,
  resourceMoveToFolder,

  // Project tools
  projectList,
  projectGet,

  // Interaction tools
  interactionList,

  // Context helpers
  getRecentResources,
  getCurrentProject,

  // Flashcard tools
  flashcardCreate,

  // Web tools (LangGraph)
  webFetch,
  webSearch,
  deepResearch,

  // Notebook tools
  notebookGet,
  notebookAddCell,
  notebookUpdateCell,
  notebookDeleteCell,

  // Excel tools
  excelGet: excelToolsHandler.excelGet,
  excelGetFilePath: excelToolsHandler.excelGetFilePath,
  excelSetCell: excelToolsHandler.excelSetCell,
  excelSetRange: excelToolsHandler.excelSetRange,
  excelAddRow: excelToolsHandler.excelAddRow,
  excelAddSheet: excelToolsHandler.excelAddSheet,
  excelCreate: excelToolsHandler.excelCreate,
  excelExport: excelToolsHandler.excelExport,

  // PPT tools
  pptCreate: pptToolsHandler.pptCreate,
  pptGetFilePath: pptToolsHandler.pptGetFilePath,
  pptExport: pptToolsHandler.pptExport,
  pptGetSlides: pptToolsHandler.pptGetSlides,
};
