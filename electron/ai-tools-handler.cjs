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
const semanticIndexScheduler = require('./semantic-index-scheduler.cjs');
const path = require('path');
const skillRegistry = require('./skills/registry.cjs');
const { renderSkillBody } = require('./skills/renderer.cjs');

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

    // --- PDFs: prefer vision/cloud transcript in `content`, else raw extraction ---
    if (includeContent && resource.type === 'pdf') {
      const body = String(resource.content || '').trim();
      if (body) {
        if (body.length > maxLen) {
          result.content = body.substring(0, maxLen);
          result.content_truncated = true;
          result.full_length = body.length;
        } else {
          result.content = body;
          result.content_truncated = false;
        }
        result.content_source = 'pdf_transcript';
      } else {
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
              result.indexing_note =
                'Transcripción del índice aún no disponible; texto extraído con pdf.js. Reintenta tras indexar en Ajustes.';
            }
          } catch (e) {
            console.warn('[AI Tools] PDF raw extraction failed for', resourceId, e.message);
          }
        }
      }
    }

    // --- URLs: prefer scraped article/page content over the stored URL string ---
    if (includeContent && !result.content && resource.type === 'url' && typeof metadata?.scraped_content === 'string') {
      if (metadata.scraped_content.length > maxLen) {
        result.content = metadata.scraped_content.substring(0, maxLen);
        result.content_truncated = true;
        result.full_length = metadata.scraped_content.length;
      } else {
        result.content = metadata.scraped_content;
        result.content_truncated = false;
      }
      result.content_source = 'scraped_content';
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
 * Get full text of a semantic chunk by chunk_id (format: `resourceId#chunk_index` from resource_semantic_search).
 * @param {string} resourceId - Resource ID
 * @param {string} chunkId - Chunk id e.g. "uuid#3"
 * @returns {Promise<Object>}
 */
async function resourceGetSection(resourceId, chunkId) {
  try {
    if (!resourceId || !chunkId) {
      return { success: false, error: 'resource_id and chunk_id are required' };
    }

    const q = database.getQueries();
    const resource = q.getResourceById?.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    const rows = q.getChunksBatchByIds.all(JSON.stringify([String(chunkId)]));
    const row = rows && rows[0];
    if (!row || row.resource_id !== resourceId) {
      return {
        success: false,
        error: 'Chunk not found. Use chunk_id from resource_semantic_search results.',
      };
    }

    return {
      success: true,
      resource_id: resourceId,
      title: resource.title,
      chunk_id: chunkId,
      chunk_index: row.chunk_index,
      page_number: row.page_number ?? null,
      text: row.text || '',
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
 * Semantic search over Nomic chunk embeddings (`resource_chunks`).
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
    semanticIndexScheduler.init(database);

    const hits = await semanticIndexScheduler.getIndexer().searchSemantic(query, { limit: limit * 3 });

    if (!hits || hits.length === 0) {
      return resourceSearch(query, options);
    }

    let filtered = hits;
    if (options.project_id) {
      const db = database.getDB ? database.getDB() : null;
      const inProject = new Set(
        (db
          ? db.prepare('SELECT id FROM resources WHERE project_id = ?').all(options.project_id)
          : []
        ).map((r) => r.id),
      );
      filtered = hits.filter((h) => inProject.has(h.resource_id));
    }

    const results = filtered.slice(0, limit).map((h) => {
      const resource = queries.getResourceById.get(h.resource_id);
      if (!resource) return null;
      let metadata = null;
      try {
        metadata = resource.metadata ? JSON.parse(resource.metadata) : null;
      } catch {
        metadata = null;
      }
      const chunkId = `${h.resource_id}#${h.chunk_index}`;
      return {
        id: resource.id,
        title: resource.title,
        type: resource.type,
        project_id: resource.project_id,
        similarity: h.score,
        snippet: h.snippet || '',
        chunk_id: chunkId,
        chunk_index: h.chunk_index,
        page_number: h.page_number ?? null,
        char_start: h.char_start,
        char_end: h.char_end,
        search_hint: `Para el texto completo del fragmento: resource_get_section("${h.resource_id}", "${chunk_id}")`,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
        metadata,
      };
    }).filter(Boolean);

    return {
      success: true,
      query,
      method: 'semantic_chunks',
      count: results.length,
      results,
      navigation_note:
        results.length > 0
          ? 'Cada resultado incluye chunk_id. Usa resource_get_section(resource_id, chunk_id) para el fragmento completo; pdf_render_page para ver la página como imagen.'
          : null,
    };
  } catch (error) {
    console.error('[AI Tools] resourceSemanticSearch error:', error);
    return resourceSearch(query, options);
  }
}

/**
 * Render one PDF page to PNG (data URL) for visual inspection in chat.
 * @param {{ resource_id: string, page_number: number, scale?: number }} params
 */
async function pdfRenderPage(params = {}) {
  try {
    const resourceId = params.resource_id;
    const pageNumber = Math.max(1, Math.floor(Number(params.page_number) || 1));
    if (!resourceId) {
      return { success: false, error: 'resource_id required' };
    }
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource || resource.type !== 'pdf' || !resource.internal_path) {
      return { success: false, error: 'Not a PDF resource with a file' };
    }
    const pdfExtractor = require('./pdf-extractor.cjs');
    const fullPath = fileStorage.getFullPath(resource.internal_path);
    if (!fullPath) {
      return { success: false, error: 'File not found' };
    }
    const scale = Number(params.scale) > 0 ? Number(params.scale) : 1.25;
    const rend = await pdfExtractor.renderPdfPagePngDataUrl(fullPath, pageNumber, scale);
    if (!rend.success || !rend.dataUrl) {
      return { success: false, error: rend.error || 'render failed' };
    }
    return {
      success: true,
      resource_id: resourceId,
      page_number: pageNumber,
      mime: 'image/png',
      data_url: rend.dataUrl,
    };
  } catch (e) {
    console.error('[AI Tools] pdfRenderPage:', e);
    return { success: false, error: e.message };
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
async function getRecentResources(limit = 5, automationProjectId = null) {
  try {
    const queries = database.getQueries();
    const cap = Math.min(Math.max(1, limit || 5), 50);
    const fetchN = automationProjectId ? Math.min(500, cap * 30) : cap;
    const resources = queries.getAllResources.all(fetchN);

    let mapped = resources.map(r => ({
      id: r.id,
      title: r.title,
      type: r.type,
      project_id: r.project_id,
      updated_at: r.updated_at,
    }));
    if (automationProjectId) {
      mapped = mapped.filter((r) => r.project_id === automationProjectId).slice(0, cap);
    }
    return mapped;
  } catch (error) {
    console.error('[AI Tools] getRecentResources error:', error);
    return [];
  }
}

/**
 * Get current/default project
 * @returns {Promise<Object|null>}
 */
async function getCurrentProject(automationProjectId = null) {
  try {
    const queries = database.getQueries();

    if (automationProjectId) {
      const scoped = queries.getProjectById.get(automationProjectId);
      if (scoped) {
        return {
          id: scoped.id,
          name: scoped.name,
          description: scoped.description,
        };
      }
    }

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
/**
 * Convert a markdown string to TipTap ProseMirror JSON format.
 * Handles headings, bold, italic, code, bullet/ordered lists,
 * horizontal rules, code blocks, and paragraphs.
 */
function normalizeAiNoteMarkdown(markdown, title, queries, metadata = {}) {
  const linkedResourceIds = new Set();
  let text = String(markdown || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { markdown: '', linkedResourceIds: [] };

  const explicitSourceIds = [
    metadata.sourceResourceId,
    metadata.source_resource_id,
    metadata.originResourceId,
    metadata.origin_resource_id,
  ].filter((value) => typeof value === 'string' && value.trim());

  const resolveResourceMention = (resourceId) => {
    const resource = queries.getResourceById?.get(resourceId);
    if (!resource) return null;
    linkedResourceIds.add(resource.id);
    const label = String(resource.title || resource.id).replace(/[\]]/g, '');
    return `@[${label}](${resource.id})`;
  };

  text = text
    .split('\n')
    .map((line) => {
      const origin = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(nota origen|source note|original note)(?:\*\*)?\s*[:|]\s*([A-Za-z0-9_-]{8,})\s*$/i);
      if (!origin) return line;
      const mention = resolveResourceMention(origin[2]);
      return mention ? `> **Nota origen:** ${mention}` : line;
    })
    .join('\n');

  for (const sourceId of explicitSourceIds) {
    if (text.includes(String(sourceId))) continue;
    const mention = resolveResourceMention(String(sourceId));
    if (mention) {
      text = `> **Nota origen:** ${mention}\n\n${text}`;
    }
  }

  if (!/^#\s+/m.test(text) && title) {
    text = `# ${String(title).trim()}\n\n${text}`;
  }

  const lines = text.split('\n');
  const normalizedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    normalizedLines.push(isTableRow ? line.replace(/\s*\|\s*/g, ' | ').replace(/^\s*/, '').replace(/\s*$/, '') : line);
    const next = lines[i + 1] || '';
    if (isTableRow && !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next) && /^\s*\|.*\|\s*$/.test(next)) {
      const columns = line.split('|').filter(Boolean).length;
      normalizedLines.push(`| ${Array.from({ length: columns }, () => '---').join(' | ')} |`);
    }
  }

  return {
    markdown: normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    linkedResourceIds: Array.from(linkedResourceIds),
  };
}

function createManualResourceRelation(queries, sourceId, targetId, label = 'source_note') {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const now = Date.now();
  const id = `${sourceId}__${targetId}`;
  const existing = queries.getSemanticRelationByPair?.get(sourceId, targetId);
  if (existing) {
    if (existing.relation_type === 'auto' || existing.relation_type === 'rejected') {
      database.getDB().prepare(`
        UPDATE semantic_relations
        SET relation_type = 'manual', similarity = 1.0, detected_at = ?, label = COALESCE(?, label), confirmed_at = NULL
        WHERE id = ?
      `).run(now, label, existing.id);
    }
    return;
  }
  try {
    queries.insertSemanticRelation?.run(id, sourceId, targetId, 1.0, 'manual', label, now, null);
  } catch (error) {
    if (!String(error.message || error).includes('UNIQUE')) throw error;
  }
}

function markdownToTipTapJSON(markdown) {
  if (!markdown || !markdown.trim()) {
    return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
  }

  // If it already looks like TipTap JSON, return as-is
  try {
    const parsed = JSON.parse(markdown);
    if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
      return markdown;
    }
  } catch (_) { /* not JSON, continue */ }

  const lines = markdown.split('\n');
  const nodes = [];
  let i = 0;

  function parseInline(text) {
    const parts = [];
    // Pattern: @[resource](id), **bold**, *italic*, `code`, ~~strike~~
    const re = /(@\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|~~(.+?)~~)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        parts.push({ type: 'text', text: text.slice(last, m.index) });
      }
      if (m[2] !== undefined) {
        parts.push({
          type: 'mention',
          attrs: {
            id: m[3],
            label: m[2],
            resourceType: 'note',
            mentionSuggestionChar: '@',
          },
        });
      } else if (m[4] !== undefined) {
        parts.push({ type: 'text', marks: [{ type: 'bold' }], text: m[4] });
      } else if (m[5] !== undefined) {
        parts.push({ type: 'text', marks: [{ type: 'italic' }], text: m[5] });
      } else if (m[6] !== undefined) {
        parts.push({ type: 'text', marks: [{ type: 'code' }], text: m[6] });
      } else if (m[7] !== undefined) {
        parts.push({ type: 'text', marks: [{ type: 'strike' }], text: m[7] });
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      parts.push({ type: 'text', text: text.slice(last) });
    }
    return parts.length ? parts : [{ type: 'text', text }];
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim() || null;
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push({
        type: 'codeBlock',
        attrs: { language: lang },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      nodes.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const tableRows = [];
      const headerCells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      tableRows.push({
        type: 'tableRow',
        content: headerCells.map((cell) => ({
          type: 'tableHeader',
          content: [{ type: 'paragraph', content: parseInline(cell) }],
        })),
      });
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].split('|').slice(1, -1).map((cell) => cell.trim());
        tableRows.push({
          type: 'tableRow',
          content: cells.map((cell) => ({
            type: 'tableCell',
            content: [{ type: 'paragraph', content: parseInline(cell) }],
          })),
        });
        i++;
      }
      nodes.push({ type: 'table', content: tableRows });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2].trim()),
      });
      i++;
      continue;
    }

    // Bullet list
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        const text = lines[i].replace(/^[-*+]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(text) }],
        });
        i++;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(text) }],
        });
        i++;
      }
      nodes.push({ type: 'orderedList', attrs: { start: 1 }, content: items });
      continue;
    }

    // Blank line — skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph (accumulate consecutive non-empty lines)
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|[-*+]\s|\d+\.\s|```|---)/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      const content = [];
      paraLines.forEach((pl, idx) => {
        content.push(...parseInline(pl));
        if (idx < paraLines.length - 1) content.push({ type: 'hardBreak' });
      });
      nodes.push({ type: 'paragraph', content });
    }
  }

  if (!nodes.length) nodes.push({ type: 'paragraph' });
  return JSON.stringify({ type: 'doc', content: nodes });
}

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

    const requestedType = data.type || 'note';
    const type = requestedType === 'document' ? 'note' : requestedType;
    const validTypes = ['note', 'notebook', 'url', 'folder', 'excel'];
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
    let normalizedNoteLinks = [];
    let metadataForCreate = data.metadata && typeof data.metadata === 'object' ? { ...data.metadata } : null;
    if (type === 'folder') {
      content = '';
    } else if (type === 'note') {
      const normalized = normalizeAiNoteMarkdown(content, data.title, queries, metadataForCreate || {});
      content = markdownToTipTapJSON(normalized.markdown);
      normalizedNoteLinks = normalized.linkedResourceIds;
      if (normalizedNoteLinks.length > 0) {
        metadataForCreate = {
          ...(metadataForCreate || {}),
          sourceResourceIds: normalizedNoteLinks,
          aiNoteNormalized: true,
        };
      }
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

    queries.createResource.run(
      id,
      projectId,
      type,
      data.title.trim(),
      content,
      null, // file_path
      resolvedFolderId,
      metadataForCreate ? JSON.stringify(metadataForCreate) : null,
      now,
      now
    );

    if (type === 'note' && normalizedNoteLinks.length > 0) {
      for (const targetId of normalizedNoteLinks) {
        createManualResourceRelation(queries, id, targetId, 'source_note');
      }
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

    if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
      windowManagerRef.broadcast('resource:created', resource);
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
    let content = updates.content !== undefined ? updates.content : existing.content;

    // Convert markdown to TipTap JSON for note resources
    let normalizedNoteLinks = [];
    if (existing.type === 'note' && updates.content !== undefined) {
      let existingMetaForNormalize = {};
      try { existingMetaForNormalize = existing.metadata ? JSON.parse(existing.metadata) : {}; } catch { existingMetaForNormalize = {}; }
      const normalized = normalizeAiNoteMarkdown(content, title, queries, {
        ...existingMetaForNormalize,
        ...(updates.metadata && typeof updates.metadata === 'object' ? updates.metadata : {}),
      });
      content = markdownToTipTapJSON(normalized.markdown);
      normalizedNoteLinks = normalized.linkedResourceIds;
    }

    // Merge metadata
    let metadata = existing.metadata;
    if (updates.metadata) {
      let existingMeta = {};
      try { existingMeta = metadata ? JSON.parse(metadata) : {}; } catch { existingMeta = {}; }
      metadata = JSON.stringify({ ...existingMeta, ...updates.metadata });
    }
    if (normalizedNoteLinks.length > 0) {
      let existingMeta = {};
      try { existingMeta = metadata ? JSON.parse(metadata) : {}; } catch { existingMeta = {}; }
      metadata = JSON.stringify({
        ...existingMeta,
        sourceResourceIds: Array.from(new Set([...(existingMeta.sourceResourceIds || []), ...normalizedNoteLinks])),
        aiNoteNormalized: true,
      });
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

    if (existing.type === 'note' && normalizedNoteLinks.length > 0) {
      for (const targetId of normalizedNoteLinks) {
        createManualResourceRelation(queries, resourceId, targetId, 'source_note');
      }
    }

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

    if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
      windowManagerRef.broadcast('resource:deleted', { id: resourceId });
    }

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

    if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
      windowManagerRef.broadcast('resource:updated', { id: resourceId, folder_id: targetFolderId });
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
  const selector = typeof args?.selector === 'string' ? args.selector : undefined;

  try {
    const scraped = await webScraper.scrapeUrl({
      url,
      includeMetadata,
      includeScreenshot: false,
      maxLength,
      selector,
    });
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
      finalUrl: scraped.finalUrl || scraped.url,
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
    if (Array.isArray(scraped?.warnings) && scraped.warnings.length > 0) {
      out.warnings = scraped.warnings;
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

const WEB_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const WEB_SEARCH_CACHE = new Map();

function getCachedWebSearchResult(key) {
  const cached = WEB_SEARCH_CACHE.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > WEB_SEARCH_CACHE_TTL_MS) {
    WEB_SEARCH_CACHE.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedWebSearchResult(key, value) {
  WEB_SEARCH_CACHE.set(key, { createdAt: Date.now(), value });
}

async function webSearch(args) {
  const query = args?.query;
  if (!query || typeof query !== 'string') {
    return { status: 'error', error: 'Query is required for web_search' };
  }

  const count = Math.min(Math.max(1, parseInt(args?.count, 10) || 5), 10);
  const timeoutMs = 15000;
  const country = typeof args?.country === 'string' ? args.country : undefined;
  const searchLang = typeof args?.search_lang === 'string' ? args.search_lang : undefined;
  const freshness = typeof args?.freshness === 'string' ? args.freshness : undefined;
  const cacheKey = JSON.stringify({
    query: query.trim(),
    count,
    country: country || '',
    searchLang: searchLang || '',
    freshness: freshness || '',
  });

  try {
    const cached = getCachedWebSearchResult(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    const result = await webScraper.searchWeb({
      query,
      count,
      country,
      searchLang,
      freshness,
      timeoutMs,
    });
    if (!result?.success) {
      throw new Error(result?.error || 'No se pudo completar la búsqueda web.');
    }
    const payload = {
      query,
      provider: result.provider || 'playwright',
      engine: result.engine || 'duckduckgo',
      count: typeof result.count === 'number' ? result.count : Array.isArray(result.results) ? result.results.length : 0,
      results: Array.isArray(result.results) ? result.results : [],
    };
    setCachedWebSearchResult(cacheKey, payload);
    traceLog('webSearch', { query, provider: payload.provider }, { success: true, count: payload.count });
    return payload;
  } catch (err) {
    traceLog('webSearch', { query }, null, err);
    return { status: 'error', error: err?.message || String(err) };
  }
}

async function testWebSearchConnection() {
  const result = await webSearch({ query: 'Dome app', count: 1 });
  if (result?.status === 'error') {
    return { success: false, error: result.error || 'No se pudo validar la búsqueda web con Playwright.' };
  }

  return {
    success: true,
    provider: result.provider || 'playwright',
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
    const { getAllToolDefinitions } = require('./tool-dispatcher.cjs');
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
// File-based skills (SKILL.md) — used by load_skill / load_skill_file
// =============================================================================

function getDisableSkillShell() {
  try {
    const q = database.getQueries();
    const row = q.getSetting.get('disable_skill_shell_execution');
    return row?.value === '1' || row?.value === 'true';
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} args
 */
async function loadSkill(args = {}) {
  const name = String(args.name || args.skill || '').trim();
  if (!name) {
    return { success: false, error: 'name is required (skill slash name, e.g. research-assistant)' };
  }
  const rec = skillRegistry.resolve(name) || skillRegistry.getById(name);
  if (!rec) {
    return { success: false, error: `Skill not found: ${name}. Use the exact /name from ## Available Skills.` };
  }
  if (rec.disable_model_invocation) {
    return {
      success: false,
      error: 'This skill is manual-only. Use / in the input to invoke it, or ask the user to change disable-model-invocation in SKILL.md.',
    };
  }
  if (rec.context === 'fork') {
    return {
      success: false,
      error: 'This skill is configured for context: fork. Use the /skill command in chat or run it from the skills menu; forked subagent is not available in this tool path yet.',
    };
  }
  const body = renderSkillBody(rec.body, {
    argumentsLine: args.arguments != null ? String(args.arguments) : typeof args.A === 'string' ? args.A : '',
    namedArgs: rec.arguments,
    sessionId: String(args.session_id || args.sessionId || ''),
    skillDir: rec.dirPath,
    shell: rec.shell,
    disableSkillShellExecution: getDisableSkillShell(),
  });
  return {
    success: true,
    skill: rec.name,
    content: `## ${rec.name}\n\n${body}`,
  };
}

