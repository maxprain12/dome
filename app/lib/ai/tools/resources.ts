/**
 * Resource Tools
 * 
 * Tools for searching, retrieving, and listing resources in Dome.
 * These tools allow the AI agent to access and work with the user's
 * knowledge base (notes, PDFs, videos, audios, images, URLs).
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam, readBooleanParam } from './common';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const DEFAULT_MAX_CONTENT_LENGTH = 10000;

const RESOURCE_TYPES = ['note', 'notebook', 'pdf', 'video', 'audio', 'image', 'url', 'document', 'folder'] as const;
type ResourceType = typeof RESOURCE_TYPES[number];

// =============================================================================
// Schemas
// =============================================================================

const ResourceSearchSchema = Type.Object({
  query: Type.String({
    description: 'Search query to find resources by title or content.',
  }),
  project_id: Type.Optional(
    Type.String({
      description: 'Filter results to a specific project ID.',
    }),
  ),
  type: Type.Optional(
    Type.String({
      description: 'Filter by resource type: note, pdf, video, audio, image, url, document, folder.',
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of results to return (1-50). Default: 10.',
      minimum: 1,
      maximum: MAX_SEARCH_LIMIT,
    }),
  ),
});

const ResourceGetSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the resource to retrieve.',
  }),
  include_content: Type.Optional(
    Type.Boolean({
      description: 'Whether to include the full content. Default: true.',
    }),
  ),
  max_content_length: Type.Optional(
    Type.Number({
      description: 'Maximum length of content to return (characters). Default: 10000.',
    }),
  ),
});

const ResourceListSchema = Type.Object({
  project_id: Type.Optional(
    Type.String({
      description: 'Filter results to a specific project ID.',
    }),
  ),
  folder_id: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'Filter by folder. Use null to get root resources (not in any folder).',
    }),
  ),
  type: Type.Optional(
    Type.String({
      description: 'Filter by resource type: note, pdf, video, audio, image, url, document, folder.',
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of results to return (1-100). Default: 20.',
      minimum: 1,
      maximum: MAX_LIST_LIMIT,
    }),
  ),
  sort: Type.Optional(
    Type.String({
      description: "Sort by: 'created_at' or 'updated_at'. Default: 'updated_at'.",
    }),
  ),
});

const ResourceSemanticSearchSchema = Type.Object({
  query: Type.String({
    description: 'Natural language query to search for semantically similar resources.',
  }),
  project_id: Type.Optional(
    Type.String({
      description: 'Filter results to a specific project ID.',
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of results to return (1-50). Default: 10.',
      minimum: 1,
      maximum: MAX_SEARCH_LIMIT,
    }),
  ),
});

// =============================================================================
// Helper Functions
// =============================================================================

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.ai?.tools !== undefined;
}

function validateResourceType(type: string | undefined): ResourceType | undefined {
  if (!type) return undefined;
  const normalized = type.toLowerCase().trim();
  if (RESOURCE_TYPES.includes(normalized as ResourceType)) {
    return normalized as ResourceType;
  }
  return undefined;
}

function clampLimit(value: number | undefined, defaultVal: number, maxVal: number): number {
  if (value === undefined || value === null) return defaultVal;
  return Math.max(1, Math.min(maxVal, Math.floor(value)));
}

// =============================================================================
// Tool Factories
// =============================================================================

/**
 * Create a resource search tool using full-text search.
 */
export function createResourceSearchTool(): AnyAgentTool {
  return {
    label: 'Buscar Recursos',
    name: 'resource_search',
    description: 'Search resources by title or content.',
    parameters: ResourceSearchSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Resource search requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const query = readStringParam(params, 'query', { required: true });
        const projectId = readStringParam(params, 'project_id');
        const typeRaw = readStringParam(params, 'type');
        const limitRaw = readNumberParam(params, 'limit', { integer: true });

        const type = validateResourceType(typeRaw);
        const limit = clampLimit(limitRaw, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);

        const result = await window.electron.ai.tools.resourceSearch(query, {
          project_id: projectId,
          type,
          limit,
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Search failed',
          });
        }

        return jsonResult({
          status: 'success',
          query: result.query,
          count: result.count,
          results: result.results?.map(r => ({
            id: r.id,
            title: r.title,
            type: r.type,
            snippet: r.snippet,
            updated_at: new Date(r.updated_at).toISOString(),
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          status: 'error',
          error: message,
        });
      }
    },
  };
}

/**
 * Create a resource get tool to retrieve full resource details.
 */
