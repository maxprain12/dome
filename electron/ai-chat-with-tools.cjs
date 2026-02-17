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
  resource_create: 'resourceCreate',
  resource_update: 'resourceUpdate',
  resource_delete: 'resourceDelete',
  resource_move_to_folder: 'resourceMoveToFolder',
  flashcard_create: 'flashcardCreate',
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
        result = await fn(args.resource_id || args.resourceId, { includeContent: args.include_content !== false, maxContentLength: args.max_content_length });
        break;
      case 'resourceList':
        result = await fn({ project_id: args.project_id, folder_id: args.folder_id, type: args.type, limit: args.limit, sort: args.sort });
        break;
      case 'resourceSemanticSearch':
        result = await fn(args.query || '', { project_id: args.project_id, limit: args.limit });
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
 * OpenAI-format tool definitions for WhatsApp (subset of Many tools)
 * Covers resource search/get/list, project context, and flashcard creation.
 */
function getWhatsAppToolDefinitions() {
  return [
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
        description: 'Update an existing resource.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Resource ID' },
            title: { type: 'string', description: 'New title' },
            content: { type: 'string', description: 'New content' },
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
        description: 'Create a flashcard deck from Q&A pairs.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Deck title' },
            description: { type: 'string', description: 'Deck description' },
            project_id: { type: 'string', description: 'Project ID' },
            cards: {
              type: 'array',
              description: 'Array of { question, answer, difficulty?, tags? }',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                  difficulty: { type: 'string' },
                  tags: { type: 'string' },
                },
                required: ['question', 'answer'],
              },
            },
          },
          required: ['title', 'cards'],
        },
      },
    },
  ];
}

module.exports = {
  chatWithToolsInMain,
  executeToolInMain,
  getWhatsAppToolDefinitions,
};
