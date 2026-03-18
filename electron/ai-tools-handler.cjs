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

function traceLog(fn, params, result, err) {
  if (err) {
    console.error(`[AI:Tools:Handler] ${fn} ERROR:`, err.message);
  }
}

const fs = require('fs');
const database = require('./database.cjs');
const fileStorage = require('./file-storage.cjs');
const documentExtractor = require('./document-extractor.cjs');
const docxConverter = require('./docx-converter.cjs');
const webScraper = require('./web-scraper.cjs');
const excelToolsHandler = require('./excel-tools-handler.cjs');
const pptToolsHandler = require('./ppt-tools-handler.cjs');
const calendarService = require('./calendar-service.cjs');

// Reference to window manager (set by main.cjs) for broadcasting resource:updated when tools modify resources
let windowManagerRef = null;

/**
 * Set window manager reference for broadcasting updates when tools run in main process
 * @param {Object} wm - Window manager instance
 */
function setWindowManager(wm) {
  windowManagerRef = wm;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
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

    // Sanitize FTS5 special chars: " ' * ( ) - : . { } [ ] ^ ~ and reserved words
    const safeQuery = String(query || '')
      .replace(/["'*():.{}[\]^~-]/g, ' ')
      .replace(/\b(AND|OR|NOT)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!safeQuery) {
      traceLog('resourceSearch', { query, options }, { success: true, results: [] });
      return { success: true, results: [] };
    }

    // Build FTS query with prefix matching (only for words with 2+ chars to avoid wildcard issues)
    const words = safeQuery.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length === 0) {
      traceLog('resourceSearch', { query, options }, { success: true, results: [] });
      return { success: true, results: [] };
    }
    const ftsQuery = words.map((word) => `${word}*`).join(' ');

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

    // Fallback: try semantic search on FTS5 syntax errors
    const isFtsError = error?.code === 'SQLITE_ERROR' && /fts5/i.test(String(error?.message || ''));
    if (isFtsError && typeof resourceSemanticSearch === 'function') {
      try {
        const semResult = await resourceSemanticSearch(query, {
          project_id: options.project_id,
          limit: options.limit || 10,
        });
        if (semResult.success && semResult.results?.length > 0) {
          return { ...semResult, fallback: 'semantic' };
        }
      } catch (_) {
        /* ignore fallback errors */
      }
    }

    return {
      success: false,
      error: 'No se pudo completar la búsqueda. Prueba con otros términos.',
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

    // --- PDFs: use PageIndex structure only (no full content dump) ---
    // Return TOC with node_ids so the AI can navigate via resource_semantic_search
    // or resource_get_section(resource_id, node_id) for specific sections.
    if (includeContent && resource.type === 'pdf') {
      try {
        const q = database.getQueries();
        const indexed = q.getPageIndex?.get(resourceId);
        if (indexed?.tree_json) {
          const pageIndexRuntime = require('./pageindex-python.cjs');
          const tree = JSON.parse(indexed.tree_json);
          const sections = pageIndexRuntime.flattenTree(tree).length;
          const outline = pageIndexRuntime.formatTreeAsOutline(tree);

          if (sections > 0 && outline) {
            result.content =
              `[Documento indexado: ${sections} sección(es)]\n` +
              'Estructura (usa resource_get_section con node_id para obtener contenido, o resource_semantic_search para buscar):\n\n' +
              outline;
            result.content_source = 'pageindex';
            result.content_truncated = false;
            result.indexed_sections = sections;
          }
        }
      } catch (e) {
        console.warn('[AI Tools] PageIndex read failed for', resourceId, e.message);
      }

      // Fallback: raw text extraction (only if PageIndex tree doesn't exist yet)
      if (!result.content) {
        const fs = require('fs');
        let fullPath = null;
        if (resource.internal_path) {
          fullPath = fileStorage.getFullPath(resource.internal_path);
        } else if (resource.file_path && fs.existsSync(resource.file_path)) {
          fullPath = resource.file_path;
        }
        if (fullPath && fs.existsSync(fullPath)) {
          try {
            const extracted = await documentExtractor.extractTextFromPDF(fullPath, maxLen);
            if (extracted && extracted.trim()) {
              result.content = extracted;
              result.content_source = 'raw_extraction';
              result.content_truncated = extracted.length >= maxLen;
              result.indexing_note = 'El documento aún no está indexado por PageIndex. El contenido puede estar truncado. Vuelve a intentarlo cuando el índice esté listo (estado: Listo para IA).';
            }
          } catch (e) {
            console.warn('[AI Tools] PDF raw extraction failed for', resourceId, e.message);
          }
        }
      }
    }

    // --- Notes and other types with stored content ---
    if (includeContent && !result.content && resource.content) {
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
 * Get a specific section of an indexed PDF/note by node_id.
 * Use after get_document_structure or resource_semantic_search to navigate the document.
 * @param {string} resourceId - Resource ID
 * @param {string} nodeId - PageIndex node_id (e.g. "0004")
 * @returns {Promise<Object>}
 */
async function resourceGetSection(resourceId, nodeId) {
  try {
    if (!resourceId || !nodeId) {
      return { success: false, error: 'resource_id and node_id are required' };
    }

    const q = database.getQueries();
    const resource = q.getResourceById?.get(resourceId);
    const indexed = q.getPageIndex?.get(resourceId);

    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!indexed?.tree_json) {
      return { success: false, error: 'Document not indexed. Use resource_get for raw content or wait for indexing.' };
    }

    const pageIndexRuntime = require('./pageindex-python.cjs');
    const tree = JSON.parse(indexed.tree_json);
    const found = pageIndexRuntime.findNodeByIdWithPath(tree, nodeId);

    if (!found) {
      return { success: false, error: `Node ${nodeId} not found in document structure` };
    }

    const { node, path: nodePath } = found;
    const start = node.start_index ?? 0;
    const end = node.end_index ?? start;
    const pageRange = `págs. ${start + 1}–${end + 1}`;
    const children = (node.nodes || []).map((n) => ({
      node_id: n.node_id || '',
      title: n.title || 'Sección',
    }));

    return {
      success: true,
      resource_id: resourceId,
      title: resource.title,
      section: {
        node_id: node.node_id || nodeId,
        title: node.title || 'Sección',
        summary: node.summary || '',
        start_index: start,
        end_index: end,
        page_range: pageRange,
        node_path: nodePath,
        children,
      },
    };
  } catch (error) {
    console.error('[AI Tools] resourceGetSection error:', error);
    return { success: false, error: error.message };
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
 * Reasoning-based search using PageIndex (replaces embedding-based semantic search).
 * Falls back to FTS if PageIndex service is unavailable or no documents are indexed.
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {string} [options.project_id] - Filter by project
 * @param {number} [options.limit=10] - Max results
 * @returns {Promise<Object>}
 */
async function resourceSemanticSearch(query, options = {}) {
  try {
    const limit = Math.min(options.limit || 10, 50);
    const queries = database.getQueries();

    // Collect indexed trees (optionally filtered by project)
    let indexedRows = queries.getAllPageIndexedIds.all();

    if (options.project_id) {
      const db = database.getDB ? database.getDB() : null;
      if (db) {
        const projectIds = db.prepare(`
          SELECT resource_id FROM resource_page_index
          WHERE resource_id IN (
            SELECT id FROM resources WHERE project_id = ?
          )
        `).all(options.project_id);
        indexedRows = projectIds;
      }
    }

    if (indexedRows.length === 0) {
      return resourceSearch(query, options);
    }

    // Fetch full tree data
    const trees = indexedRows
      .map(row => queries.getPageIndex.get(row.resource_id))
      .filter(Boolean)
      .map(t => ({ resource_id: t.resource_id, tree_json: t.tree_json }));

    const pageIndexRuntime = require('./pageindex-python.cjs');
    const searchResult = await pageIndexRuntime.search(query, trees, limit, database);

    if (!searchResult.success || !searchResult.results) {
      return resourceSearch(query, options);
    }

    const results = searchResult.results.map(r => {
      const resource = queries.getResourceById.get(r.resource_id);
      if (!resource) return null;

      let metadata = null;
      try {
        metadata = resource.metadata ? JSON.parse(resource.metadata) : null;
      } catch {
        metadata = null;
      }

      const pageRange = r.pages && r.pages.length > 0
        ? `págs. ${r.pages[0] + 1}–${r.pages[r.pages.length - 1] + 1}`
        : '';

      return {
        id: resource.id,
        title: resource.title,
        type: resource.type,
        project_id: resource.project_id,
        similarity: r.score,
        // Full section summary — not truncated, this is the indexed content
        snippet: r.text || '',
        node_id: r.node_id,
        pages: r.pages,
        page_range: pageRange,
        node_title: r.node_title,
        node_path: r.node_path,
        // Hint so the AI knows how to go deeper into this section
        search_hint: r.text
          ? `Para más detalle: usa resource_get_section(resource_id, "${r.node_id}") con el node_id de este resultado.`
          : null,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
        metadata,
      };
    }).filter(Boolean);

    return {
      success: true,
      query,
      method: 'pageindex',
      count: results.length,
      results,
      navigation_note: results.length > 0
        ? 'Resultados de PageIndex: cada resultado incluye node_id. Usa resource_get_section(resource_id, node_id) para obtener el contenido completo de una sección.'
        : null,
    };

  } catch (error) {
    console.error('[AI Tools] resourceSemanticSearch (PageIndex) error:', error);
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
const FALLBACK_SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/';

function getSettingValue(key) {
  try {
    const queries = database.getQueries();
    const row = queries?.getSetting?.get?.(key);
    return typeof row?.value === 'string' && row.value.trim() ? row.value.trim() : '';
  } catch {
    return '';
  }
}

function resolveSiteName(url) {
  if (!url || typeof url !== 'string') return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function decodeHtmlEntities(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');
}

function stripHtml(value) {
  if (!value || typeof value !== 'string') return '';
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function unwrapDuckDuckGoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const decoded = decodeHtmlEntities(rawUrl);
  try {
    const url = new URL(decoded, FALLBACK_SEARCH_ENDPOINT);
    const redirectTarget = url.searchParams.get('uddg');
    return redirectTarget ? decodeURIComponent(redirectTarget) : url.toString();
  } catch {
    return decoded;
  }
}

function parseFallbackSearchResults(html, count) {
  if (!html || typeof html !== 'string') return [];

  const resultRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;
  const results = [];
  let match;

  while ((match = resultRegex.exec(html)) !== null && results.length < count) {
    const rawUrl = match[1] || '';
    const titleHtml = match[2] || '';
    const snippetHtml = match[3] || '';
    const url = unwrapDuckDuckGoUrl(rawUrl);
    const title = stripHtml(titleHtml);
    const description = stripHtml(snippetHtml);

    if (!url || !title) continue;

    results.push({
      title,
      url,
      description,
      siteName: resolveSiteName(url),
    });
  }

  return results;
}

async function runFallbackScrapeSearch(query, count, timeoutMs) {
  const url = new URL(FALLBACK_SEARCH_ENDPOINT);
  url.searchParams.set('q', query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Fallback search scrape error (${res.status}): ${detail || res.statusText}`);
    }

    const html = await res.text();
    const results = parseFallbackSearchResults(html, count);
    return {
      query,
      provider: 'scrape_fallback',
      count: results.length,
      results,
      warning:
        'Brave Search no está configurado. Se usó scraping HTML como fallback; puede fallar, devolver menos resultados o ser menos fiable.',
      degraded: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resolveWebSearchConfig() {
  const configuredProvider = getSettingValue('web_search_provider');
  const braveApiKey = getSettingValue('brave_search_api_key') || process.env.BRAVE_API_KEY || '';
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY || process.env.OPENROUTER_API_KEY || '';

  if (configuredProvider === 'brave') {
    return { provider: 'brave', braveApiKey, perplexityApiKey: '' };
  }

  if (braveApiKey) {
    return { provider: 'brave', braveApiKey, perplexityApiKey: '' };
  }

  if (perplexityApiKey) {
    return { provider: 'perplexity', braveApiKey: '', perplexityApiKey };
  }

  return { provider: 'brave', braveApiKey: '', perplexityApiKey: '' };
}

async function webSearch(args) {
  const query = args?.query;
  if (!query || typeof query !== 'string') {
    return { status: 'error', error: 'Query is required for web_search' };
  }

  const { provider, braveApiKey, perplexityApiKey } = resolveWebSearchConfig();

  const count = Math.min(Math.max(1, parseInt(args?.count, 10) || 5), 10);
  const timeoutMs = 15000;

  try {
    if (provider === 'brave' && !braveApiKey) {
      const fallbackResult = await runFallbackScrapeSearch(query, count, timeoutMs);
      traceLog('webSearch', { query, provider: 'scrape_fallback' }, { success: true, count: fallbackResult.count });
      return fallbackResult;
    }

    if (provider === 'perplexity') {
      const endpoint = `${DEFAULT_PERPLEXITY_BASE}/chat/completions`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${perplexityApiKey}`,
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
        'X-Subscription-Token': braveApiKey,
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
      siteName: resolveSiteName(r.url ?? ''),
    }));
    traceLog('webSearch', { query, provider }, { success: true, count: mapped.length });
    return { query, provider: 'brave', count: mapped.length, results: mapped };
  } catch (err) {
    traceLog('webSearch', { query }, null, err);
    return { status: 'error', error: err?.message || String(err) };
  }
}

async function testWebSearchConnection() {
  const { provider, braveApiKey } = resolveWebSearchConfig();
  if (provider === 'brave' && !braveApiKey) {
    const fallbackResult = await webSearch({ query: 'Dome app', count: 1 });
    if (fallbackResult?.status === 'error') {
      return {
        success: false,
        error: 'Falta la Brave Search API key y el fallback por scraping también falló.',
      };
    }

    return {
      success: true,
      provider: 'scrape_fallback',
      count:
        typeof fallbackResult.count === 'number'
          ? fallbackResult.count
          : Array.isArray(fallbackResult.results)
            ? fallbackResult.results.length
            : 0,
      warning:
        'Brave Search no está configurado. La app está usando scraping HTML como fallback y puede funcionar peor.',
    };
  }

  const result = await webSearch({ query: 'Dome app', count: 1 });
  if (result?.status === 'error') {
    return { success: false, error: result.error || 'No se pudo conectar con Brave Search.' };
  }

  return {
    success: true,
    provider: result.provider || provider,
    count: typeof result.count === 'number' ? result.count : Array.isArray(result.results) ? result.results.length : 0,
  };
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
// Dynamic Context: get_tool_definition
// =============================================================================

/**
 * Get the full schema/definition of any tool (Dome or MCP).
 * Used for dynamic context discovery: agent receives tool names and can load
 * full definitions on demand to reduce token usage.
 * @param {string} toolName - Normalized tool name (e.g. resource_search, stripe_create_payment)
 * @returns {Promise<Object>} { success, definition?, error? }
 */
async function getToolDefinition(toolName) {
  const norm = String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!norm) {
    return { success: false, error: 'tool_name is required' };
  }

  // Dome tools (lazy require to avoid circular dependency)
  try {
    const { getAllToolDefinitions } = require('./ai-chat-with-tools.cjs');
    const all = getAllToolDefinitions();
    const dome = all.find((d) => {
      const n = String(d?.function?.name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_');
      return n === norm;
    });
    if (dome) {
      return { success: true, definition: dome, source: 'dome' };
    }
  } catch (e) {
    console.warn('[AI Tools] getToolDefinition Dome lookup failed:', e?.message);
  }

  // MCP tools
  try {
    const { getMCPTools } = require('./mcp-client.cjs');
    const mcpTools = await getMCPTools(database);
    const mcp = mcpTools.find((t) => {
      const n = String(t?.name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_');
      return n === norm;
    });
    if (mcp) {
      let parameters = { type: 'object', properties: {} };
      if (mcp.schema) {
        try {
          if (typeof mcp.schema.toJSON === 'function') {
            parameters = mcp.schema.toJSON();
          } else if (mcp.schema._def) {
            const zodToJson = require('zod-to-json-schema');
            const fn = zodToJson.zodToJsonSchema || zodToJson.default || zodToJson;
            parameters = typeof fn === 'function' ? fn(mcp.schema) : parameters;
          }
        } catch (_) {
          /* keep default */
        }
      }
      const params = parameters?.properties
        ? parameters
        : { type: 'object', properties: parameters?.properties || {} };
      const def = {
        type: 'function',
        function: {
          name: mcp.name,
          description: mcp.description || '',
          parameters: params,
        },
      };
      return { success: true, definition: def, source: 'mcp' };
    }
  } catch (e) {
    console.warn('[AI Tools] getToolDefinition MCP lookup failed:', e?.message);
  }

  return { success: false, error: `Tool not found: ${norm}` };
}

// =============================================================================
// Memory / Personality Tools
// =============================================================================

async function rememberFact(key, value) {
  const personalityLoader = require('./personality-loader.cjs');
  personalityLoader.updateLongTermMemory(key, value);
  personalityLoader.addMemoryEntry(`**${key}**: ${value}`);
  return { success: true, message: `Remembered: ${key}` };
}

// =============================================================================
// Document Structure Tool
// =============================================================================

/**
 * Get the hierarchical outline/table of contents of an indexed PDF or note.
 * @param {Object} params
 * @param {string} params.resource_id
 * @returns {Promise<Object>}
 */
async function getDocumentStructure({ resource_id } = {}) {
  try {
    if (!resource_id) return { success: false, error: 'resource_id is required' };

    const q = database.getQueries();
    const resource = q.getResourceById?.get(resource_id);
    const indexed = q.getPageIndex?.get(resource_id);

    if (!indexed?.tree_json) {
      return {
        success: false,
        error: 'Document not indexed yet. Trigger indexing or use resource_get for content.',
      };
    }

    const pageIndexRuntime = require('./pageindex-python.cjs');
    const tree = JSON.parse(indexed.tree_json);
    const outline = pageIndexRuntime.formatTreeAsOutline(tree);
    const structure = pageIndexRuntime.buildStructureArray(tree);
    const sections = pageIndexRuntime.flattenTree(tree).length;

    return {
      success: true,
      resource_id,
      title: resource?.title || resource_id,
      sections,
      outline,
      structure,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Docling Image Tools (figures, charts from converted PDFs)
// =============================================================================

/**
 * List all Docling-extracted images for a resource.
 * @param {string} resourceId
 * @returns {Promise<Object>}
 */
async function doclingGetResourceImages(resourceId) {
  try {
    if (!resourceId) return { success: false, error: 'resource_id is required' };
    const queries = database.getQueries();
    const rows = queries.getResourceImages.all(resourceId);
    const images = rows.map((r) => ({
      id: r.id,
      image_id: r.id,
      image_index: r.image_index,
      page_no: r.page_no,
      caption: r.caption,
    }));
    return { success: true, images };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get a single Docling image as base64 data URI.
 * Returns format compatible with imageResult for chat display.
 * @param {string} imageId
 * @param {string} [resourceId] - Optional for context in extraText
 * @returns {Promise<Object>}
 */
async function doclingGetImageData(imageId, resourceId) {
  try {
    if (!imageId) return { success: false, error: 'image_id is required' };
    const queries = database.getQueries();
    const img = queries.getResourceImageById.get(imageId);
    if (!img) return { success: false, error: 'Image not found' };
    const imgPath = fileStorage.getFullPath(img.internal_path);
    if (!fs.existsSync(imgPath)) return { success: false, error: 'Image file not found on disk' };
    const buffer = fs.readFileSync(imgPath);
    const base64 = buffer.toString('base64');
    const mimeType = img.file_mime_type || 'image/png';
    const captionParts = [];
    if (img.caption) captionParts.push(img.caption);
    if (img.page_no != null) captionParts.push(`Page ${img.page_no}`);
    if (resourceId) captionParts.push(`Resource: ${resourceId}`);
    const extraText = captionParts.length > 0 ? captionParts.join(' | ') : `Artifact: ${imageId}`;
    return {
      content: [
        { type: 'text', text: extraText },
        { type: 'image', data: base64, mimeType },
      ],
      details: { image_id: imageId, resource_id: resourceId, page_no: img.page_no, caption: img.caption },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get multiple Docling images for a resource (optionally filtered by page).
 * Returns content array for inline display in chat.
 * @param {Object} params
 * @param {string} params.resource_id
 * @param {number} [params.page_no]
 * @param {number} [params.max_images=3]
 * @returns {Promise<Object>}
 */
async function doclingShowPageImages({ resource_id, page_no, max_images = 3 } = {}) {
  try {
    if (!resource_id) return { success: false, error: 'resource_id is required' };
    const listResult = await doclingGetResourceImages(resource_id);
    if (!listResult.success) return listResult;
    let images = listResult.images || [];
    if (page_no != null) images = images.filter((img) => img.page_no === page_no);
    images = images.slice(0, Math.min(max_images, 5));
    if (images.length === 0) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: page_no != null
              ? `No visual artifacts found on page ${page_no}.`
              : 'No visual artifacts found. The document may not have been converted with Docling yet.',
          },
        ],
        details: { resource_id, page_no, shown_count: 0 },
      };
    }
    const contentParts = [];
    contentParts.push({
      type: 'text',
      text: `Showing ${images.length} artifact${images.length > 1 ? 's' : ''}${page_no != null ? ` from page ${page_no}` : ''} of resource ${resource_id}:`,
    });
    for (const img of images) {
      const dataResult = await doclingGetImageData(img.id, resource_id);
      if (!dataResult.content) continue;
      const imgBlock = dataResult.content.find((c) => c.type === 'image');
      if (!imgBlock) continue;
      const label =
        img.caption
          ? `Figure ${img.image_index + 1}: ${img.caption}${img.page_no != null ? ` (p.${img.page_no})` : ''}`
          : `Figure ${img.image_index + 1}${img.page_no != null ? ` (p.${img.page_no})` : ''}`;
      contentParts.push({ type: 'text', text: label });
      contentParts.push({ type: 'image', data: imgBlock.data, mimeType: imgBlock.mimeType });
    }
    return {
      success: true,
      content: contentParts,
      details: { resource_id, page_no, shown_count: images.length },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Graph / Resource Linking Tools
// =============================================================================

/**
 * Create a semantic link between two resources.
 * Writes to resource_links and creates a graph_edge between their nodes.
 * @param {Object} params
 * @param {string} params.source_id - ID of the source resource
 * @param {string} params.target_id - ID of the target resource
 * @param {string} [params.relation]   - Relationship label (default: 'related')
 * @param {string} [params.description] - Optional note about the relationship
 */
async function linkResources({ source_id, target_id, relation = 'related', description = '' } = {}) {
  try {
    if (!source_id || !target_id) return { success: false, error: 'source_id and target_id are required' };
    if (source_id === target_id) return { success: false, error: 'Cannot link a resource to itself' };

    const q = database.getQueries();
    const source = q.getResourceById?.get(source_id);
    const target = q.getResourceById?.get(target_id);
    if (!source) return { success: false, error: `Resource ${source_id} not found` };
    if (!target) return { success: false, error: `Resource ${target_id} not found` };

    const now = Date.now();
    const linkId = `link-${source_id.slice(-8)}-${target_id.slice(-8)}-${now}`;

    try {
      q.createLink?.run(linkId, source_id, target_id, relation, description || null, now);
    } catch (e) {
      if (!e.message?.includes('UNIQUE')) throw e;
      // Already linked — update the graph edge anyway
    }

    // Mirror in the knowledge graph
    const edgeId = `edge-${source_id.slice(-8)}-${target_id.slice(-8)}-${now}`;
    try {
      q.createGraphEdge?.run(edgeId, `node-${source_id}`, `node-${target_id}`, relation, 1.0, description || null, now, now);
    } catch { /* non-fatal if graph nodes missing */ }

    return {
      success: true,
      source: { id: source_id, title: source.title, type: source.type },
      target: { id: target_id, title: target.title, type: target.type },
      relation,
      message: `"${source.title}" → "${target.title}" (${relation})`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get all resources linked to or from a given resource.
 * Combines resource_links (both directions) and graph_edges.
 * @param {Object} params
 * @param {string} params.resource_id - Resource to query neighbors for
 */
async function getRelatedResources({ resource_id } = {}) {
  try {
    if (!resource_id) return { success: false, error: 'resource_id is required' };

    const q = database.getQueries();
    const resource = q.getResourceById?.get(resource_id);
    if (!resource) return { success: false, error: `Resource ${resource_id} not found` };

    const seen = new Set([resource_id]);
    const related = [];

    const addResource = (rid, relation, direction) => {
      if (seen.has(rid)) return;
      seen.add(rid);
      const r = q.getResourceById?.get(rid);
      if (r) related.push({ id: r.id, title: r.title, type: r.type, relation, direction });
    };

    for (const lnk of q.getLinksBySource?.all(resource_id) || []) addResource(lnk.target_id, lnk.link_type, 'outgoing');
    for (const lnk of q.getLinksByTarget?.all(resource_id) || []) addResource(lnk.source_id, lnk.link_type, 'incoming');

    // Also pull graph neighbors
    try {
      const nodeId = `node-${resource_id}`;
      for (const n of q.getNodeNeighbors?.all(nodeId, nodeId, nodeId) || []) {
        if (n.resource_id) addResource(n.resource_id, n.relation, 'graph');
      }
    } catch { /* graph neighbors non-critical */ }

    return {
      success: true,
      resource_id,
      resource_title: resource.title,
      related_count: related.length,
      related,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Calendar Tools
// =============================================================================

/**
 * List calendar events within a date range.
 * @param {Object} params
 * @param {string} [params.start_at] - ISO 8601 string or ms timestamp. Defaults to now.
 * @param {string} [params.end_at]   - ISO 8601 string or ms timestamp. Defaults to 7 days from start.
 * @param {string[]} [params.calendar_ids]
 */
async function calendarListEvents({ start_at, end_at, calendar_ids } = {}) {
  try {
    const toMs = (v) => (typeof v === 'string' ? new Date(v).getTime() : v);
    const startMs = start_at ? toMs(start_at) : Date.now();
    const endMs = end_at ? toMs(end_at) : startMs + 7 * 24 * 60 * 60 * 1000;
    if (isNaN(startMs) || isNaN(endMs)) {
      return { success: false, error: 'Invalid date format for start_at or end_at' };
    }
    return await calendarService.listEvents(startMs, endMs, { calendarIds: calendar_ids || undefined });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get upcoming events starting from now.
 * @param {Object} params
 * @param {number} [params.window_minutes] - Default 60
 * @param {number} [params.limit]          - Default 10
 */
async function calendarGetUpcoming({ window_minutes, limit } = {}) {
  try {
    return await calendarService.getUpcomingEvents(window_minutes ?? 60, limit ?? 10);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Create a new calendar event.
 * @param {Object} data - Event fields: title, description, location, start_at, end_at, all_day, reminders
 */
async function calendarCreateEvent(data = {}) {
  try {
    const result = await calendarService.createEvent(data);
    if (result.success && result.event && windowManagerRef) {
      windowManagerRef.broadcast('calendar:eventCreated', result.event);
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update an existing calendar event.
 * @param {Object} params - event_id (required) + any fields to update
 */
async function calendarUpdateEvent({ event_id, ...updates } = {}) {
  try {
    if (!event_id) return { success: false, error: 'event_id is required' };
    const result = await calendarService.updateEvent(event_id, updates);
    if (result.success && result.event && windowManagerRef) {
      windowManagerRef.broadcast('calendar:eventUpdated', result.event);
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete a calendar event.
 * @param {Object} params
 * @param {string} params.event_id
 */
async function calendarDeleteEvent({ event_id } = {}) {
  try {
    if (!event_id) return { success: false, error: 'event_id is required' };
    const result = await calendarService.deleteEvent(event_id);
    if (result.success && windowManagerRef) {
      windowManagerRef.broadcast('calendar:eventDeleted', { id: event_id });
    }
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Entity Creation (Agents)
// =============================================================================

/**
 * Create a new Many agent (specialized agent / "hijo de Many").
 * Persists to settings.many_agents. Returns ENTITY_CREATED string for artifact block.
 * @param {Object} args
 * @param {string} args.name - Agent name
 * @param {string} [args.description] - Short description
 * @param {string} [args.systemInstructions] - System prompt for the agent
 * @param {string[]} [args.toolIds] - Tool IDs to enable
 * @param {number} [args.iconIndex] - Icon index 1-18
 */
/**
 * Import file content to the Dome library.
 * Used by agents that retrieve files via MCP servers (filesystem, Drive, etc.)
 * and want to save them as resources.
 *
 * @param {{ title, content, content_base64, mime_type, filename, project_id, folder_id }} args
 */
async function importFileToLibrary(args = {}) {
  try {
    const { title, content, content_base64, mime_type, filename, project_id, folder_id } = args;
    if (!title || !title.trim()) {
      return { success: false, error: 'title is required' };
    }
    if (!content && !content_base64) {
      return { success: false, error: 'content or content_base64 is required' };
    }

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const crypto = require('crypto');
    const fileStorage = require('./file-storage.cjs');
    const documentExtractor = require('./document-extractor.cjs');

    // Determine extension
    const ext = filename
      ? path.extname(filename).toLowerCase()
      : mime_type?.includes('pdf') ? '.pdf'
      : mime_type?.includes('docx') || mime_type?.includes('wordprocessingml') ? '.docx'
      : mime_type?.includes('plain') ? '.txt'
      : '.txt';

    // Write to temp file
    const tmpName = `dome-mcp-import-${Date.now()}${ext}`;
    const tempPath = path.join(os.tmpdir(), tmpName);
    try {
      if (content_base64) {
        fs.writeFileSync(tempPath, Buffer.from(content_base64, 'base64'));
      } else {
        fs.writeFileSync(tempPath, content || '', 'utf8');
      }

      // Determine resource type
      let effectiveType = 'document';
      if (ext === '.pdf' || mime_type?.includes('pdf')) effectiveType = 'pdf';

      const importResult = await fileStorage.importFile(tempPath, effectiveType);

      // Check duplicate
      const queries = database.getQueries();
      const existing = queries.findByHash?.get(importResult.hash);
      if (existing) {
        return {
          success: false,
          error: 'duplicate',
          duplicate: { id: existing.id, title: existing.title },
        };
      }

      // Extract text
      const fullPath = fileStorage.getFullPath(importResult.internalPath);
      let contentText = (!content_base64 ? content : null) || null;
      try {
        if (effectiveType === 'pdf') {
          contentText = await documentExtractor.extractTextFromPDF(fullPath, 50000);
        } else if (effectiveType === 'document') {
          contentText = await documentExtractor.extractDocumentText(fullPath, importResult.mimeType);
        }
      } catch { /* keep original text content */ }

      // Create resource
      const resourceId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = Date.now();
      const db = database.getDB();
      const effectiveProjectId = project_id || null;

      queries.createResourceWithFile.run(
        resourceId,
        effectiveProjectId,
        effectiveType,
        title.trim(),
        contentText,
        null,
        importResult.internalPath,
        importResult.mimeType || mime_type || null,
        importResult.size,
        importResult.hash,
        null,
        filename || importResult.originalName || null,
        null,
        now,
        now
      );

      if (folder_id && queries.moveResourceToFolder) {
        queries.moveResourceToFolder.run(folder_id, now, resourceId);
      }

      const resource = queries.getResourceById.get(resourceId);

      // Schedule indexing
      const resourceIndexerLocal = require('./resource-indexer.cjs');
      if (resource && resourceIndexerLocal.shouldIndex(resource)) {
        resourceIndexerLocal.scheduleIndexing(resourceId, { database, windowManager: windowManagerRef, fileStorage });
      }

      return { success: true, resource };
    } finally {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
  } catch (error) {
    console.error('[AI Tools] importFileToLibrary error:', error);
    return { success: false, error: error.message };
  }
}

async function agentCreate(args = {}) {
  try {
    const name = typeof args.name === 'string' ? args.name.trim() : '';
    if (!name) return { status: 'error', error: 'name is required' };

    const queries = database.getQueries();
    const raw = queries?.getSetting?.get?.('many_agents')?.value;
    let agents = [];
    try {
      const parsed = JSON.parse(raw || '[]');
      agents = Array.isArray(parsed) ? parsed : [];
    } catch {
      agents = [];
    }

    const now = Date.now();
    const description = typeof args.description === 'string' ? args.description : '';
    const systemInstructions = typeof (args.systemInstructions ?? args.system_instructions) === 'string'
      ? (args.systemInstructions ?? args.system_instructions)
      : '';
    const toolIds = Array.isArray(args.toolIds ?? args.tool_ids) ? (args.toolIds ?? args.tool_ids) : [];
    const iconIndex = typeof args.iconIndex === 'number' && args.iconIndex >= 1 && args.iconIndex <= 18
      ? Math.round(args.iconIndex)
      : Math.floor(Math.random() * 18) + 1;

    const agent = {
      id: generateId(),
      name,
      description,
      systemInstructions,
      toolIds,
      mcpServerIds: [],
      skillIds: [],
      iconIndex,
      createdAt: now,
      updatedAt: now,
    };
    agents.push(agent);

    queries.setSetting.run('many_agents', JSON.stringify(agents), now);

    if (windowManagerRef) {
      windowManagerRef.broadcast('dome:agents-changed');
    }

    const payload = {
      entityType: 'agent',
      id: agent.id,
      name: agent.name,
      description: agent.description,
      config: {
        tools: toolIds.length > 0 ? toolIds.join(', ') : 'ninguna',
        instrucciones: systemInstructions ? systemInstructions.slice(0, 120) + (systemInstructions.length > 120 ? '…' : '') : '—',
      },
    };
    return `ENTITY_CREATED:${JSON.stringify(payload)}`;
  } catch (err) {
    console.error('[AI Tools] agentCreate error:', err);
    return { status: 'error', error: err.message };
  }
}

// =============================================================================
// automationCreate
// =============================================================================

/**
 * Create a new automation that runs an agent or workflow on a trigger.
 * Persists via run-engine. Returns ENTITY_CREATED string for artifact block.
 * @param {Object} args
 * @param {string} args.title - Automation name
 * @param {string} [args.description] - What this automation does
 * @param {string} [args.targetType] - "agent" or "workflow"
 * @param {string} args.targetId - ID of the target agent or workflow
 * @param {string} [args.triggerType] - "manual" | "schedule" | "contextual"
 * @param {string} [args.prompt] - Base prompt to pass when triggered
 * @param {Object} [args.schedule] - For triggerType "schedule": { cadence?, hour?, weekday?, intervalMinutes? }
 * @param {string} [args.outputMode] - "chat_only" | "note" | "studio_output" | "mixed"
 * @param {boolean} [args.enabled] - Whether active. Default true
 */
async function automationCreate(args = {}) {
  try {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    if (!title) return { status: 'error', error: 'title is required' };

    const targetId = typeof (args.targetId ?? args.target_id) === 'string' ? String(args.targetId ?? args.target_id).trim() : '';
    if (!targetId) return { status: 'error', error: 'targetId is required' };

    const description = typeof args.description === 'string' ? args.description : '';
    const targetTypeRaw = args.targetType ?? args.target_type ?? 'agent';
    const targetType = ['agent', 'workflow', 'many'].includes(targetTypeRaw) ? targetTypeRaw : 'agent';
    const triggerTypeRaw = args.triggerType ?? args.trigger_type ?? 'manual';
    const triggerType = ['manual', 'schedule', 'contextual'].includes(triggerTypeRaw) ? triggerTypeRaw : 'manual';
    const prompt = typeof args.prompt === 'string' ? args.prompt : '';
    const outputModeRaw = args.outputMode ?? args.output_mode ?? 'chat_only';
    const outputMode = ['chat_only', 'note', 'studio_output', 'mixed'].includes(outputModeRaw) ? outputModeRaw : 'chat_only';
    const enabled = typeof args.enabled === 'boolean' ? args.enabled : true;

    let schedule = null;
    if (triggerType === 'schedule' && args.schedule && typeof args.schedule === 'object') {
      const s = args.schedule;
      schedule = {
        cadence: ['daily', 'weekly', 'cron-lite'].includes(s.cadence) ? s.cadence : 'daily',
        hour: typeof s.hour === 'number' ? Math.max(0, Math.min(23, s.hour)) : 0,
        weekday: typeof s.weekday === 'number' ? s.weekday : null,
        intervalMinutes: typeof (s.intervalMinutes ?? s.interval_minutes) === 'number' ? Math.max(1, s.intervalMinutes ?? s.interval_minutes) : null,
      };
    }

    const inputTemplate = prompt ? { prompt } : null;

    const runEngine = require('./run-engine.cjs');
    const automation = runEngine.upsertAutomation({
      title,
      description,
      targetType,
      targetId,
      triggerType,
      schedule,
      inputTemplate,
      outputMode,
      enabled,
    });

    if (windowManagerRef) {
      windowManagerRef.broadcast('dome:automations-changed');
    }

    const payload = {
      entityType: 'automation',
      id: automation.id,
      name: title,
      description,
      config: {
        destino: targetType,
        trigger: triggerType,
        salida: outputMode,
        estado: enabled ? 'Activa' : 'Pausada',
      },
    };
    return `ENTITY_CREATED:${JSON.stringify(payload)}`;
  } catch (err) {
    console.error('[AI Tools] automationCreate error:', err);
    return { status: 'error', error: err.message };
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Window manager (for broadcast when tools modify resources in main)
  setWindowManager,


  // Resource tools (read)
  resourceSearch,
  resourceGet,
  resourceGetSection,
  resourceList,
  resourceSemanticSearch,
  getDocumentStructure,
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
  testWebSearchConnection,
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

  // Dynamic context
  getToolDefinition,

  // Memory tools
  rememberFact,

  // Graph / linking tools
  linkResources,
  getRelatedResources,

  // Calendar tools
  calendarListEvents,
  calendarGetUpcoming,
  calendarCreateEvent,
  calendarUpdateEvent,
  calendarDeleteEvent,

  // Entity creation
  agentCreate,
  automationCreate,

  // MCP file import
  importFileToLibrary,

  // Docling image tools
  doclingGetResourceImages,
  doclingGetImageData,
  doclingShowPageImages,
};
