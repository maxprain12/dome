/* eslint-disable no-console */
/**
 * AI Chat with Tools - Main Process
 *
 * Runs the chat loop with tool execution for contexts that don't have
 * access to the renderer (e.g. WhatsApp). Streams from the configured
 * provider, executes tool calls via aiToolsHandler, and returns the final response.
 */

const aiToolsHandler = require('./ai-tools-handler.cjs');

/**
 * Tool name (normalized) to aiToolsHandler method mapping
 */
const TOOL_HANDLER_MAP = {
  resource_search: 'resourceSearch',
  resource_get: 'resourceGet',
  resource_get_section: 'resourceGetSection',
  resource_list: 'resourceList',
  resource_semantic_search: 'resourceSemanticSearch',
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
  get_related_resources: 'getRelatedResources',

  // Calendar tools
  calendar_list_events: 'calendarListEvents',
  calendar_get_upcoming: 'calendarGetUpcoming',
  calendar_create_event: 'calendarCreateEvent',
  calendar_update_event: 'calendarUpdateEvent',
  calendar_delete_event: 'calendarDeleteEvent',
  get_tool_definition: 'getToolDefinition',

  // Entity creation
  agent_create: 'agentCreate',
  automation_create: 'automationCreate',

  // Docling image tools
  docling_list_images: 'doclingGetResourceImages',
  docling_show_image: 'doclingGetImageData',
  docling_show_page_images: 'doclingShowPageImages',
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
 * @returns {Promise<object>} Result suitable for appending to conversation
 */
async function executeToolInMain(toolName, args) {
  const handlerName = TOOL_HANDLER_MAP[toolName];
  if (!handlerName || !aiToolsHandler[handlerName]) {
    return { status: 'error', error: `Tool not supported: ${toolName}` };
  }

  try {
    const fn = aiToolsHandler[handlerName];
    let result;

    switch (handlerName) {
      case 'resourceSearch':
        result = await fn(args.query || '', { project_id: args.project_id, type: args.type, limit: args.limit });
        break;
      case 'resourceGet':
        result = await fn(args.resource_id || args.resourceId || args.id, {
          includeContent: args.include_content !== false,
          maxContentLength: args.max_content_length,
        });
        break;
      case 'resourceGetSection':
        result = await fn(
          args.resource_id || args.resourceId || args.id,
          args.node_id || args.nodeId,
        );
        break;
      case 'resourceList':
        result = await fn({ project_id: args.project_id, folder_id: args.folder_id, type: args.type, limit: args.limit, sort: args.sort });
        break;
      case 'resourceSemanticSearch':
        result = await fn(args.query || '', {
          project_id: args.project_id || args.projectId,
          limit: args.limit || args.count || 10,
        });
        break;
      case 'projectList':
        result = await fn();
        break;
      case 'projectGet':
        result = await fn(args.project_id || args.projectId);
        break;
      case 'getRecentResources':
        result = await fn(args.limit || 5);
        break;
      case 'getCurrentProject':
        result = await fn();
        break;
      case 'getLibraryOverview':
        result = await fn({ project_id: args.project_id });
        break;
      case 'resourceCreate':
        result = await fn(args);
        break;
      case 'resourceUpdate':
        result = await fn(args.resource_id || args.resourceId, { title: args.title, content: args.content, metadata: args.metadata });
        break;
      case 'resourceDelete':
        result = await fn(args.resource_id || args.resourceId);
        break;
      case 'resourceMoveToFolder':
        result = await fn(args.resource_id || args.resourceId, args.folder_id ?? args.folderId);
        break;
      case 'flashcardCreate':
        result = await fn(args);
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
      case 'excelGet':
        result = await fn(args.resource_id || args.resourceId, { sheet_name: args.sheet_name, range: args.range });
        break;
      case 'excelGetFilePath':
        result = await fn(args.resource_id || args.resourceId);
        break;
      case 'notebookGet':
        result = await fn(args.resource_id || args.resourceId);
        break;
      case 'notebookAddCell':
        result = await fn(
          args.resource_id || args.resourceId,
          args.cell_type || 'code',
          args.source || '',
          args.position
        );
        break;
      case 'notebookUpdateCell':
        result = await fn(args.resource_id || args.resourceId, args.cell_index, args.source || '');
        break;
      case 'notebookDeleteCell':
        result = await fn(args.resource_id || args.resourceId, args.cell_index);
        break;
      case 'excelSetCell':
        result = await fn(args.resource_id || args.resourceId, args.sheet_name, args.cell, args.value);
        break;
      case 'excelSetRange':
        result = await fn(args.resource_id || args.resourceId, args.sheet_name, args.range, args.values);
        break;
      case 'excelAddRow':
        result = await fn(args.resource_id || args.resourceId, args.sheet_name, args.values, args.after_row);
        break;
      case 'excelAddSheet':
        result = await fn(args.resource_id || args.resourceId, args.sheet_name, args.data);
        break;
      case 'excelCreate':
        result = await fn(args.project_id || args.projectId, args.title, {
          sheet_name: args.sheet_name,
          initial_data: args.initial_data,
          folder_id: args.folder_id,
        });
        break;
      case 'excelExport':
        result = await fn(args.resource_id || args.resourceId, { format: args.format, sheet_name: args.sheet_name });
        break;
      case 'pptCreate': {
        const opts = {};
        if (args.folder_id) opts.folder_id = args.folder_id;
        if (args.script) opts.script = args.script;
        result = await fn(
          args.project_id || args.projectId,
          args.title,
          args.spec || {},
          opts
        );
        break;
      }
      case 'pptGetFilePath':
        result = await fn(args.resource_id || args.resourceId);
        break;
      case 'pptGetSlides':
        result = await fn(args.resource_id || args.resourceId);
        break;
      case 'pptExport':
        result = await fn(args.resource_id || args.resourceId, args.options || {});
        break;
      case 'rememberFact':
        result = await fn(args.key || '', args.value || '');
        break;
      case 'getDocumentStructure':
        result = await fn({ resource_id: args.resource_id || args.resourceId });
        break;
      case 'linkResources':
        result = await fn({ source_id: args.source_id, target_id: args.target_id, relation: args.relation, description: args.description });
        break;
      case 'getRelatedResources':
        result = await fn({ resource_id: args.resource_id || args.resourceId });
        break;
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
      case 'doclingGetResourceImages':
        result = await fn(args.resource_id || args.resourceId);
        break;
      case 'doclingGetImageData':
        result = await fn(args.image_id || args.imageId, args.resource_id || args.resourceId);
        break;
      case 'doclingShowPageImages':
        result = await fn({
          resource_id: args.resource_id || args.resourceId,
          page_no: args.page_no,
          max_images: args.max_images ?? 3,
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
 * Chat with tools - main process
 * Uses LangGraph agent exclusively.
 * @param {string} provider - openai | anthropic | google | ollama
 * @param {Array<{role, content}>} messages - Initial messages
 * @param {Array} toolDefinitions - OpenAI-format tool definitions
 * @param {object} options - { database, windowManager }
 * @returns {Promise<string>} Final response text
 */
async function chatWithToolsInMain(provider, messages, toolDefinitions, options = {}) {
  const database = options.database;
  const queries = database?.getQueries?.();

  if (!queries) throw new Error('Database required for chatWithToolsInMain');

  const langgraphAgent = require('./langgraph-agent.cjs');
  const apiKey =
    provider === 'ollama'
      ? (queries.getSetting?.get?.('ollama_api_key')?.value || undefined)
      : queries.getSetting?.get?.('ai_api_key')?.value;
  const model =
    provider === 'ollama'
      ? (queries.getSetting?.get?.('ollama_model')?.value || 'llama3.2')
      : queries.getSetting?.get?.('ai_model')?.value;
  const baseUrl =
    provider === 'ollama'
      ? (queries.getSetting?.get?.('ollama_base_url')?.value || 'http://127.0.0.1:11434')
      : undefined;

  const result = await langgraphAgent.runLangGraphAgentSync({
    provider,
    model,
    apiKey,
    baseUrl,
    messages,
    toolDefinitions,
  });
  return result?.response ?? '';
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
      'resource_search',
      'resource_get',
      'resource_get_section',
      'resource_list',
      'resource_semantic_search',
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
      'docling_list_images',
      'docling_show_image',
      'docling_show_page_images',
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
        description: 'Search the web for current information using Brave Search configured in Settings. If Brave is missing, falls back to less reliable HTML scraping. Returns titles, URLs, and snippets.',
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
        description: 'Get full details of a specific resource. For indexed PDFs, returns only the structure (TOC with node_ids)—use resource_get_section or resource_semantic_search for specific content. Do NOT call get_document_structure—the structure is already included. For notes and other types, returns full content. Cite inline as [N] when using in answers.',
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
        name: 'resource_semantic_search',
        description: 'Semantic search across the user\'s library. When the user is viewing a specific resource (resource_id in context), prefer resource_get first—it returns structure. Use resource_semantic_search when you need to find sections by meaning (e.g. "methodology", "conclusions") or when searching across multiple documents. Cite inline as [N] when using results.',
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
        description: 'Get section content by node_id. Use node_ids from resource_get or get_document_structure. Do not call resource_get_section for the same node_id twice. Returns title, summary, page_range, and children (subsections) for deeper navigation.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource' },
            node_id: { type: 'string', description: 'PageIndex node_id (e.g. "0004") from structure or search results' },
          },
          required: ['resource_id', 'node_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_document_structure',
        description: 'Get the hierarchical outline/table of contents of a PDF or note. REDUNDANT if you already called resource_get for this resource—resource_get for indexed PDFs includes the structure. Use get_document_structure ONLY when you need structure without metadata (e.g. from a prior resource_list result). Returns node_ids for resource_get_section.',
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
        name: 'docling_list_images',
        description: 'List all visual artifacts (figures, charts, diagrams) extracted from a document via Docling conversion. Returns image IDs, page numbers, and captions. Use docling_show_image or docling_show_page_images to display them inline. Use when the user asks for images, figures, or visual details.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource (PDF, document) whose Docling-extracted images to list' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docling_show_image',
        description: 'Display a single visual artifact (figure, chart, diagram) extracted from a document inline. Use docling_list_images first to get available image IDs.',
        parameters: {
          type: 'object',
          properties: {
            image_id: { type: 'string', description: 'ID of the image to display' },
            resource_id: { type: 'string', description: 'Optional resource ID for context' },
          },
          required: ['image_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docling_show_page_images',
        description: 'Fetch visual artifacts (figures, charts, diagrams) from a document. Returns images with captions for your analysis. Use with docling_list_images: call docling_list_images first to get image_ids, then use artifact:docling_images in your response with ONLY the image_ids of figures relevant to the user\'s request. You decide which figures to show.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource' },
            page_no: { type: 'number', description: 'Show only images from this page. Omit for all images.' },
            max_images: { type: 'number', description: 'Max images to display (1-5). Default: 3.' },
          },
          required: ['resource_id'],
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
            window_minutes: { type: 'number', description: 'Look-ahead window in minutes. Default: 60. Use 1440 for today, 10080 for a week.' },
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
        description: 'Create a new resource (note, folder, url, etc.).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Resource title' },
            type: { type: 'string', description: 'note, notebook, document, url, folder' },
            content: { type: 'string', description: 'Content (for notes)' },
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
  chatWithToolsInMain,
  executeToolInMain,
  getAllToolDefinitions,
  getWhatsAppToolDefinitions,
  getToolDefinitionsByIds,
  getToolDefsBySubagent,
};
