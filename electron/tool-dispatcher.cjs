/* eslint-disable no-console */
/**
 * Tool Dispatcher - Main Process
 *
 * Canonical registry and dispatcher for Dome tools in the main process.
 * Exposes:
 *   - TOOL_HANDLER_MAP / normalizeToolName: map of tool name → aiToolsHandler method
 *   - executeToolInMain(name, args, ctx): single entry point to run a tool call
 *   - getAllToolDefinitions / getWhatsAppToolDefinitions / getToolDefinitionsByIds / getToolDefsBySubagent:
 *     OpenAI-format definitions used by LangGraph runs (renderer, WhatsApp, workflows, automations).
 *
 * There is no chat loop here. LangGraph is the only chat engine (see langgraph-agent.cjs).
 */

const aiToolsHandler = require('./ai-tools-handler.cjs');
const database = require('./database.cjs');

/**
 * Tool name (normalized) to aiToolsHandler method mapping
 */
const TOOL_HANDLER_MAP = {
  resource_search: 'resourceSearch',
  resource_get: 'resourceGet',
  resource_get_section: 'resourceGetSection',
  resource_list: 'resourceList',
  resource_semantic_search: 'resourceSemanticSearch',
  resource_hybrid_search: 'resourceHybridSearch',
  get_document_structure: 'getDocumentStructure',
  project_list: 'projectList',
  project_get: 'projectGet',
  get_recent_resources: 'getRecentResources',
  get_current_project: 'getCurrentProject',
  get_library_overview: 'getLibraryOverview',
  resource_get_library_overview: 'getLibraryOverview',
  resource_create: 'resourceCreate',
  resource_update: 'resourceUpdate',
  resource_delete: 'resourceDelete',
  resource_move_to_folder: 'resourceMoveToFolder',
  flashcard_create: 'flashcardCreate',
  web_fetch: 'webFetch',
  web_search: 'webSearch',
  deep_research: 'deepResearch',
  excel_get: 'excelGet',
  excel_get_file_path: 'excelGetFilePath',
  excel_set_cell: 'excelSetCell',
  notebook_get: 'notebookGet',
  notebook_add_cell: 'notebookAddCell',
  notebook_update_cell: 'notebookUpdateCell',
  notebook_delete_cell: 'notebookDeleteCell',
  excel_set_range: 'excelSetRange',
  excel_add_row: 'excelAddRow',
  excel_add_sheet: 'excelAddSheet',
  excel_create: 'excelCreate',
  excel_export: 'excelExport',
  ppt_create: 'pptCreate',
  ppt_get_file_path: 'pptGetFilePath',
  ppt_get_slides: 'pptGetSlides',
  ppt_export: 'pptExport',
  memory_search: 'resourceSemanticSearch',
  memory_get: 'resourceGet',
  remember_fact: 'rememberFact',
  // Graph / linking tools
  link_resources: 'linkResources',
  create_resource_link: 'linkResources',
  get_related_resources: 'getRelatedResources',
  interaction_list: 'interactionList',
  generate_knowledge_graph: 'generateKnowledgeGraph',
  generate_mindmap: 'gatherStudioMindmapContext',
  generate_quiz: 'gatherStudioQuizContext',
  analyze_graph_structure: 'generateKnowledgeGraph',

  // Calendar tools (alias short names from renderer Many ↔ same handlers as *_event)
  calendar_list: 'calendarListEvents',
  calendar_create: 'calendarCreateEvent',
  calendar_update: 'calendarUpdateEvent',
  calendar_delete: 'calendarDeleteEvent',
  calendar_list_events: 'calendarListEvents',
  calendar_get_upcoming: 'calendarGetUpcoming',
  calendar_create_event: 'calendarCreateEvent',
  calendar_update_event: 'calendarUpdateEvent',
  calendar_delete_event: 'calendarDeleteEvent',
  get_tool_definition: 'getToolDefinition',
  load_skill: 'loadSkill',
  load_skill_file: 'loadSkillFile',

  // Entity creation
  agent_create: 'agentCreate',
  automation_create: 'automationCreate',
  workflow_create: 'workflowCreate',

  marketplace_search: 'marketplaceSearch',
  marketplace_install: 'marketplaceInstall',
  browser_get_active_tab: 'browserGetActiveTabTool',
  image_crop: 'imageCropTool',
  image_thumbnail: 'imageThumbnailTool',

  pdf_render_page: 'pdfRenderPage',

  image_describe: 'gemmaImageDescribe',
  screen_understand: 'gemmaScreenUnderstand',
};

function normalizeToolName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Execute a single tool call in main process
 * @param {string} toolName - Normalized tool name
 * @param {object} args - Tool arguments (parsed from JSON)
 * @param {{ automationProjectId?: string | null } | null | undefined} [toolContext] - When set, resource tools are scoped to this project (automation / workflow runs).
 * @returns {Promise<object>} Result suitable for appending to conversation
 */
