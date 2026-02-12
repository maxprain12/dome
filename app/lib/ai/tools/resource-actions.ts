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
import { serializeNotebookContent } from '@/lib/notebook/default-notebook';
import type { NotebookContent, NotebookCell } from '@/types';

// =============================================================================
// Schemas
// =============================================================================

const NotebookCellSchema = Type.Object({
  cell_type: Type.Union([
    Type.Literal('code'),
    Type.Literal('markdown'),
  ], {
    description: 'Type of cell: "code" (Python) or "markdown".',
  }),
  source: Type.String({
    description: 'Content of the cell.',
  }),
});

const ResourceCreateSchema = Type.Object({
  title: Type.String({
    description: 'Title for the new resource.',
  }),
  type: Type.Optional(
    Type.String({
      description:
        "Resource type: 'note' | 'notebook' | 'document' | 'url' | 'folder'. " +
        "note/document: text/HTML content. notebook: Python cells. url: metadata.url required. folder: title only. Default: 'note'.",
    }),
  ),
  content: Type.Optional(
    Type.String({
      description:
        'Content: for note/document = text or HTML. For notebook = JSON string of NotebookContent, or omit and use cells instead.',
    }),
  ),
  cells: Type.Optional(
    Type.Array(NotebookCellSchema, {
      description:
        'For type=notebook: array of {cell_type, source}. At least one markdown (title) + one code cell recommended.',
    }),
  ),
  metadata: Type.Optional(
    Type.Object({
      url: Type.Optional(Type.String({ description: 'For type=url: the URL to save.' })),
    }, {
      description: 'For type=url: include {url: "https://..."}.',
    }),
  ),
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID to create the resource in. Defaults to the current project.',
    }),
  ),
  folder_id: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'Folder ID to place the resource in. Use null for root.',
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
function buildNotebookContentFromCells(
  cells: Array<{ cell_type: string; source: string }>
): string {
  const notebookCells: NotebookCell[] = cells.map((c) => {
    if (c.cell_type === 'code') {
      return {
        cell_type: 'code',
        source: c.source,
        outputs: [],
        execution_count: null,
        metadata: {},
      } as NotebookCell;
    }
    return {
      cell_type: 'markdown',
      source: c.source,
      metadata: {},
    } as NotebookCell;
  });
  const nb: NotebookContent = {
    nbformat: 4,
    nbformat_minor: 1,
    cells: notebookCells.length > 0 ? notebookCells : [
      { cell_type: 'markdown', source: '# Notebook', metadata: {} } as NotebookCell,
      {
        cell_type: 'code',
        source: 'print("Hello!")',
        outputs: [],
        execution_count: null,
        metadata: {},
      } as NotebookCell,
    ],
    metadata: {
      kernelspec: { display_name: 'Python 3 (Pyodide)', name: 'python3', language: 'python' },
    },
  };
  return serializeNotebookContent(nb);
}

export function createResourceCreateTool(): AnyAgentTool {
  return {
    label: 'Crear Recurso',
    name: 'resource_create',
    description:
      'Crea un nuevo recurso en la base de conocimiento. Tipos: note (texto/HTML), notebook (código Python), document, url (metadata.url), folder (solo título). ' +
      'Para notebook: usa cells=[{cell_type, source}] o content (JSON). Para url: metadata.url.',
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
        const type = (readStringParam(params, 'type') || 'note').toLowerCase();
        let content = readStringParam(params, 'content');
        const cells = params.cells as Array<{ cell_type: string; source: string }> | undefined;
        const metadata = params.metadata as Record<string, unknown> | undefined;
        const projectId = readStringParam(params, 'project_id');
        const folderId = params.folder_id as string | null | undefined;

        if (!title) {
          return jsonResult({ status: 'error', error: 'Title is required.' });
        }

        const validTypes = ['note', 'notebook', 'document', 'url', 'folder'];
        if (!validTypes.includes(type)) {
          return jsonResult({
            status: 'error',
            error: `Type must be one of: ${validTypes.join(', ')}.`,
          });
        }

        if (type === 'notebook') {
          if (Array.isArray(cells) && cells.length > 0) {
            content = buildNotebookContentFromCells(cells);
          } else if (!content || !content.trim()) {
            content = buildNotebookContentFromCells([
              { cell_type: 'markdown', source: `# ${title}\n\nEscribe y ejecuta código Python.` },
              { cell_type: 'code', source: 'print("Hello from Python!")' },
            ]);
          }
        } else if (type === 'url') {
          const url = metadata?.url;
          if (typeof url === 'string' && url.trim()) {
            content = content || '';
          }
        } else if (type === 'folder') {
          content = '';
        } else {
          content = content || '';
        }

        const createPayload: Record<string, unknown> = {
          title,
          type,
          content: content ?? '',
          project_id: projectId,
          folder_id: folderId,
        };
        if (metadata && typeof metadata === 'object') {
          createPayload.metadata = metadata;
        }

        const result = await window.electron.ai.tools.resourceCreate(createPayload);

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to create resource',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Resource "${title}" (${type}) created successfully.`,
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
