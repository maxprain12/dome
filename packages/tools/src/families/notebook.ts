/**
 * @dome/tools — `notebook` family definitions (Jupyter-style cells).
 *
 * Mirrors `resources.ts`. Faithful to `getAllToolDefinitions()`.
 * Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';

/** The notebook-family tool names (subset of the 103-tool catalog). */
export const NOTEBOOK_TOOL_NAMES = [
  'notebook_get',
  'notebook_add_cell',
  'notebook_update_cell',
  'notebook_delete_cell',
] as const;

export type NotebookToolName = (typeof NOTEBOOK_TOOL_NAMES)[number];

export function notebookToolDefinitions(): ToolDefinition[] {
  return [
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
        description:
          'Add a code or markdown cell to a notebook. Use for pandas/sklearn analysis. Use position to insert after a cell.',
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
  ];
}