async function executeToolInMain(toolName, args, toolContext) {
  const automationProjectId = toolContext?.automationProjectId ?? null;

  function denyUnlessResourceInScope(resourceId) {
    if (!automationProjectId || !resourceId) return null;
    const queries = database.getQueries();
    const row = queries.getResourceById.get(resourceId);
    if (!row || row.project_id !== automationProjectId) {
      return { success: false, error: 'Resource is outside the automation project scope' };
    }
    return null;
  }

  const handlerName = TOOL_HANDLER_MAP[toolName];
  if (!handlerName || !aiToolsHandler[handlerName]) {
    return { status: 'error', error: `Tool not supported: ${toolName}` };
  }

  try {
    const fn = aiToolsHandler[handlerName];
    let result;

    switch (handlerName) {
      case 'resourceSearch':
        result = await fn(args.query || '', {
          project_id: automationProjectId || args.project_id,
          type: args.type,
          limit: args.limit,
        });
        break;
      case 'resourceGet': {
        const rid = args.resource_id || args.resourceId || args.id;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          result = await fn(rid, {
            includeContent: args.include_content !== false,
            maxContentLength: args.max_content_length,
          });
        }
        break;
      }
      case 'resourceGetSection': {
        const rid = args.resource_id || args.resourceId || args.id;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          const chunkId = args.chunk_id || args.chunkId || args.node_id || args.nodeId;
          result = await fn(rid, chunkId);
        }
        break;
      }
      case 'resourceList':
        result = await fn({
          project_id: automationProjectId || args.project_id,
          folder_id: args.folder_id,
          type: args.type,
          limit: args.limit,
          sort: args.sort,
        });
        break;
      case 'resourceSemanticSearch':
        result = await fn(args.query || '', {
          project_id: automationProjectId || args.project_id || args.projectId,
          limit: args.limit || args.count || 10,
        });
        break;
      case 'resourceHybridSearch':
        result = await fn(args.query || '', {
          project_id: automationProjectId || args.project_id || args.projectId,
          type: args.type,
          limit: args.limit || args.count || 10,
          semantic_min_score: args.semantic_min_score,
          include_backlinks: args.include_backlinks,
          candidate_limit: args.candidate_limit,
          rrf_k: args.rrf_k,
        });
        break;
      case 'projectList':
        result = await fn();
        break;
      case 'projectGet': {
        const pid = args.project_id || args.projectId;
        if (automationProjectId && pid && pid !== automationProjectId) {
          result = { success: false, error: 'Project is outside the automation project scope' };
        } else {
          result = await fn(pid);
        }
        break;
      }
      case 'getRecentResources':
        result = await fn(args.limit || 5, automationProjectId);
        break;
      case 'getCurrentProject':
        result = await fn(automationProjectId);
        break;
      case 'getLibraryOverview':
        result = await fn({ project_id: automationProjectId || args.project_id });
        break;
      case 'resourceCreate':
        result = await fn(automationProjectId ? { ...args, project_id: automationProjectId } : args);
        break;
      case 'resourceUpdate': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          result = await fn(rid, { title: args.title, content: args.content, metadata: args.metadata });
        }
        break;
      }
      case 'resourceDelete': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          result = await fn(rid);
        }
        break;
      }
      case 'resourceMoveToFolder': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          const fid = args.folder_id ?? args.folderId;
          if (fid != null && fid !== '') {
            const fd = denyUnlessResourceInScope(fid);
            if (fd) {
              result = fd;
              break;
            }
          }
          result = await fn(rid, fid);
        }
        break;
      }
      case 'flashcardCreate':
        result = await fn(automationProjectId ? { ...args, project_id: automationProjectId } : args);
        break;
      case 'webFetch':
        result = await fn(args);
        break;
      case 'webSearch':
        result = await fn(args);
        break;
      case 'deepResearch':
        result = fn(args);
        break;
      case 'excelGet': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { sheet_name: args.sheet_name, range: args.range });
        break;
      }
      case 'excelGetFilePath': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'notebookGet': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'notebookAddCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn(
            rid,
            args.cell_type || 'code',
            args.source || '',
            args.position
          );
        }
        break;
      }
      case 'notebookUpdateCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.cell_index, args.source || '');
        break;
      }
      case 'notebookDeleteCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.cell_index);
        break;
      }
      case 'excelSetCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.cell, args.value);
        break;
      }
      case 'excelSetRange': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.range, args.values);
        break;
      }
      case 'excelAddRow': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.values, args.after_row);
        break;
      }
      case 'excelAddSheet': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.data);
        break;
      }
      case 'excelCreate': {
        if (args.folder_id && automationProjectId) {
          const fd = denyUnlessResourceInScope(args.folder_id);
          if (fd) {
            result = fd;
            break;
          }
        }
        result = await fn(automationProjectId || args.project_id || args.projectId, args.title, {
          sheet_name: args.sheet_name,
          initial_data: args.initial_data,
          folder_id: args.folder_id,
        });
        break;
      }
      case 'excelExport': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { format: args.format, sheet_name: args.sheet_name });
        break;
      }
      case 'pptCreate': {
        const opts = {};
        if (args.folder_id) {
          const fd = denyUnlessResourceInScope(args.folder_id);
          if (fd) {
            result = fd;
            break;
          }
          opts.folder_id = args.folder_id;
        }
        if (args.script) opts.script = args.script;
        result = await fn(
          automationProjectId || args.project_id || args.projectId,
          args.title,
          args.spec || {},
          opts
        );
        break;
      }
      case 'pptGetFilePath': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'pptGetSlides': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'pptExport': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.options || {});
        break;
      }
      case 'rememberFact':
        result = await fn(args.key || '', args.value || '');
        break;
      case 'getDocumentStructure': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn({ resource_id: rid });
        break;
      }
      case 'linkResources': {
        const a = denyUnlessResourceInScope(args.source_id);
        if (a) {
          result = a;
        } else {
          const b = denyUnlessResourceInScope(args.target_id);
          if (b) result = b;
          else {
            result = await fn({
              source_id: args.source_id,
              target_id: args.target_id,
              relation: args.relation,
              description: args.description,
            });
          }
        }
        break;
      }
      case 'getRelatedResources': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn({ resource_id: rid });
        break;
      }
      case 'interactionList': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn(rid, { type: args.type, limit: args.limit });
        }
        break;
      }
      case 'generateKnowledgeGraph': {
        let rid = args.focus_resource_id || args.resource_id || args.resourceId;
        const sourceIds = Array.isArray(args.source_ids) ? args.source_ids.filter((x) => typeof x === 'string' && x.trim()) : [];
        if (!rid && sourceIds.length > 0) rid = sourceIds[0];
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn({
            focus_resource_id: rid,
            min_weight: args.min_weight,
          });
        }
        break;
      }
      case 'calendarListEvents':
        result = await fn({ start_at: args.start_at, end_at: args.end_at, calendar_ids: args.calendar_ids });
        break;
      case 'calendarGetUpcoming':
        result = await fn({ window_minutes: args.window_minutes, limit: args.limit });
        break;
      case 'calendarCreateEvent':
        result = await fn(args);
        break;
      case 'calendarUpdateEvent':
        result = await fn(args);
        break;
      case 'calendarDeleteEvent':
        result = await fn({ event_id: args.event_id });
        break;
      case 'getToolDefinition':
        result = await fn(args.tool_name || args.toolName || '');
        break;
      case 'pdfRenderPage': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn({
            resource_id: rid,
            page_number: args.page_number ?? args.pageNumber ?? 1,
            scale: args.scale,
          });
        }
        break;
      }
      case 'gemmaImageDescribe': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn({ resource_id: rid });
        break;
      }
      case 'gemmaScreenUnderstand':
        result = await fn({
          image_base64: args.image_base64 || args.imageBase64,
          intent: args.intent,
        });
        break;
      default:
        result = await fn(args);
    }

    return result;
  } catch (error) {
    console.error('[AI Chat Tools] Tool execution error:', toolName, error);
    return { success: false, error: error.message };
  }
}

