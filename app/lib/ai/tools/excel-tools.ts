/**
 * Excel Tools
 *
 * Tools for the AI agent to read and modify Excel (XLSX/XLS) resources.
 * Enables cell editing, range operations, sheet management, and export.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

// =============================================================================
// Schemas
// =============================================================================

const ExcelGetFilePathSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the Excel resource to get the file path for.',
  }),
});

const ExcelGetSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the Excel resource to read.',
  }),
  sheet_name: Type.Optional(
    Type.String({
      description: 'Sheet name. Default: first sheet.',
    })
  ),
  range: Type.Optional(
    Type.String({
      description: 'A1-style range (e.g. A1:C10). Default: entire sheet.',
    })
  ),
});

const ExcelSetCellSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the Excel resource.',
  }),
  sheet_name: Type.Optional(
    Type.String({
      description: 'Sheet name. Default: first sheet.',
    })
  ),
  cell: Type.String({
    description: 'A1-style cell reference (e.g. A1, B2).',
  }),
  value: Type.Union([Type.String(), Type.Number(), Type.Boolean()], {
    description: 'Value to set (string, number, or boolean).',
  }),
});

const ExcelSetRangeSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the Excel resource.',
  }),
  sheet_name: Type.Optional(
    Type.String({
      description: 'Sheet name. Default: first sheet.',
    })
  ),
  range: Type.String({
    description: 'A1-style range (e.g. A1:C3).',
  }),
  values: Type.Array(Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()])), {
    description: '2D array of values to write.',
  }),
});

const ExcelAddRowSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the Excel resource.',
  }),
  sheet_name: Type.Optional(
    Type.String({
      description: 'Sheet name. Default: first sheet.',
    })
  ),
  values: Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]), {
    description: 'Row values (cells in the new row).',
  }),
  after_row: Type.Optional(
    Type.Number({
      description: '0-based row index after which to insert. Default: append at end.',
      minimum: 0,
    })
  ),
});

const ExcelAddSheetSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the Excel resource.',
  }),
  sheet_name: Type.String({
    description: 'Name of the new sheet.',
  }),
  data: Type.Optional(
    Type.Array(Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()])), {
      description: 'Optional initial data (2D array).',
    })
  ),
});

const ExcelCreateSchema = Type.Object({
  title: Type.Optional(Type.String({
    description: 'Title for the new Excel resource. If omitted, derived from sheet_name or defaults to "Untitled Spreadsheet".',
  })),
  project_id: Type.Optional(
    Type.String({
      description: 'Project ID. Default: current project.',
    })
  ),
  sheet_name: Type.Optional(
    Type.String({
      description: 'Name of the first sheet. Default: Sheet1.',
    })
  ),
  initial_data: Type.Optional(
    Type.Array(Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()])), {
      description: 'Optional initial data (2D array).',
    })
  ),
});

const ExcelExportSchema = Type.Object({
  resource_id: Type.String({
    description: 'The ID of the Excel resource to export.',
  }),
  format: Type.Optional(
    Type.Union([Type.Literal('xlsx'), Type.Literal('csv')], {
      description: 'Export format. Default: xlsx.',
    })
  ),
  sheet_name: Type.Optional(
    Type.String({
      description: 'Sheet name for CSV export. Default: first sheet.',
    })
  ),
});

// =============================================================================
// Tool Factories
// =============================================================================

export function createExcelGetTool(): AnyAgentTool {
  return {
    label: 'Get Excel content',
    name: 'excel_get',
    description:
      'Read the content of an Excel resource (sheets, data, cell values). Use before editing an Excel file, or when the user asks about its contents. Accepts the resource_id of a document/xlsx resource.',
    parameters: ExcelGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', { required: true });
        const result = await window.electron!.ai.tools.excelGet(resourceId, {
          sheet_name: readStringParam(args as Record<string, unknown>, 'sheet_name'),
          range: readStringParam(args as Record<string, unknown>, 'range'),
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createExcelGetFilePathTool(): AnyAgentTool {
  return {
    label: 'Get Excel file path',
    name: 'excel_get_file_path',
    description:
      'Get the absolute on-disk path of an Excel resource. Use to generate Python code that reads the file with pd.read_excel(path) or openpyxl. Essential for the Excel→Notebook analysis flow (pair with notebook_add_cell).',
    parameters: ExcelGetFilePathSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', {
          required: true,
        });
        const result = await window.electron!.ai.tools.excelGetFilePath(resourceId);
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createExcelSetCellTool(): AnyAgentTool {
  return {
    label: 'Set cell value',
    name: 'excel_set_cell',
    description: 'Set the value of a single cell in an Excel resource. Use A1-style references (e.g. A1, B2).',
    parameters: ExcelSetCellSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const cell = readStringParam(params, 'cell', { required: true });
        const value = params.value;
        const result = await window.electron!.ai.tools.excelSetCell(
          resourceId,
          readStringParam(params, 'sheet_name'),
          cell,
          value as string | number | boolean,
          { invokedBy: 'agent' },
        );
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createExcelSetRangeTool(): AnyAgentTool {
  return {
    label: 'Write range',
    name: 'excel_set_range',
    description: 'Write a 2D array of values into a cell range (e.g. A1:C3).',
    parameters: ExcelSetRangeSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const range = readStringParam(params, 'range', { required: true });
        const values = params.values;
        if (!Array.isArray(values)) {
          return jsonResult({ status: 'error', error: 'values must be a 2D array.' });
        }
        const result = await window.electron!.ai.tools.excelSetRange(
          resourceId,
          readStringParam(params, 'sheet_name'),
          range,
          values
        );
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createExcelAddRowTool(): AnyAgentTool {
  return {
    label: 'Add row',
    name: 'excel_add_row',
    description: 'Append or insert a row with given values into an Excel sheet.',
    parameters: ExcelAddRowSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const values = params.values;
        if (!Array.isArray(values)) {
          return jsonResult({ status: 'error', error: 'values must be an array.' });
        }
        const result = await window.electron!.ai.tools.excelAddRow(
          resourceId,
          readStringParam(params, 'sheet_name'),
          values,
          readNumberParam(params, 'after_row')
        );
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createExcelAddSheetTool(): AnyAgentTool {
  return {
    label: 'Add sheet',
    name: 'excel_add_sheet',
    description: 'Create a new sheet in an Excel resource.',
    parameters: ExcelAddSheetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const sheetName = readStringParam(params, 'sheet_name', { required: true });
        const result = await window.electron!.ai.tools.excelAddSheet(
          resourceId,
          sheetName,
          params.data as string[][] | undefined
        );
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createExcelCreateTool(): AnyAgentTool {
  return {
    label: 'Create Excel',
    name: 'excel_create',
    description: 'Create a new Excel resource, optionally seeded with initial data.',
    parameters: ExcelCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const sheetName = readStringParam(params, 'sheet_name', { required: false });
        const title = readStringParam(params, 'title', { required: false }) || sheetName || 'Untitled Spreadsheet';
        const projectId = readStringParam(params, 'project_id');
        const currentProjectResult = await window.electron!.ai.tools.getCurrentProject();
        const resolvedProjectId = projectId || currentProjectResult?.project?.id || 'default';
        const result = await window.electron!.ai.tools.excelCreate(resolvedProjectId, title, {
          sheet_name: readStringParam(params, 'sheet_name'),
          initial_data: params.initial_data as string[][] | undefined,
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createExcelExportTool(): AnyAgentTool {
  return {
    label: 'Export Excel',
    name: 'excel_export',
    description: 'Export an Excel resource as base64 (xlsx or csv). Use when the user wants to download or share the file.',
    parameters: ExcelExportSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const result = await window.electron!.ai.tools.excelExport(resourceId, {
          format: readStringParam(params, 'format') as 'xlsx' | 'csv' | undefined,
          sheet_name: readStringParam(params, 'sheet_name'),
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createExcelTools(): AnyAgentTool[] {
  return [
    createExcelGetTool(),
    createExcelGetFilePathTool(),
    createExcelSetCellTool(),
    createExcelSetRangeTool(),
    createExcelAddRowTool(),
    createExcelAddSheetTool(),
    createExcelCreateTool(),
    createExcelExportTool(),
  ];
}
