/**
 * Context Tools
 * 
 * Tools for accessing application context in Dome.
 * These tools allow the AI agent to understand the user's workspace,
 * projects, and interact with annotations and notes on resources.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_INTERACTION_LIMIT = 50;
const MAX_INTERACTION_LIMIT = 200;
const INTERACTION_TYPES = ['note', 'annotation', 'chat'] as const;
type InteractionType = typeof INTERACTION_TYPES[number];

// =============================================================================
// Schemas
// =============================================================================

const ProjectListSchema = Type.Object({
  // No parameters - returns all projects
});

const ProjectGetSchema = Type.Object({
  project_id: Type.String({
    description: 'The ID of the project to retrieve.',
  }),
});

const InteractionListSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the resource to get interactions for.',
  }),
  type: Type.Optional(
    Type.String({
      description: "Filter by interaction type: 'note', 'annotation', or 'chat'.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of interactions to return (1-200). Default: 50.',
      minimum: 1,
      maximum: MAX_INTERACTION_LIMIT,
    }),
  ),
});

const GetRecentResourcesSchema = Type.Object({
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of recent resources to return (1-20). Default: 5.',
      minimum: 1,
      maximum: 20,
    }),
  ),
});

const GetCurrentProjectSchema = Type.Object({
  // No parameters - returns the current/default project
});

const GetLibraryOverviewSchema = Type.Object({
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID. Defaults to current project if omitted.',
    }),
  ),
});

// =============================================================================
// Helper Functions
// =============================================================================

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.ai?.tools !== undefined;
}

function validateInteractionType(type: string | undefined): InteractionType | undefined {
  if (!type) return undefined;
  const normalized = type.toLowerCase().trim();
  if (INTERACTION_TYPES.includes(normalized as InteractionType)) {
    return normalized as InteractionType;
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
 * Create a tool to list all projects.
 */
export function createProjectListTool(): AnyAgentTool {
  return {
    label: 'Listar Proyectos',
    name: 'project_list',
    description: 'List all projects.',
    parameters: ProjectListSchema,
    execute: async () => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Project list requires Electron environment.',
          });
        }

        const result = await window.electron.ai.tools.projectList();

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to list projects',
          });
        }

        return jsonResult({
          status: 'success',
          count: result.count,
          projects: result.projects?.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            created_at: new Date(p.created_at).toISOString(),
            updated_at: new Date(p.updated_at).toISOString(),
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
 * Create a tool to get project details.
 */
export function createProjectGetTool(): AnyAgentTool {
  return {
    label: 'Obtener Proyecto',
    name: 'project_get',
    description: 'Get project details by ID.',
    parameters: ProjectGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Project get requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const projectId = readStringParam(params, 'project_id', { required: true });

        const result = await window.electron.ai.tools.projectGet(projectId);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Project not found',
          });
        }

        const project = result.project;
        if (!project) {
          return jsonResult({
            status: 'error',
            error: 'Project data is empty',
          });
        }

        return jsonResult({
          status: 'success',
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            resource_count: project.resource_count,
            created_at: new Date(project.created_at).toISOString(),
            updated_at: new Date(project.updated_at).toISOString(),
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

/**
 * Create a tool to list interactions (notes, annotations, chat) for a resource.
 */
export function createInteractionListTool(): AnyAgentTool {
  return {
    label: 'Listar Interacciones',
    name: 'interaction_list',
    description: 'List notes, annotations, and chat for a resource.',
    parameters: InteractionListSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Interaction list requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const typeRaw = readStringParam(params, 'type');
        const limitRaw = readNumberParam(params, 'limit', { integer: true });

        const type = validateInteractionType(typeRaw);
        const limit = clampLimit(limitRaw, DEFAULT_INTERACTION_LIMIT, MAX_INTERACTION_LIMIT);

        const result = await window.electron.ai.tools.interactionList(resourceId, {
          type,
          limit,
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to list interactions',
          });
        }

        return jsonResult({
          status: 'success',
          resource_id: result.resource_id,
          count: result.count,
          interactions: result.interactions?.map(i => {
            const item: Record<string, unknown> = {
              id: i.id,
              type: i.type,
              content: i.content,
              created_at: new Date(i.created_at).toISOString(),
            };

            // Include position data for annotations (page, coordinates, selected text)
            if (i.position_data) {
              if (i.position_data.pageIndex !== undefined) {
                item.page = i.position_data.pageIndex + 1;
              }
              if (i.position_data.selectedText) {
                item.selected_text = i.position_data.selectedText;
              }
            }

            // Include role for chat messages
            if (i.metadata?.role) {
              item.role = i.metadata.role;
            }

            return item;
          }),
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
 * Create a tool to get recent resources.
 */
export function createGetRecentResourcesTool(): AnyAgentTool {
  return {
    label: 'Recursos Recientes',
    name: 'get_recent_resources',
    description: 'Get recently updated resources.',
    parameters: GetRecentResourcesSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Get recent resources requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const limitRaw = readNumberParam(params, 'limit', { integer: true });
        const limit = clampLimit(limitRaw, 5, 20);

        const result = await window.electron.ai.tools.getRecentResources(limit);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to get recent resources',
          });
        }

        return jsonResult({
          status: 'success',
          resources: result.resources?.map(r => ({
            id: r.id,
            title: r.title,
            type: r.type,
            project_id: r.project_id,
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
 * Create a tool to get the current/default project.
 */
export function createGetCurrentProjectTool(): AnyAgentTool {
  return {
    label: 'Proyecto Actual',
    name: 'get_current_project',
    description: 'Get current/default project.',
    parameters: GetCurrentProjectSchema,
    execute: async () => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Get current project requires Electron environment.',
          });
        }

        const result = await window.electron.ai.tools.getCurrentProject();

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to get current project',
          });
        }

        if (!result.project) {
          return jsonResult({
            status: 'success',
            project: null,
            message: 'No current project set',
          });
        }

        return jsonResult({
          status: 'success',
          project: {
            id: result.project.id,
            name: result.project.name,
            description: result.project.description,
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

/**
 * Create a tool to get the full library structure (folders and resources per folder).
 * Essential when the user asks to organize documents or wants to see their library.
 */
export function createGetLibraryOverviewTool(): AnyAgentTool {
  return {
    label: 'Ver Estructura de Biblioteca',
    name: 'resource_get_library_overview',
    description: 'Get full library structure: root folders/resources and each folder contents. Use first when organizing documents.',
    parameters: GetLibraryOverviewSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Library overview requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const projectId = readStringParam(params, 'project_id');

        const result = await window.electron.ai.tools.getLibraryOverview({
          project_id: projectId,
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to get library overview',
          });
        }

        return jsonResult({
          status: 'success',
          project: result.project,
          root: result.root,
          folders: result.folders,
          total_resources: result.total_resources,
          total_folders: result.total_folders,
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
 * Create all context tools.
 */
export function createContextTools(): AnyAgentTool[] {
  return [
    createProjectListTool(),
    createProjectGetTool(),
    createInteractionListTool(),
    createGetRecentResourcesTool(),
    createGetCurrentProjectTool(),
    createGetLibraryOverviewTool(),
  ];
}