/**
 * OpenAI-format tool definitions per subagent.
 * Used by the subagents architecture (langgraph-agent).
 * @returns {{ research: Array, library: Array, writer: Array, data: Array }}
 */
function getToolDefsBySubagent() {
  const all = getAllToolDefinitions();
  const byName = {};
  for (const def of all) {
    const name = def?.function?.name;
    if (name) byName[name] = def;
  }
  const pick = (...names) => names.map((n) => byName[n]).filter(Boolean);
  return {
    research: pick('web_search', 'web_fetch', 'deep_research'),
    library: pick(
      'resource_hybrid_search',
      'resource_get',
      'resource_get_section',
      'resource_list',
      'get_document_structure',
      'get_related_resources',
      'link_resources',
      'project_list',
      'project_get',
      'get_recent_resources',
      'get_current_project',
      'get_library_overview',
      'resource_move_to_folder',
      'calendar_list_events',
      'calendar_get_upcoming',
      'calendar_create_event',
      'calendar_update_event',
      'calendar_delete_event',
      'pdf_render_page',
    ),
    writer: pick(
      'resource_create',
      'resource_update',
      'resource_delete',
      'flashcard_create',
      'notebook_get',
      'notebook_add_cell',
      'notebook_update_cell',
      'notebook_delete_cell',
    ),
    data: pick(
      'excel_get',
      'excel_get_file_path',
      'excel_set_cell',
      'excel_set_range',
      'excel_add_row',
      'excel_add_sheet',
      'excel_create',
      'excel_export',
      'ppt_create',
      'ppt_get_file_path',
      'ppt_get_slides',
      'ppt_export',
      'get_library_overview',
      'resource_list',
      'resource_get',
      'resource_get_section',
      'get_document_structure',
      'get_current_project',
    ),
  };
}

