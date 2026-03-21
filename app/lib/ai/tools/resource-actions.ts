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
        "Resource type: 'note' | 'notebook' | 'url' | 'folder'. " +
        "note: Markdown text content (most common). " +
        "notebook: Python cells (use cells[] param). " +
        "url: webpage saved by URL (metadata.url required). " +
        "folder: container for organizing resources. " +
        "Default: 'note'.",
    }),
  ),
  content: Type.Optional(
    Type.String({
      description:
        'Content: for url = text/HTML. For notebook = JSON string of NotebookContent, or omit and use cells instead.',
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
      color: Type.Optional(
        Type.String({
          description:
            'For type=folder: hex color for the folder icon (e.g. #7B76D0, #22c55e, #3b82f6).',
        })
      ),
    }, {
      description: 'For type=url: {url}. For type=folder: {color} for folder color.',
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
  metadata: Type.Optional(
    Type.Object({
      color: Type.Optional(
        Type.String({
          description:
            'For folders: hex color for the folder icon (e.g. #7B76D0, #22c55e, #3b82f6).',
        })
      ),
    }, {
      description: 'For folders: use {color: "#hex"} to change folder color.',
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

const ResourceMoveToFolderSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the resource (document, pdf, etc.) to move.',
  }),
  folder_id: Type.Union([
    Type.String({ description: 'Target folder ID to move the resource into.' }),
    Type.Null({ description: 'Use null to move the resource to root (no folder).' }),
  ], {
    description: 'Folder ID to move the resource to, or null for root.',
  }),
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
    description: 'Create a resource. Default type is "note". Types: note (Markdown text), notebook (Python cells), url (webpage), folder (container). Use folder_id to place in a specific folder.',
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

        const validTypes = ['notebook', 'url', 'folder', 'note'];
        // Redirect legacy 'document' type to 'url'
        const normalizedType = type === 'document' ? 'url' : type;
        if (!validTypes.includes(normalizedType)) {
          return jsonResult({
            status: 'error',
            error: `Type must be one of: ${validTypes.join(', ')}.`,
          });
        }

        if (normalizedType === 'notebook') {
          if (Array.isArray(cells) && cells.length > 0) {
            content = buildNotebookContentFromCells(cells);
          } else if (!content || !content.trim()) {
            content = buildNotebookContentFromCells([
              { cell_type: 'markdown', source: `# ${title}\n\nEscribe y ejecuta código Python.` },
              { cell_type: 'code', source: 'print("Hello from Python!")' },
            ]);
          }
        } else if (normalizedType === 'url') {
          const url = metadata?.url;
          if (typeof url === 'string' && url.trim()) {
            content = content || '';
          }
        } else if (normalizedType === 'note') {
          content = content || '';
        } else if (normalizedType === 'folder') {
          content = '';
        } else {
          content = content || '';
        }

        const createPayload: Record<string, unknown> = {
          title,
          type: normalizedType,
          content: content ?? '',
          project_id: projectId,
          folder_id: folderId,
        };
        if (metadata && typeof metadata === 'object') {
          createPayload.metadata = metadata;
        }

        const result = await window.electron.ai.tools.resourceCreate(createPayload as { title: string; type?: string; content?: string; project_id?: string });

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to create resource',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Resource "${title}" (${normalizedType}) created successfully.`,
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
    description: 'Update resource title, content, or metadata. For folders: metadata.color (#hex).',
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
        const metadataParam = params.metadata as Record<string, unknown> | undefined;

        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'Resource ID is required.' });
        }

        if (title === undefined && content === undefined && !(metadataParam && Object.keys(metadataParam).length > 0)) {
          return jsonResult({
            status: 'error',
            error: 'At least one of title, content, or metadata must be provided.',
          });
        }

        const updates: Record<string, unknown> = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (metadataParam && typeof metadataParam === 'object') updates.metadata = metadataParam;

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
    description: 'Delete a resource. Always confirm with user first. Requires confirm=true.',
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
 * Create a tool for moving resources to folders (organize documents, nest in folders).
 */
export function createResourceMoveToFolderTool(): AnyAgentTool {
  return {
    label: 'Mover a Carpeta',
    name: 'resource_move_to_folder',
    description: 'Move resource or folder to another folder or root. Use get_library_overview first for IDs.',
    parameters: ResourceMoveToFolderSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({
            status: 'error',
            error: 'Resource move requires Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const folderId = params.folder_id as string | null | undefined;

        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'resource_id is required.' });
        }

        const result = await window.electron.ai.tools.resourceMoveToFolder(
          resourceId,
          folderId === undefined ? null : folderId
        );

        if (!result.success) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Failed to move resource',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Resource moved ${folderId ? 'to folder' : 'to root'}.`,
          resource_id: resourceId,
          folder_id: folderId ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

/**
 * Create all resource action tools (create, update, delete, move).
 */
export function createResourceActionTools(): AnyAgentTool[] {
  return [
    createResourceCreateTool(),
    createResourceUpdateTool(),
    createResourceDeleteTool(),
    createResourceMoveToFolderTool(),
  ];
}

// =============================================================================
// Import File to Dome Library (for MCP agents)
// =============================================================================

const ImportFileToDomeSchema = Type.Object({
  title: Type.String({ description: 'Title for the resource in Dome.' }),
  content: Type.Optional(Type.String({ description: 'Text content of the file (for plain text, markdown, etc.).' })),
  content_base64: Type.Optional(Type.String({ description: 'Base64-encoded binary content (for PDFs, DOCX, etc.).' })),
  mime_type: Type.Optional(Type.String({ description: 'MIME type of the file, e.g. application/pdf, text/plain.' })),
  filename: Type.Optional(Type.String({ description: 'Original filename with extension, used to infer type.' })),
  project_id: Type.Optional(Type.String({ description: 'Project ID to place the resource in.' })),
  folder_id: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Folder ID to place the resource in, or null for root.' })),
});

/**
 * Tool for AI agents to import file content retrieved from MCP servers into the Dome library.
 */
export function createImportFileToDomeTool(): AnyAgentTool {
  return {
    label: 'Import File to Dome Library',
    name: 'import_file_to_dome',
    description:
      'Save file content retrieved from an MCP server (filesystem, Google Drive, etc.) as a resource in the Dome library. ' +
      'Use this after reading a file with an MCP tool. Provide either text content or base64-encoded binary content.',
    parameters: ImportFileToDomeSchema,
    execute: async (_toolCallId, args) => {
      try {
        const result = await window.electron.ai.tools.importFileToLibrary({
          title: readStringParam(args, 'title') ?? '',
          content: readStringParam(args, 'content') ?? undefined,
          content_base64: readStringParam(args, 'content_base64') ?? undefined,
          mime_type: readStringParam(args, 'mime_type') ?? undefined,
          filename: readStringParam(args, 'filename') ?? undefined,
          project_id: readStringParam(args, 'project_id') ?? undefined,
          folder_id: args.folder_id !== undefined ? (args.folder_id as string | null) : undefined,
        });
        return jsonResult(
          result.success
            ? { status: 'success', resource_id: result.resource?.id, title: result.resource?.title }
            : { status: 'error', error: result.error }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}
