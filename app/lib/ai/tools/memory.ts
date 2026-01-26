/**
 * Memory Search Tool
 * 
 * Search through documents and resources using semantic similarity.
 * Integrates with the vector database for embeddings-based search.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_RESULTS_COUNT = 5;
const MAX_RESULTS_COUNT = 20;

// =============================================================================
// Schema
// =============================================================================

const MemorySearchSchema = Type.Object({
  query: Type.String({
    description: 'Search query to find relevant documents or memories.',
  }),
  count: Type.Optional(
    Type.Number({
      description: 'Number of results to return (1-20). Default: 5.',
      minimum: 1,
      maximum: MAX_RESULTS_COUNT,
    }),
  ),
  type: Type.Optional(
    Type.String({
      description: "Filter by resource type (e.g., 'note', 'document', 'link', 'pdf').",
    }),
  ),
  projectId: Type.Optional(
    Type.String({
      description: 'Filter by project ID.',
    }),
  ),
  minScore: Type.Optional(
    Type.Number({
      description: 'Minimum similarity score (0-1). Default: 0.5.',
      minimum: 0,
      maximum: 1,
    }),
  ),
});

// =============================================================================
// Configuration
// =============================================================================

export interface MemorySearchConfig {
  /** Function to generate embeddings for the query */
  generateEmbeddings: (text: string) => Promise<number[]>;
  /** Function to search the vector database */
  searchVectors: (params: {
    embedding: number[];
    limit: number;
    filter?: Record<string, unknown>;
  }) => Promise<MemorySearchResult[]>;
  /** Default number of results */
  defaultCount?: number;
  /** Minimum similarity score threshold */
  defaultMinScore?: number;
}