/**
 * All OpenAI-format tool definitions (flat array).
 * Used by getToolDefsBySubagent and getWhatsAppToolDefinitions.
 */
function getAllToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information using the built-in Playwright browser search. Returns titles, URLs, and snippets from live search results.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            count: { type: 'number', description: 'Max results (1-10). Default: 5' },
            country: { type: 'string', description: '2-letter country code (e.g. US, DE)' },
            search_lang: { type: 'string', description: 'ISO language code' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: 'Fetch and extract content from a web page.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            max_length: { type: 'number', description: 'Max content length. Default: 50000' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'deep_research',
        description:
          'Initiate deep research on a topic. Returns a plan: use web_search and web_fetch to gather info, then synthesize a structured report with sections and citations.',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Research topic' },
            depth: { type: 'string', description: "Depth: 'quick', 'standard', or 'comprehensive'" },
          },
          required: ['topic'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_search',
        description: 'Search resources in the user\'s knowledge base by title or content. Use to find notes, PDFs, videos, and other resources.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            project_id: { type: 'string', description: 'Filter by project ID' },
            type: { type: 'string', description: 'Filter by type: note, pdf, video, audio, image, url, document, folder' },
            limit: { type: 'number', description: 'Max results (1-50). Default: 10' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_get',
        description: 'Get full details of a specific resource. For PDFs, returns the Gemma transcript in content when available. Use resource_semantic_search for passage-level search and pdf_render_page to view a page as an image. For notes, returns full content. Cite inline as [N] when using in answers.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Resource ID' },
            include_content: { type: 'boolean', description: 'Include full content. Default: true' },
            max_content_length: { type: 'number', description: 'Max content length. Default: 10000' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_list',
        description: 'List resources with optional filters.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Filter by project' },
            folder_id: { type: 'string', description: 'Filter by folder' },
            type: { type: 'string', description: 'Filter by type' },
            limit: { type: 'number', description: 'Max results (1-100)' },
            sort: { type: 'string', description: "'created_at' or 'updated_at'" },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_hybrid_search',
        description:
          'Hybrid library search: merges full-text (FTS), semantic chunk similarity, and knowledge-graph node matches with RRF. Prefer this over resource_search or resource_semantic_search alone. Results may include chunk_id for resource_get_section.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            project_id: { type: 'string', description: 'Filter by project' },
            type: { type: 'string', description: 'Filter by resource type' },
            limit: { type: 'number', description: 'Max results (1-50). Default: 10' },
            semantic_min_score: { type: 'number', description: 'Min semantic score 0-1. Default: 0.3' },
            include_backlinks: { type: 'boolean', description: 'Include graph neighbors' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_semantic_search',
        description: 'Semantic search over Nomic chunk embeddings. Results include chunk_id (format resourceId#index). Use resource_get_section(resource_id, chunk_id) for full chunk text, or pdf_render_page to see a PDF page as an image.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language query' },
            project_id: { type: 'string', description: 'Filter by project' },
            limit: { type: 'number', description: 'Max results' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_get_section',
        description: 'Get full text of one semantic chunk. Pass chunk_id from resource_semantic_search (e.g. "uuid#3").',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource' },
            chunk_id: { type: 'string', description: 'Chunk id from resource_semantic_search, format resourceId#chunk_index' },
          },
          required: ['resource_id', 'chunk_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_document_structure',
        description: 'Lightweight outline for PDFs with Gemma transcript (page markers). Prefer resource_get for full text.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource to get the structure of' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'link_resources',
        description: 'Create a semantic relationship between two resources in the user\'s library. Use when the user says "link these", "these are related", "this references that", or when you notice a meaningful connection between documents while analyzing them. Always confirm with a brief summary of what was linked.',
        parameters: {
          type: 'object',
          properties: {
            source_id: { type: 'string', description: 'ID of the source resource (the one that references or leads to the other)' },
            target_id: { type: 'string', description: 'ID of the target resource' },
            relation: {
              type: 'string',
              description: 'Relationship label. Common values: "related", "references", "continuation", "contradicts", "supports", "derived_from", "part_of", "see_also". Default: "related"',
            },
            description: { type: 'string', description: 'Optional short note explaining why these are linked (≤120 chars)' },
          },
          required: ['source_id', 'target_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_related_resources',
        description: 'Get all resources linked to or from a given resource. Use when the user asks "what is related to this?", "show me connections", "what links to this document?", or before creating new content to discover existing related material.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource to find neighbors for' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'pdf_render_page',
        description:
          'Render one page of a PDF as a PNG (data URL) for visual inspection—figures, layout, diagrams. Use when the user asks to "see" a page or when text search is not enough.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'PDF resource ID' },
            page_number: { type: 'number', description: '1-based page number' },
            scale: { type: 'number', description: 'Optional render scale (default 1.25)' },
          },
          required: ['resource_id', 'page_number'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_list_events',
        description:
          "You have direct access to the user's calendar. List events in a date range. Use when the user asks 'what do I have between X and Y?' or for a specific date range. Never say you don't have access.",
        parameters: {
          type: 'object',
          properties: {
            start_at: { type: 'string', description: 'Start of range as ISO 8601 string (e.g. "2026-03-15T00:00:00"). Defaults to now.' },
            end_at: { type: 'string', description: 'End of range as ISO 8601 string. Defaults to 7 days from start.' },
            calendar_ids: { type: 'array', items: { type: 'string' }, description: 'Filter by specific calendar IDs. Omit for all calendars.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_get_upcoming',
        description:
          "You have direct access to the user's calendar. Use this immediately when they ask about their schedule, upcoming events, or 'what do I have today/week'. Never say you don't have access.",
        parameters: {
          type: 'object',
          properties: {
            window_minutes: {
              type: 'number',
              description:
                'Look-ahead window in minutes. Default ~7 days (10080). Use 180 for a few hours, 1440 for ~1 day.',
            },
            limit: { type: 'number', description: 'Max events to return. Default: 10.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_create_event',
        description:
          "Create the event directly in the user's calendar. Never generate .ics files or ask the user to import manually. Infer date from 'tomorrow', 'next week'; infer time (use PM for afternoon hours like 5:15 in Spain). Use reminders: [{\"minutes\": 1440}, {\"minutes\": 120}] by default.",
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title (required)' },
            description: { type: 'string', description: 'Optional description or notes' },
            location: { type: 'string', description: 'Optional location' },
            start_at: { type: 'string', description: 'Start time as ISO 8601 string, e.g. "2026-03-15T14:00:00" (required)' },
            end_at: { type: 'string', description: 'End time as ISO 8601 string (required)' },
            all_day: { type: 'boolean', description: 'True for all-day events' },
            reminders: {
              type: 'array',
              items: { type: 'object', properties: { minutes: { type: 'number' } }, required: ['minutes'] },
              description: 'Reminder alerts, e.g. [{"minutes": 15}]',
            },
          },
          required: ['title', 'start_at', 'end_at'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_update_event',
        description: 'Update an existing calendar event. Only include fields that should change. Use calendar_list_events first if you need the event_id.',
        parameters: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'ID of the event to update (required)' },
            title: { type: 'string', description: 'New title' },
            description: { type: 'string', description: 'New description' },
            location: { type: 'string', description: 'New location' },
            start_at: { type: 'string', description: 'New start time as ISO 8601 string' },
            end_at: { type: 'string', description: 'New end time as ISO 8601 string' },
            all_day: { type: 'boolean' },
            reminders: {
              type: 'array',
              items: { type: 'object', properties: { minutes: { type: 'number' } }, required: ['minutes'] },
            },
          },
          required: ['event_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_delete_event',
        description: 'Permanently delete a calendar event. Ask for confirmation before calling unless the user explicitly said to delete.',
        parameters: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'ID of the event to delete' },
          },
          required: ['event_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'project_list',
        description: 'List all projects.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'project_get',
        description: 'Get project details by ID.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'string', description: 'Project ID' } },
          required: ['project_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_recent_resources',
        description: 'Get recently updated resources.',
        parameters: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Number of resources (default 5)' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_current_project',
        description: 'Get the current/default project.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_library_overview',
        description: 'Get library structure: folders and resources per folder.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'string', description: 'Project ID' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_create',
        description: 'Create a new persisted resource (note, folder, url, notebook). DO NOT use for visual/interactive outputs like dashboards, diagrams, calculators, timelines, tabs, playgrounds — those are RICH ARTIFACTS rendered inline in the chat (emit an `artifact:TYPE` fenced block instead). Call AT MOST ONCE per user request — never loop creating multiple notes for the same ask.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Resource title' },
            type: { type: 'string', description: 'note, notebook, document, url, folder' },
            content: { type: 'string', description: 'Content for notes: use Markdown GFM (headings, bold, italic, lists, code blocks). The system converts it to the editor format automatically. Do NOT pass HTML or JSON.' },
            project_id: { type: 'string', description: 'Project ID' },
            folder_id: { type: 'string', description: 'Parent folder ID' },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_update',
        description: 'Update an existing resource. For DOCX documents: use content as HTML or Markdown GFM; it is persisted to the DOCX file.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Resource ID' },
            title: { type: 'string', description: 'New title' },
            content: { type: 'string', description: 'New content (for notes/DOCX: HTML or Markdown GFM; DOCX content is written to file)' },
            metadata: { type: 'object', description: 'Metadata to merge' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_delete',
        description: 'Delete a resource.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_move_to_folder',
        description: 'Move a resource or folder to another folder.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Resource/folder to move' },
            folder_id: { type: 'string', description: 'Target folder ID, or null for root' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'flashcard_create',
        description: 'Create a flashcard deck from Q&A pairs. Each card must have only question (string) and answer (string). Optionally difficulty: "easy"|"medium"|"hard". Do not add tags or other fields.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Deck title' },
            description: { type: 'string', description: 'Deck description' },
            project_id: { type: 'string', description: 'Project ID' },
            resource_id: { type: 'string', description: 'Source resource ID' },
            source_ids: { type: 'array', items: { type: 'string' }, description: 'Resource IDs used as sources' },
            cards: {
              type: 'array',
              description: 'Array of { question: string, answer: string, difficulty?: "easy"|"medium"|"hard" } - no other fields',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
                required: ['question', 'answer'],
              },
            },
          },
          required: ['title', 'cards'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notebook_get',
        description: 'Get notebook content (cells, code, outputs). Use resource_id of the current notebook.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Notebook resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notebook_add_cell',
        description: 'Add a code or markdown cell to a notebook. Use for pandas/sklearn analysis. Use position to insert after a cell.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Notebook resource ID' },
            cell_type: { type: 'string', enum: ['code', 'markdown'], description: 'Cell type' },
            source: { type: 'string', description: 'Cell content (Python or Markdown)' },
            position: { type: 'number', description: '0-based index to insert at; omit to append' },
          },
          required: ['resource_id', 'cell_type', 'source'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notebook_update_cell',
        description: 'Update the source of an existing notebook cell.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Notebook resource ID' },
            cell_index: { type: 'number', description: '0-based cell index' },
            source: { type: 'string', description: 'New cell content' },
          },
          required: ['resource_id', 'cell_index', 'source'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notebook_delete_cell',
        description: 'Delete a cell from a notebook.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Notebook resource ID' },
            cell_index: { type: 'number', description: '0-based cell index' },
          },
          required: ['resource_id', 'cell_index'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_get',
        description: 'Get cells or range from an Excel spreadsheet resource.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            range: { type: 'string', description: 'Cell range (e.g. A1:B10)' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_get_file_path',
        description: 'Get absolute file path of an Excel. Use when generating notebook code with pd.read_excel(path).',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Excel resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_set_cell',
        description: 'Set a single cell value in an Excel spreadsheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            cell: { type: 'string', description: 'Cell address (e.g. A1)' },
            value: { type: 'string', description: 'Value to set' },
          },
          required: ['resource_id', 'sheet_name', 'cell', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_set_range',
        description: 'Set a range of cells in an Excel spreadsheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            range: { type: 'string', description: 'Range (e.g. A1:B2)' },
            values: { type: 'array', description: '2D array of values' },
          },
          required: ['resource_id', 'sheet_name', 'range', 'values'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_add_row',
        description: 'Add a row to an Excel spreadsheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            values: { type: 'array', description: 'Array of cell values' },
            after_row: { type: 'number', description: 'Insert after this row index' },
          },
          required: ['resource_id', 'sheet_name', 'values'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_add_sheet',
        description: 'Add a new sheet to an Excel spreadsheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            data: { type: 'array', description: '2D array of initial data' },
          },
          required: ['resource_id', 'sheet_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_create',
        description: 'Create a new Excel spreadsheet resource.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project ID' },
            title: { type: 'string', description: 'Spreadsheet title' },
            sheet_name: { type: 'string', description: 'Initial sheet name' },
            initial_data: { type: 'array', description: '2D array of initial data' },
            folder_id: { type: 'string', description: 'Parent folder ID' },
          },
          required: ['project_id', 'title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_export',
        description: 'Export Excel spreadsheet to CSV or XLSX.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            format: { type: 'string', description: "'csv' or 'xlsx'" },
            sheet_name: { type: 'string', description: 'Sheet to export' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_create',
        description: 'Create a PowerPoint. Use script (Python/python-pptx) for rich themed slides, or spec (JSON) for simple slides. Script must populate every slide with real content from source documents.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project ID' },
            folder_id: { type: 'string', description: 'Folder ID to place the PPT in' },
            title: { type: 'string', description: 'Resource title' },
            script: {
              type: 'string',
              description: 'Python/python-pptx code. Must use from pptx import Presentation, add slides with add_text/add_bullets, call prs.save(os.environ[\'PPTX_OUTPUT_PATH\']). Populate every slide with real content from source documents. Use for themed, rich layouts.',
            },
            spec: {
              type: 'object',
              description: 'Presentation spec. Include theme for themed slides.',
              properties: {
                title: { type: 'string' },
                theme: {
                  type: 'string',
                  enum: ['midnight_executive', 'forest_moss', 'ocean_gradient', 'sunset_warm', 'slate_minimal', 'emerald_pro'],
                  description: 'Theme: midnight_executive (business), forest_moss (sustainability), ocean_gradient (tech), sunset_warm (marketing), slate_minimal (academic), emerald_pro (finance)',
                },
                slides: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      layout: { type: 'string', enum: ['title', 'content', 'bullet', 'title_only', 'blank'] },
                      title: { type: 'string' },
                      subtitle: { type: 'string' },
                      bullets: { type: 'array', items: { type: 'string' } },
                      textboxes: { type: 'array' },
                    },
                  },
                },
              },
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_get_file_path',
        description: 'Get absolute file path of a PowerPoint resource.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_get_slides',
        description: 'Get slide content (text) from a PowerPoint presentation.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_export',
        description: 'Export PowerPoint to base64 (pptx).',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_describe',
        description:
          'Describe an image resource using on-device Gemma (no cloud vision). Use for image-type resources in the library.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Image resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'screen_understand',
        description:
          'Analyze a screenshot (base64 PNG) for UI elements and intent. Returns JSON-like analysis from on-device Gemma. Requires Gemma enabled in Settings.',
        parameters: {
          type: 'object',
          properties: {
            image_base64: { type: 'string', description: 'Base64-encoded PNG (with or without data URL prefix)' },
            intent: { type: 'string', description: 'Optional user goal to bias the analysis' },
          },
          required: ['image_base64'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_tool_definition',
        description:
          'Get the full schema (name, description, parameters) of any tool (Dome or MCP). Use when you need to see the exact parameters of a tool before calling it. Reduces token usage by loading definitions on demand.',
        parameters: {
          type: 'object',
          properties: {
            tool_name: { type: 'string', description: 'Normalized tool name (e.g. resource_search, stripe_create_payment)' },
          },
          required: ['tool_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'agent_create',
        description:
          'Create a new specialized agent (hijo de Many) with a custom system prompt and tools. Use when the user asks to create, build, or set up a new AI agent. Do NOT delegate to subagents for this—call agent_create directly.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the agent (e.g. "Research Assistant", "Noticiero")' },
            description: { type: 'string', description: 'Short description of what this agent does' },
            system_instructions: { type: 'string', description: 'System prompt for the agent. Describe WHAT the agent will do when invoked, including step-by-step flow. Be specific.' },
            tool_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'REQUIRED. Tool IDs the agent needs (e.g. ["web_fetch", "resource_create"]). Agent cannot work without tools. Never omit.',
            },
            icon_index: { type: 'number', description: 'Icon index 1-18 for the agent avatar. Default: random' },
          },
          required: ['name', 'tool_ids'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'automation_create',
        description:
          'Create an automation that runs an agent or workflow on a trigger (manual, schedule, or contextual). Dome has native automations—use this, never mention n8n or Make. Use when the user asks to automate, schedule, or set up recurring tasks. After creating an agent that could run recurrently (e.g. Noticiero), offer to create an automation.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Name of the automation (e.g. "Daily briefing")' },
            description: { type: 'string', description: 'What this automation does' },
            target_type: { type: 'string', description: 'Target: "agent" or "workflow"' },
            target_id: { type: 'string', description: 'ID of the target agent or workflow' },
            trigger_type: { type: 'string', description: 'Trigger: "manual" | "schedule" | "contextual". Default: manual' },
            prompt: { type: 'string', description: 'Base prompt/instructions to pass when triggered' },
            schedule: {
              type: 'object',
              description: 'For trigger_type "schedule". cadence: "daily"|"weekly"|"cron-lite", hour: 0-23, weekday: 1-7 (for weekly), intervalMinutes (for cron-lite)',
              properties: {
                cadence: { type: 'string', enum: ['daily', 'weekly', 'cron-lite'] },
                hour: { type: 'number', description: 'Hour of day (0-23)' },
                weekday: { type: 'number', description: 'Day of week 1-7 for weekly' },
                interval_minutes: { type: 'number', description: 'Minutes between runs for cron-lite' },
              },
            },
            output_mode: { type: 'string', description: '"chat_only" | "note" | "studio_output" | "mixed". Use "note" when agent creates a resource' },
            enabled: { type: 'boolean', description: 'Whether active. Default: true' },
          },
          required: ['title', 'target_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'workflow_create',
        description:
          'Create a new visual workflow (canvas) with nodes and edges. Valid node types: text-input, document, image, agent, output.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Workflow name (required)' },
            description: { type: 'string', description: 'Short description' },
            project_id: { type: 'string', description: 'Project ID (default: default)' },
            nodes: {
              type: 'array',
              description: 'Nodes: { id?, type, position?: {x,y}, data?: {} }',
            },
            edges: {
              type: 'array',
              description: 'Edges: { id?, source, target, sourceHandle?, targetHandle? }',
            },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'marketplace_search',
        description:
          'Search bundled and configured marketplace catalogs for agents and workflows. Use when the user wants to browse or find installable agents/workflows.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (keywords); omit or empty to list top items' },
            type: { type: 'string', description: 'all | agents | workflows' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'marketplace_install',
        description:
          'Install an agent or workflow from marketplace_search results. Requires marketplaceId from search and type agent or workflow.',
        parameters: {
          type: 'object',
          properties: {
            marketplaceId: { type: 'string', description: 'Template id from marketplace_search' },
            type: { type: 'string', enum: ['agent', 'workflow'], description: 'agent or workflow' },
            project_id: { type: 'string', description: 'Project scope (default: default)' },
          },
          required: ['marketplaceId', 'type'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'browser_get_active_tab',
        description:
          'macOS only. Returns URL and title of the active tab when Safari, Chrome, Chromium, Brave, or Edge is focused. Then use resource_create type url to save.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_crop',
        description: 'Crop a region from an image file on disk. Returns cropped image as data URL.',
        parameters: {
          type: 'object',
          properties: {
            imagePath: { type: 'string', description: 'Absolute path to image file' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            format: { type: 'string', description: 'jpeg | png | webp' },
            quality: { type: 'number' },
            maxWidth: { type: 'number' },
            maxHeight: { type: 'number' },
          },
          required: ['imagePath', 'width', 'height'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_thumbnail',
        description: 'Generate a thumbnail data URL for an image file on disk.',
        parameters: {
          type: 'object',
          properties: {
            imagePath: { type: 'string', description: 'Absolute path to image file' },
            width: { type: 'number', description: 'Max width (default 256)' },
            height: { type: 'number', description: 'Max height (default 256)' },
            format: { type: 'string' },
            quality: { type: 'number' },
          },
          required: ['imagePath'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_knowledge_graph',
        description:
          'Build a semantic similarity graph around a focus resource (from library embeddings). Pass focus_resource_id or source_ids (first id used as focus).',
        parameters: {
          type: 'object',
          properties: {
            focus_resource_id: { type: 'string', description: 'Center resource id' },
            source_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional; first id used as focus if focus_resource_id omitted',
            },
            min_weight: { type: 'number', description: 'Min edge similarity 0-1 (default 0.35)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_mindmap',
        description:
          'Gather source snippets from library resources to help you produce a mind map or artifact:diagram. Does not build the graph structure itself—call after resolving resource IDs.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Scope listing when source_ids omitted' },
            source_ids: { type: 'array', items: { type: 'string' }, description: 'Resource IDs to summarize' },
            topic: { type: 'string', description: 'Optional focus topic label' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_quiz',
        description:
          'Gather source content from resources so you can output a structured quiz (type quiz) in the reply. Call only when user asks for quiz/test/questions.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            num_questions: { type: 'number', description: '1-20, default 5' },
            difficulty: { type: 'string', description: 'easy | medium | hard' },
          },
        },
      },
    },
  ];
}

/**
 * OpenAI-format tool definitions for WhatsApp (subset of Many tools).
 * With subagents architecture, the main agent uses subagent-invocation tools;
 * this is kept for backward compatibility when toolDefinitions is passed.
 */
function getWhatsAppToolDefinitions() {
  return getAllToolDefinitions();
}

function getToolDefinitionsByIds(toolIds) {
  if (!Array.isArray(toolIds) || toolIds.length === 0) return [];
  const normalizedIds = new Set(
    toolIds.map((toolId) =>
      String(toolId || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
    )
  );
  return getAllToolDefinitions().filter((def) => {
    const name = def?.function?.name;
    if (!name) return false;
    const normalizedName = String(name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    return normalizedIds.has(normalizedName);
  });
}

module.exports = {
  executeToolInMain,
  normalizeToolName,
  TOOL_HANDLER_MAP,
  getAllToolDefinitions,
  getWhatsAppToolDefinitions,
  getToolDefinitionsByIds,
  getToolDefsBySubagent,
};