/**
 * @param {Record<string, unknown>} args
 */
async function loadSkillFile(args = {}) {
  const skill = String(args.skill || args.name || '').trim();
  const rel = String(args.path || '').replace(/^\/+/, '');
  if (!skill || !rel) {
    return { success: false, error: 'skill and path are required' };
  }
  const rec = skillRegistry.resolve(skill) || skillRegistry.getById(skill);
  if (!rec?.dirPath) {
    return { success: false, error: 'Skill not found' };
  }
  const clean = rel.split('/').filter((p) => p && p !== '..' && p !== '.').join(path.sep);
  const full = path.resolve(rec.dirPath, clean);
  const base = path.resolve(rec.dirPath);
  if (full.length < base.length || (!full.startsWith(base + path.sep) && full !== base)) {
    return { success: false, error: 'Invalid path' };
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return { success: false, error: 'File not found' };
  }
  const text = fs.readFileSync(full, 'utf8');
  return {
    success: true,
    path: rel,
    content: text.length > 200_000 ? `${text.slice(0, 200_000)}\n[truncated]` : text,
  };
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
    if (!resource) return { success: false, error: 'Resource not found' };
    const raw = String(resource.content || '');
    if (!raw.trim()) {
      return {
        success: false,
        error: 'No content yet. Wait for semantic indexing (PDF vision transcript) or open the resource.',
      };
    }
    const pages = [];
    const re = /<!--\s*page:(\d+)\s*-->/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      pages.push(Number(m[1]));
    }
    const outline =
      pages.length > 0
        ? `Pages in transcript: ${Math.min(...pages)}–${Math.max(...pages)} (${pages.length} segments)`
        : raw.slice(0, 2000);
    return {
      success: true,
      resource_id,
      title: resource.title || resource_id,
      sections: Math.max(1, pages.length),
      outline,
      structure: [],
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Graph / Resource Linking Tools
// =============================================================================

/**
 * Create a manual semantic relation between two resources (semantic_relations table).
 * @param {Object} params
 * @param {string} params.source_id - ID of the source resource
 * @param {string} params.target_id - ID of the target resource
 * @param {string} [params.relation]   - Optional label stored in semantic_relations.label
 * @param {string} [params.description] - Alias for label
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
    const label = description || (relation && relation !== 'related' ? relation : null);
    const id = `${source_id}__${target_id}`;
    const existing = q.getSemanticRelationByPair?.get(source_id, target_id);
    if (existing) {
      if (existing.relation_type === 'rejected') {
        database
          .getDB()
          .prepare(
            `
          UPDATE semantic_relations
          SET relation_type = 'manual', similarity = 1.0, detected_at = ?, label = COALESCE(?, label), confirmed_at = NULL
          WHERE id = ?
        `,
          )
          .run(now, label, existing.id);
      } else if (existing.relation_type === 'auto') {
        database
          .getDB()
          .prepare(
            `
          UPDATE semantic_relations
          SET relation_type = 'manual', similarity = 1.0, detected_at = ?, label = COALESCE(?, label)
          WHERE id = ?
        `,
          )
          .run(now, label, existing.id);
      }
    } else {
      try {
        q.insertSemanticRelation?.run(id, source_id, target_id, 1.0, 'manual', label, now, null);
      } catch (e) {
        if (!e.message?.includes('UNIQUE')) throw e;
      }
    }

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
 * Combines semantic_relations (non-rejected) and graph_edges.
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

    for (const lnk of q.getSemanticOutgoing?.all(resource_id) || []) {
      const rel = lnk.label || lnk.relation_type || 'related';
      addResource(lnk.target_id, rel, 'outgoing');
    }
    for (const lnk of q.getSemanticIncoming?.all(resource_id) || []) {
      const rel = lnk.label || lnk.relation_type || 'related';
      addResource(lnk.source_id, rel, 'incoming');
    }

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

/**
 * Generate a semantic similarity graph around a resource.
 * Mirrors the renderer `db:semantic:getGraph` implementation so that
 * LangGraph tool calls from main can produce the same payload.
 * @param {Object} params
 * @param {string} params.focus_resource_id - Center resource
 * @param {number} [params.min_weight=0.35] - Minimum edge similarity (0-1)
 */
async function generateKnowledgeGraph({ focus_resource_id, min_weight } = {}) {
  try {
    if (!focus_resource_id) {
      return { success: false, error: 'focus_resource_id is required' };
    }
    const th = Math.max(0, Math.min(1, Number(min_weight ?? 0.35) || 0.35));
    const center = focus_resource_id;
    const db = database.getDB();

    const nodes = db
      .prepare(
        `
        SELECT r.id, r.title AS label, r.type AS resourceType,
          (SELECT COUNT(*) FROM semantic_relations sr
           WHERE (sr.source_id = r.id OR sr.target_id = r.id)
           AND sr.similarity >= @th
           AND sr.relation_type != 'rejected') AS connectionCount,
          CASE WHEN r.id = @center THEN 1 ELSE 0 END AS isCurrentNote
        FROM resources r
        WHERE r.id IN (
          SELECT source_id FROM semantic_relations
          WHERE target_id = @center AND similarity >= @th AND relation_type != 'rejected'
          UNION
          SELECT target_id FROM semantic_relations
          WHERE source_id = @center AND similarity >= @th AND relation_type != 'rejected'
          UNION SELECT @center
        )
      `,
      )
      .all({ th, center });

    const edges = db
      .prepare(
        `
        SELECT id,
               source_id AS source,
               target_id AS target,
               similarity,
               relation_type,
               label
        FROM semantic_relations
        WHERE (source_id = @center OR target_id = @center)
          AND similarity >= @th
          AND relation_type != 'rejected'
        ORDER BY similarity DESC
        LIMIT 60
      `,
      )
      .all({ center, th });

    return {
      success: true,
      status: 'success',
      graph: {
        node_count: nodes.length,
        edge_count: edges.length,
        focus_node: center,
        nodes: nodes.map((n) => ({
          id: n.id,
          label: n.label || 'Untitled',
          type: n.resourceType || 'note',
        })),
        edges: edges.map((e) => ({
          source: e.source,
          target: e.target,
          relation: e.relation_type,
          weight: e.similarity,
          label: e.label,
        })),
      },
    };
  } catch (error) {
    console.error('[AI Tools] generateKnowledgeGraph error:', error);
    return { success: false, error: error.message };
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
 * Persists to the dedicated many_agents table. Returns ENTITY_CREATED string for artifact block.
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
      let effectiveType = 'note';
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
        } else if (effectiveType === 'note') {
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
      semanticIndexScheduler.init(database);
      if (resource && semanticIndexScheduler.shouldIndex(resource)) {
        semanticIndexScheduler.scheduleSemanticReindex(resourceId);
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
    const now = Date.now();
    const description = typeof args.description === 'string' ? args.description : '';
    const systemInstructions = typeof (args.systemInstructions ?? args.system_instructions) === 'string'
      ? (args.systemInstructions ?? args.system_instructions)
      : '';
    const toolIds = Array.isArray(args.toolIds ?? args.tool_ids) ? (args.toolIds ?? args.tool_ids) : [];
    const iconIndex = typeof args.iconIndex === 'number' && args.iconIndex >= 1 && args.iconIndex <= 18
      ? Math.round(args.iconIndex)
      : Math.floor(Math.random() * 18) + 1;

    const projectId =
      typeof args.projectId === 'string' && args.projectId.trim()
        ? args.projectId.trim()
        : typeof args.project_id === 'string' && args.project_id.trim()
          ? args.project_id.trim()
          : 'default';
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
    queries.createManyAgent.run(
      agent.id,
      projectId,
      agent.name,
      agent.description,
      agent.systemInstructions,
      JSON.stringify(agent.toolIds),
      JSON.stringify(agent.mcpServerIds),
      JSON.stringify(agent.skillIds),
      agent.iconIndex,
      null,
      null,
      0,
      agent.createdAt,
      agent.updatedAt,
    );

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

/**
 * Describe an image resource using the user's cloud LLM (caption).
 */
async function gemmaImageDescribe(args) {
  const cloudLlm = require('./services/cloud-llm.service.cjs');
  const cloudLlmTasks = require('./services/cloud-llm-tasks.cjs');
  const fileStorage = require('./file-storage.cjs');
  if (!cloudLlm.isCloudLlmAvailable(() => database.getQueries())) {
    return { success: false, error: 'Configure an AI provider in Settings (API key, Ollama, or Dome).' };
  }
  const resourceId = args.resource_id || args.resourceId;
  if (!resourceId) return { success: false, error: 'resource_id required' };
  const row = database.getQueries().getResourceById.get(resourceId);
  if (!row || row.type !== 'image') {
    return { success: false, error: 'Resource is not an image' };
  }
  if (!row.internal_path) return { success: false, error: 'Image has no file' };
  const fullPath = fileStorage.getFullPath(row.internal_path);
  if (!fullPath || !fs.existsSync(fullPath)) return { success: false, error: 'Image file not found' };
  const mime = row.file_mime_type || 'image/png';
  const dataUrl = `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
  const gen = (o) => cloudLlm.generateText({ ...o, getQueries: () => database.getQueries(), windowManager: windowManagerRef });
  const text = await cloudLlmTasks.runCaptionOnImageDataUrl(gen, dataUrl);
  return { success: true, description: text };
}

/**
 * Interpret a screenshot (base64) for UI / automation flows (cloud vision).
 */
async function gemmaScreenUnderstand(args) {
  const cloudLlm = require('./services/cloud-llm.service.cjs');
  const cloudLlmTasks = require('./services/cloud-llm-tasks.cjs');
  if (!cloudLlm.isCloudLlmAvailable(() => database.getQueries())) {
    return { success: false, error: 'Configure an AI provider in Settings (API key, Ollama, or Dome).' };
  }
  const imageBase64 = args.image_base64 || args.imageBase64;
  const intent = args.intent ? String(args.intent) : '';
  if (!imageBase64) return { success: false, error: 'image_base64 required' };
  const dataUrl = String(imageBase64).startsWith('data:')
    ? String(imageBase64)
    : `data:image/png;base64,${imageBase64}`;
  const gen = (o) => cloudLlm.generateText({ ...o, getQueries: () => database.getQueries(), windowManager: windowManagerRef });
  const raw = await cloudLlmTasks.runScreenUnderstand(gen, dataUrl, intent);
  return { success: true, analysis: raw };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Window manager (for broadcast when tools modify resources in main)
  setWindowManager,

  /** TipTap JSON helper (shared with transcription IPC) */
  markdownToTipTapJSON,


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

  loadSkill,
  loadSkillFile,

  // Graph / linking tools
  linkResources,
  getRelatedResources,
  generateKnowledgeGraph,

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

  pdfRenderPage,

  gemmaImageDescribe,
  gemmaScreenUnderstand,
};