export function createResourceGetTool(): AnyAgentTool {
  return {
    label: 'Obtener Recurso',
    name: 'resource_get',
    description: 'Get full resource details including content and transcription.',
    parameters: ResourceGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Resource get requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const includeContent = readBooleanParam(params, 'include_content') ?? true;
        const maxContentLength = readNumberParam(params, 'max_content_length', { integer: true }) ?? DEFAULT_MAX_CONTENT_LENGTH;

        const result = await window.electron.ai.tools.resourceGet(resourceId, {
          includeContent,
          maxContentLength,
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Resource not found',
          });
        }

        const resource = result.resource;
        if (!resource) {
          return jsonResult({
            status: 'error',
            error: 'Resource data is empty',
          });
        }

        const response: Record<string, unknown> = {
          status: 'success',
          id: resource.id,
          title: resource.title,
          type: resource.type,
          project_id: resource.project_id,
          created_at: new Date(resource.created_at).toISOString(),
          updated_at: new Date(resource.updated_at).toISOString(),
        };

        // Add content if available
        if (resource.content) {
          response.content = resource.content;
          if (resource.content_truncated) {
            response.content_truncated = true;
            response.full_length = resource.full_length;
          }
        }

        // Add transcription if available (for audio/video)
        if (resource.transcription) {
          response.transcription = resource.transcription;
          if (resource.transcription_truncated) {
            response.transcription_truncated = true;
          }
        }

        // Add summary if available
        if (resource.summary) {
          response.summary = resource.summary;
        }

        // Add relevant metadata
        if (resource.metadata) {
          const meta = resource.metadata;
          if (meta.duration) response.duration = meta.duration;
          if (meta.pages) response.pages = meta.pages;
          if (meta.word_count) response.word_count = meta.word_count;
          if (meta.url) response.original_url = meta.url;
        }

        return jsonResult(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          status: 'error',
          error: message,
        });
      }
    },
  };
}

/**
 * Create a resource list tool to browse resources.
 */
export function createResourceListTool(): AnyAgentTool {
  return {
    label: 'Listar Recursos',
    name: 'resource_list',
    description: 'List resources filtered by project, folder, or type.',
    parameters: ResourceListSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Resource list requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const projectId = readStringParam(params, 'project_id');
        const folderId = params.folder_id as string | null | undefined;
        const typeRaw = readStringParam(params, 'type');
        const limitRaw = readNumberParam(params, 'limit', { integer: true });
        const sort = readStringParam(params, 'sort');

        const type = validateResourceType(typeRaw);
        const limit = clampLimit(limitRaw, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

        const result = await window.electron.ai.tools.resourceList({
          project_id: projectId,
          folder_id: folderId,
          type,
          limit,
          sort: sort === 'created_at' ? 'created_at' : 'updated_at',
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'List failed',
          });
        }

        return jsonResult({
          status: 'success',
          count: result.count,
          resources: result.resources?.map(r => ({
            id: r.id,
            title: r.title,
            type: r.type,
            folder_id: r.folder_id,
            updated_at: new Date(r.updated_at).toISOString(),
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          status: 'error',
          error: message,
        });
      }
    },
  };
}

/**
 * Create a semantic search tool using embeddings.
 */
export function createResourceSemanticSearchTool(): AnyAgentTool {
  return {
    label: 'Búsqueda Semántica',
    name: 'resource_semantic_search',
    description: 'Semantic search by meaning.',
    parameters: ResourceSemanticSearchSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Semantic search requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const query = readStringParam(params, 'query', { required: true });
        const projectId = readStringParam(params, 'project_id');
        const limitRaw = readNumberParam(params, 'limit', { integer: true });

        const limit = clampLimit(limitRaw, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);

        const result = await window.electron.ai.tools.resourceSemanticSearch(query, {
          project_id: projectId,
          limit,
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Semantic search failed',
          });
        }

        return jsonResult({
          status: 'success',
          query: result.query,
          method: result.method,
          count: result.count,
          results: result.results?.map(r => ({
            id: r.id,
            title: r.title,
            type: r.type,
            similarity: r.similarity,
            snippet: r.snippet,
            updated_at: new Date(r.updated_at).toISOString(),
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          status: 'error',
          error: message,
        });
      }
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Create all resource tools.
 */
export function createResourceTools(): AnyAgentTool[] {
  return [
    createResourceSearchTool(),
    createResourceGetTool(),
    createResourceListTool(),
    createResourceSemanticSearchTool(),
  ];
}
