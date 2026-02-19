/**
 * Excel Tools
 *
 * Tools for the AI agent to read and modify Excel (XLSX/XLS) resources.
 * Enables cell editing, range operations, sheet management, and export.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam } from './common';

// =============================================================================
// Helpers
// =============================================================================

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron?.ai?.tools !== undefined;
}

// =============================================================================
// Schemas
// =============================================================================

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
  title: Type.String({
    description: 'Title for the new Excel resource.',
  }),
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
    label: 'Obtener Excel',
    name: 'excel_get',
    description:
      'Obtiene el contenido de un Excel (hojas, datos). Úsalo para leer un archivo Excel antes de modificarlo o cuando el usuario pregunta sobre su contenido. Acepta resource_id de un recurso document/xlsx.',
    parameters: ExcelGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
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

export function createExcelSetCellTool(): AnyAgentTool {
  return {
    label: 'Modificar celda Excel',
    name: 'excel_set_cell',
    description: 'Modifica el valor de una celda en un Excel. Usa referencias A1 (ej. A1, B2).',
    parameters: ExcelSetCellSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
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
          value
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
    label: 'Escribir rango Excel',
    name: 'excel_set_range',
    description: 'Escribe un array 2D de valores en un rango (ej. A1:C3).',
    parameters: ExcelSetRangeSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
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
    label: 'Añadir fila Excel',
    name: 'excel_add_row',
    description: 'Añade una fila con los valores dados a una hoja del Excel.',
    parameters: ExcelAddRowSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
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
    label: 'Añadir hoja Excel',
    name: 'excel_add_sheet',
    description: 'Crea una nueva hoja en un Excel.',
    parameters: ExcelAddSheetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
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
    label: 'Crear Excel',
    name: 'excel_create',
    description: 'Crea un nuevo recurso Excel vacío o con datos iniciales.',
    parameters: ExcelCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
          return jsonResult({ status: 'error', error: 'Excel tools require Electron.' });
        }
        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: true });
        const projectId = readStringParam(params, 'project_id');
        const currentProject = await window.electron!.ai.tools.getCurrentProject();
        const resolvedProjectId = projectId || currentProject?.id || 'default';
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
    label: 'Exportar Excel',
    name: 'excel_export',
    description: 'Exporta un Excel a base64 (xlsx o csv). Para guardar en disco, el usuario puede usar la opción de exportar recurso.',
    parameters: ExcelExportSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectron()) {
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
    createExcelSetCellTool(),
    createExcelSetRangeTool(),
    createExcelAddRowTool(),
    createExcelAddSheetTool(),
    createExcelCreateTool(),
    createExcelExportTool(),
  ];
}