export interface MemorySearchResult {
  id: string;
  title?: string;
  content: string;
  type?: string;
  projectId?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create a memory search tool.
 */
export function createMemorySearchTool(config: MemorySearchConfig): AnyAgentTool {
  const defaultCount = config.defaultCount ?? DEFAULT_RESULTS_COUNT;
  const defaultMinScore = config.defaultMinScore ?? 0.5;

  return {
    label: 'Memory Search',
    name: 'memory_search',
    description: 'Search through your documents, notes, and resources using semantic similarity. Use this to find relevant information based on meaning, not just keywords.',
    parameters: MemorySearchSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const query = readStringParam(params, 'query', { required: true });
        const count = readNumberParam(params, 'count', { integer: true }) ?? defaultCount;
        const type = readStringParam(params, 'type');
        const projectId = readStringParam(params, 'projectId');
        const minScore = readNumberParam(params, 'minScore') ?? defaultMinScore;

        const limit = Math.min(Math.max(1, count), MAX_RESULTS_COUNT);

        // Generate embedding for the query
        const embedding = await config.generateEmbeddings(query);

        // Build filter
        const filter: Record<string, unknown> = {};
        if (type) filter.type = type;
        if (projectId) filter.projectId = projectId;

        // Search vectors
        const results = await config.searchVectors({
          embedding,
          limit: limit * 2, // Get more results to filter by score
          filter: Object.keys(filter).length > 0 ? filter : undefined,
        });

        // Filter by minimum score and limit
        const filtered = results
          .filter(r => r.score >= minScore)
          .slice(0, limit);

        if (filtered.length === 0) {
          return jsonResult({
            status: 'no_results',
            query,
            message: 'No relevant documents found for your query.',
            suggestion: 'Try rephrasing your query or lowering the minimum score threshold.',
          });
        }

        return jsonResult({
          status: 'success',
          query,
          count: filtered.length,
          results: filtered.map(r => ({
            id: r.id,
            title: r.title,
            content: r.content.length > 500 ? r.content.slice(0, 500) + '...' : r.content,
            type: r.type,
            projectId: r.projectId,
            score: Math.round(r.score * 100) / 100,
            metadata: r.metadata,
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
// Memory Get Tool
// =============================================================================

const MemoryGetSchema = Type.Object({
  id: Type.String({
    description: 'ID of the document or resource to retrieve.',
  }),
  includeContent: Type.Optional(
    Type.Boolean({
      description: 'Include full content in the response. Default: true.',
    }),
  ),
});

export interface MemoryGetConfig {
  /** Function to get a document by ID */
  getDocument: (id: string) => Promise<MemoryDocument | null>;
}

export interface MemoryDocument {
  id: string;
  title?: string;
  content: string;
  type?: string;
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a memory get tool for retrieving specific documents.
 */
export function createMemoryGetTool(config: MemoryGetConfig): AnyAgentTool {
  return {
    label: 'Memory Get',
    name: 'memory_get',
    description: 'Retrieve a specific document or resource by its ID. Use this to get the full content of a document found via memory_search.',
    parameters: MemoryGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        const params = args as Record<string, unknown>;
        const id = readStringParam(params, 'id', { required: true });
        const includeContent = params.includeContent !== false;

        const doc = await config.getDocument(id);

        if (!doc) {
          return jsonResult({
            status: 'not_found',
            id,
            message: 'Document not found.',
          });
        }

        return jsonResult({
          status: 'success',
          document: {
            id: doc.id,
            title: doc.title,
            content: includeContent ? doc.content : undefined,
            contentLength: doc.content.length,
            type: doc.type,
            projectId: doc.projectId,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            metadata: doc.metadata,
          },
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
// Helper Functions
// =============================================================================

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.ai?.tools !== undefined;
}

// =============================================================================
// Real implementations using IPC to main process
// =============================================================================

/**
 * Create a memory search tool that uses the IPC-based semantic search.
 * This integrates with the LanceDB vector database in the main process.
 */
export function createMemorySearchWithIPC(): AnyAgentTool {
  return {
    label: 'Memory Search',
    name: 'memory_search',
    description: 'Busca en tus documentos y recursos usando similitud semántica. Usa esto para encontrar información relevante basada en significado, no solo palabras clave.',
    parameters: MemorySearchSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Memory search requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const query = readStringParam(params, 'query', { required: true });
        const count = readNumberParam(params, 'count', { integer: true }) ?? DEFAULT_RESULTS_COUNT;
        const type = readStringParam(params, 'type');
        const projectId = readStringParam(params, 'projectId');
        const minScore = readNumberParam(params, 'minScore') ?? 0.5;

        const limit = Math.min(Math.max(1, count), MAX_RESULTS_COUNT);

        // Use the IPC-based semantic search
        const result = await window.electron.ai.tools.resourceSemanticSearch(query, {
          project_id: projectId,
          limit: limit * 2, // Get more to filter by score
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Search failed',
          });
        }

        // Filter by type and minimum score
        let filtered = result.results || [];
        
        if (type) {
          filtered = filtered.filter(r => r.type === type);
        }
        
        if (minScore > 0 && result.method === 'semantic') {
          filtered = filtered.filter(r => (r.similarity || 0) >= minScore);
        }
        
        filtered = filtered.slice(0, limit);

        if (filtered.length === 0) {
          return jsonResult({
            status: 'no_results',
            query,
            message: 'No se encontraron documentos relevantes para tu consulta.',
            suggestion: 'Intenta reformular tu consulta o busca con términos diferentes.',
          });
        }

        return jsonResult({
          status: 'success',
          query,
          method: result.method,
          count: filtered.length,
          results: filtered.map(r => ({
            id: r.id,
            title: r.title,
            content: r.snippet,
            type: r.type,
            score: r.similarity ? Math.round(r.similarity * 100) / 100 : undefined,
            updated_at: r.updated_at,
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
 * Create a memory get tool that uses IPC to retrieve resources.
 */
export function createMemoryGetWithIPC(): AnyAgentTool {
  return {
    label: 'Memory Get',
    name: 'memory_get',
    description: 'Recupera un documento o recurso específico por su ID. Usa esto para obtener el contenido completo de un documento encontrado con memory_search.',
    parameters: MemoryGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Memory get requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const id = readStringParam(params, 'id', { required: true });
        const includeContent = params.includeContent !== false;

        // Use the IPC-based resource get
        const result = await window.electron.ai.tools.resourceGet(id, {
          includeContent,
          maxContentLength: 10000,
        });

        if (!result.success) {
          return jsonResult({
            status: 'not_found',
            id,
            error: result.error || 'Document not found',
          });
        }

        const resource = result.resource;
        if (!resource) {
          return jsonResult({
            status: 'not_found',
            id,
            message: 'Document not found.',
          });
        }

        return jsonResult({
          status: 'success',
          document: {
            id: resource.id,
            title: resource.title,
            content: resource.content,
            contentLength: resource.full_length || resource.content?.length || 0,
            contentTruncated: resource.content_truncated,
            type: resource.type,
            projectId: resource.project_id,
            summary: resource.summary,
            transcription: resource.transcription,
            createdAt: new Date(resource.created_at).toISOString(),
            updatedAt: new Date(resource.updated_at).toISOString(),
            metadata: resource.metadata,
          },
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
// Stub implementations for when vector DB is not available
// =============================================================================

/**
 * Create a stub memory search tool that returns a helpful message.
 */
export function createMemorySearchStub(): AnyAgentTool {
  return {
    label: 'Memory Search',
    name: 'memory_search',
    description: 'Search through your documents and resources using semantic similarity.',
    parameters: MemorySearchSchema,
    execute: async () => {
      return jsonResult({
        status: 'unavailable',
        message: 'Memory search is not configured. Please set up embeddings in AI settings.',
        suggestion: 'Go to Settings > AI to configure an embedding model.',
      });
    },
  };
}

/**
 * Create a stub memory get tool that returns a helpful message.
 */
export function createMemoryGetStub(): AnyAgentTool {
  return {
    label: 'Memory Get',
    name: 'memory_get',
    description: 'Retrieve a specific document or resource by its ID.',
    parameters: MemoryGetSchema,
    execute: async () => {
      return jsonResult({
        status: 'unavailable',
        message: 'Memory get is not configured.',
      });
    },
  };
}

// =============================================================================
// Smart factory that uses IPC if available, otherwise stubs
// =============================================================================

/**
 * Create memory tools that automatically use IPC if in Electron, otherwise stubs.
 */
export function createMemoryTools(): AnyAgentTool[] {
  // In Electron environment, use IPC-based tools
  if (typeof window !== 'undefined' && window.electron?.ai?.tools) {
    return [
      createMemorySearchWithIPC(),
      createMemoryGetWithIPC(),
    ];
  }
  
  // Outside Electron, return stubs
  return [
    createMemorySearchStub(),
    createMemoryGetStub(),
  ];
}
