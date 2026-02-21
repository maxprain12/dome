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
  resource_list: 'resourceList',
  resource_semantic_search: 'resourceSemanticSearch',
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
  const apiKey = provider === 'ollama' ? undefined : queries.getSetting?.get?.('ai_api_key')?.value;
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
      'resource_list',
      'resource_semantic_search',
      'project_list',
      'project_get',
      'get_recent_resources',
      'get_current_project',
      'get_library_overview',
      'resource_move_to_folder',
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
        description: 'Search the web for information. Use Brave or Perplexity. Returns titles, URLs, snippets. Requires BRAVE_API_KEY or PERPLEXITY_API_KEY env var.',
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
        description: 'Get full details of a specific resource including content. Use to read a note, PDF, or other resource.',
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
        description: 'Semantic search for resources using natural language query.',
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

module.exports = {
  chatWithToolsInMain,
  executeToolInMain,
  getWhatsAppToolDefinitions,
  getToolDefsBySubagent,
};
