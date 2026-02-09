/**
 * Resource Action Tools
 *
 * Tools that allow the AI agent to create, update, and delete resources
 * in the user's knowledge base. These complement the read-only resource
 * tools in resources.ts.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readBooleanParam } from './common';

// =============================================================================
// Schemas
// =============================================================================

const ResourceCreateSchema = Type.Object({
  title: Type.String({
    description: 'Title for the new resource.',
  }),
  type: Type.Optional(
    Type.String({
      description: "Resource type: 'note' or 'document'. Default: 'note'.",
    }),
  ),
  content: Type.Optional(
    Type.String({
      description: 'Content for the resource. Can be plain text or HTML.',
    }),
  ),
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID to create the resource in. Defaults to the current project.',
    }),
  ),
});

const ResourceUpdateSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the resource to update.',
  }),
  title: Type.Optional(
    Type.String({
      description: 'New title for the resource.',
    }),
  ),
  content: Type.Optional(
    Type.String({
      description: 'New content for the resource (replaces existing content).',
    }),
  ),
});

const ResourceDeleteSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the resource to delete.',
  }),
  confirm: Type.Optional(
    Type.Boolean({
      description: 'Set to true to confirm deletion. Required to actually delete.',
    }),
  ),
});

// =============================================================================
// Helper
// =============================================================================

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.ai?.tools !== undefined;
}

// =============================================================================
// Tool Factories
// =============================================================================

/**
 * Create a tool for creating new resources.
 */
export function createResourceCreateTool(): AnyAgentTool {
  return {
    label: 'Crear Recurso',
    name: 'resource_create',
    description:
      'Crea un nuevo recurso (nota o documento) en la base de conocimiento del usuario. Úsalo para generar notas, guardar hallazgos de investigación, o crear documentos nuevos basados en la conversación.',
    parameters: ResourceCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Resource creation requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: true });
        const type = readStringParam(params, 'type') || 'note';
        const content = readStringParam(params, 'content') || '';
        const projectId = readStringParam(params, 'project_id');

        if (!title) {
          return jsonResult({ status: 'error', error: 'Title is required.' });
        }

        const result = await window.electron.ai.tools.resourceCreate({
          title,
          type,
          content,
          project_id: projectId,
        });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to create resource',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Resource "${title}" created successfully.`,
          resource: result.resource,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

/**
 * Create a tool for updating existing resources.
 */
export function createResourceUpdateTool(): AnyAgentTool {
  return {
    label: 'Actualizar Recurso',
    name: 'resource_update',
    description:
      'Actualiza el título o contenido de un recurso existente. Úsalo para editar notas, añadir contenido, o corregir información en un recurso.',
    parameters: ResourceUpdateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Resource update requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const title = readStringParam(params, 'title');
        const content = readStringParam(params, 'content');

        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'Resource ID is required.' });
        }

        if (title === undefined && content === undefined) {
          return jsonResult({
            status: 'error',
            error: 'At least one of title or content must be provided.',
          });
        }

        const updates: Record<string, unknown> = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;

        const result = await window.electron.ai.tools.resourceUpdate(resourceId, updates);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to update resource',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Resource updated successfully.`,
          resource: result.resource,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

/**
 * Create a tool for deleting resources.
 */
export function createResourceDeleteTool(): AnyAgentTool {
  return {
    label: 'Eliminar Recurso',
    name: 'resource_delete',
    description:
      'Elimina un recurso de la base de conocimiento. IMPORTANTE: Siempre confirma con el usuario antes de eliminar. El parámetro confirm debe ser true para proceder.',
    parameters: ResourceDeleteSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Resource deletion requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const confirm = readBooleanParam(params, 'confirm');

        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'Resource ID is required.' });
        }

        if (!confirm) {
          return jsonResult({
            status: 'needs_confirmation',
            message:
              'Deletion requires confirmation. Please confirm with the user before setting confirm=true.',
            resource_id: resourceId,
          });
        }

        const result = await window.electron.ai.tools.resourceDelete(resourceId);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to delete resource',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Resource "${result.deleted?.title}" has been deleted.`,
          deleted: result.deleted,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

// =============================================================================
// Bundle Export
// =============================================================================

/**
 * Create all resource action tools (create, update, delete).
 */
export function createResourceActionTools(): AnyAgentTool[] {
  return [
    createResourceCreateTool(),
    createResourceUpdateTool(),
    createResourceDeleteTool(),
  ];
}
