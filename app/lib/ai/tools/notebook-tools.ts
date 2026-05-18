/**
 * Notebook Tools
 *
 * Tools for the AI agent to read and modify notebook resources.
 * Enables code generation, cell management, and debugging assistance.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';
import {
  parseNotebookContent,
  serializeNotebookContent,
} from '@/lib/notebook/default-notebook';
import type { NotebookContent, NotebookCell, NotebookCodeCell } from '@/types';
import { isElectronAI } from '@/lib/utils/formatting';

// =============================================================================
// Helpers
// =============================================================================

function sourceToString(source: string | string[]): string {
  return typeof source === 'string' ? source : (source || []).join('');
}

function buildNotebookCell(
  cellType: 'code' | 'markdown',
  source: string
): NotebookCell {
  if (cellType === 'code') {
    return {
      cell_type: 'code',
      source,
      outputs: [],
      execution_count: null,
      metadata: {},
    } as NotebookCodeCell;
  }
  return {
    cell_type: 'markdown',
    source,
    metadata: {},
  };
}

// =============================================================================
// Schemas
// =============================================================================

const NotebookGetSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the notebook resource to retrieve.',
  }),
});

const NotebookAddCellSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the notebook resource.',
  }),
  cell_type: Type.Union([
    Type.Literal('code'),
    Type.Literal('markdown'),
  ], {
    description: 'Type of cell to add: "code" or "markdown".',
  }),
  source: Type.String({
    description: 'Content of the new cell (Python code or Markdown).',
  }),
  position: Type.Optional(
    Type.Number({
      description: 'Index where to insert the cell (0-based). Default: append at end.',
      minimum: 0,
    })
  ),
});

const NotebookUpdateCellSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the notebook resource.',
  }),
  cell_index: Type.Number({
    description: 'Zero-based index of the cell to update.',
    minimum: 0,
  }),
  source: Type.String({
    description: 'New content for the cell.',
  }),
});

const NotebookDeleteCellSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the notebook resource.',
  }),
  cell_index: Type.Number({
    description: 'Zero-based index of the cell to delete.',
    minimum: 0,
  }),
});

// =============================================================================
// Tool Factories
// =============================================================================

/**
 * Get structured notebook content (cells, code, outputs).
 */
