/**
 * @dome/tools — `office` family: Excel tool definitions.
 *
 * Faithful to `getAllToolDefinitions()`. Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../../types.js';

export const EXCEL_TOOL_NAMES = [
  'excel_get',
  'excel_get_file_path',
  'excel_set_cell',
  'excel_set_range',
  'excel_add_row',
  'excel_add_sheet',
  'excel_create',
  'excel_export',
] as const;

export type ExcelToolName = (typeof EXCEL_TOOL_NAMES)[number];

export function excelToolDefinitions(): ToolDefinition[] {
  return [
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
  ];
}