export function createNotebookGetTool(): AnyAgentTool {
  return {
    label: 'Get notebook',
    name: 'notebook_get',
    description:
      'Get the structured content of a notebook (cells, code, outputs). Use before modifying a notebook or when the user asks for data analysis. For Excel→Notebook flows, combine with excel_get_file_path and notebook_add_cell.',
    parameters: NotebookGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'Notebook tools require Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'resource_id is required.' });
        }

        const result = await window.electron.ai.tools.resourceGet(resourceId, {
          includeContent: true,
          maxContentLength: 50000,
        });

        if (!result.success || !result.resource) {
          return jsonResult({
            status: 'error',
            error: result.error || 'Resource not found',
          });
        }

        const resource = result.resource;
        if (resource.type !== 'notebook') {
          return jsonResult({
            status: 'error',
            error: `Resource "${resourceId}" is not a notebook (type: ${resource.type}).`,
          });
        }

        const nb = parseNotebookContent(resource.content);
        const cells = nb.cells.map((cell, idx) => {
          const source = sourceToString(cell.source);
          const item: Record<string, unknown> = {
            index: idx,
            cell_type: cell.cell_type,
            source,
          };
          if (cell.cell_type === 'code') {
            const codeCell = cell as NotebookCodeCell;
            item.outputs = codeCell.outputs?.length ?? 0;
            item.execution_count = codeCell.execution_count;
          }
          return item;
        });

        return jsonResult({
          status: 'success',
          resource_id: resourceId,
          title: resource.title,
          cell_count: cells.length,
          cells,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

/**
 * Add a code or markdown cell to a notebook.
 */
export function createNotebookAddCellTool(): AnyAgentTool {
  return {
    label: 'Add cell',
    name: 'notebook_add_cell',
    description:
      'Add a code or markdown cell to a notebook. Use to generate code (pandas, sklearn), add explanations, or extend the notebook. For "extract data from Excel X and analyze": use excel_get_file_path to get the path, then add a cell with pd.read_excel(path). Use position to insert after a specific cell.',
    parameters: NotebookAddCellSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'Notebook tools require Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const cellType = readStringParam(params, 'cell_type') as 'code' | 'markdown';
        const source = readStringParam(params, 'source', { required: true });
        const position = readNumberParam(params, 'position', { integer: true });

        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'resource_id is required.' });
        }
        if (!cellType || !['code', 'markdown'].includes(cellType)) {
          return jsonResult({
            status: 'error',
            error: 'cell_type must be "code" or "markdown".',
          });
        }
        if (source === undefined) {
          return jsonResult({ status: 'error', error: 'source is required.' });
        }

        const getResult = await window.electron.ai.tools.resourceGet(resourceId, {
          includeContent: true,
          maxContentLength: 50000,
        });
        if (!getResult.success || !getResult.resource) {
          return jsonResult({
            status: 'error',
            error: getResult.error || 'Notebook not found',
          });
        }
        if (getResult.resource.type !== 'notebook') {
          return jsonResult({
            status: 'error',
            error: 'Resource is not a notebook.',
          });
        }

        const nb = parseNotebookContent(getResult.resource.content);
        const newCell = buildNotebookCell(cellType, source);
        const pos =
          position !== undefined && position >= 0 && position <= nb.cells.length
            ? position
            : nb.cells.length;
        nb.cells.splice(pos, 0, newCell);

        const newContent = serializeNotebookContent(nb);
        const updateResult = await window.electron.ai.tools.resourceUpdate(
          resourceId,
          { content: newContent }
        );

        if (!updateResult.success) {
          return jsonResult({
            status: 'error',
            error: updateResult.error || 'Failed to update notebook',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Added ${cellType} cell at position ${pos}.`,
          resource_id: resourceId,
          cell_index: pos,
          cell_type: cellType,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

/**
 * Update the source of a specific cell.
 */
export function createNotebookUpdateCellTool(): AnyAgentTool {
  return {
    label: 'Update cell',
    name: 'notebook_update_cell',
    description:
      'Update the content of an existing cell. Use to fix code, apply debugging fixes, or modify markdown explanations.',
    parameters: NotebookUpdateCellSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'Notebook tools require Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const cellIndex = readNumberParam(params, 'cell_index', { required: true, integer: true });
        const source = readStringParam(params, 'source', { required: true });

        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'resource_id is required.' });
        }
        if (cellIndex === undefined || cellIndex < 0) {
          return jsonResult({ status: 'error', error: 'cell_index is required and must be >= 0.' });
        }
        if (source === undefined) {
          return jsonResult({ status: 'error', error: 'source is required.' });
        }

        const getResult = await window.electron.ai.tools.resourceGet(resourceId, {
          includeContent: true,
          maxContentLength: 50000,
        });
        if (!getResult.success || !getResult.resource) {
          return jsonResult({
            status: 'error',
            error: getResult.error || 'Notebook not found',
          });
        }
        if (getResult.resource.type !== 'notebook') {
          return jsonResult({
            status: 'error',
            error: 'Resource is not a notebook.',
          });
        }

        const nb = parseNotebookContent(getResult.resource.content);
        if (cellIndex >= nb.cells.length) {
          return jsonResult({
            status: 'error',
            error: `Cell index ${cellIndex} out of range (notebook has ${nb.cells.length} cells).`,
          });
        }

        nb.cells[cellIndex] = { ...nb.cells[cellIndex], source } as NotebookCell;
        const newContent = serializeNotebookContent(nb);
        const updateResult = await window.electron.ai.tools.resourceUpdate(
          resourceId,
          { content: newContent }
        );

        if (!updateResult.success) {
          return jsonResult({
            status: 'error',
            error: updateResult.error || 'Failed to update notebook',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Updated cell ${cellIndex}.`,
          resource_id: resourceId,
          cell_index: cellIndex,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({ status: 'error', error: message });
      }
    },
  };
}

/**
 * Delete a cell from a notebook.
 */
export function createNotebookDeleteCellTool(): AnyAgentTool {
  return {
    label: 'Delete cell',
    name: 'notebook_delete_cell',
    description:
      'Delete a cell from a notebook. The notebook must retain at least one cell.',
    parameters: NotebookDeleteCellSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({
            status: 'error',
            error: 'Notebook tools require Electron environment.',
          });
        }

        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const cellIndex = readNumberParam(params, 'cell_index', { required: true, integer: true });

        if (!resourceId) {
          return jsonResult({ status: 'error', error: 'resource_id is required.' });
        }
        if (cellIndex === undefined || cellIndex < 0) {
          return jsonResult({ status: 'error', error: 'cell_index is required and must be >= 0.' });
        }

        const getResult = await window.electron.ai.tools.resourceGet(resourceId, {
          includeContent: true,
          maxContentLength: 50000,
        });
        if (!getResult.success || !getResult.resource) {
          return jsonResult({
            status: 'error',
            error: getResult.error || 'Notebook not found',
          });
        }
        if (getResult.resource.type !== 'notebook') {
          return jsonResult({
            status: 'error',
            error: 'Resource is not a notebook.',
          });
        }

        const nb = parseNotebookContent(getResult.resource.content);
        if (nb.cells.length <= 1) {
          return jsonResult({
            status: 'error',
            error: 'Cannot delete the last cell. A notebook must have at least one cell.',
          });
        }
        if (cellIndex >= nb.cells.length) {
          return jsonResult({
            status: 'error',
            error: `Cell index ${cellIndex} out of range (notebook has ${nb.cells.length} cells).`,
          });
        }

        nb.cells.splice(cellIndex, 1);
        const newContent = serializeNotebookContent(nb);
        const updateResult = await window.electron.ai.tools.resourceUpdate(
          resourceId,
          { content: newContent }
        );

        if (!updateResult.success) {
          return jsonResult({
            status: 'error',
            error: updateResult.error || 'Failed to update notebook',
          });
        }

        return jsonResult({
          status: 'success',
          message: `Deleted cell ${cellIndex}.`,
          resource_id: resourceId,
          cell_count: nb.cells.length,
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

export function createNotebookTools(): AnyAgentTool[] {
  return [
    createNotebookGetTool(),
    createNotebookAddCellTool(),
    createNotebookUpdateCellTool(),
    createNotebookDeleteCellTool(),
  ];
}
