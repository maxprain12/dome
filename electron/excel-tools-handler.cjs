/* eslint-disable no-console */
/**
 * Excel Tools Handler - Main Process
 *
 * Spreadsheet read/write via ExcelJS (replaces SheetJS xlsx).
 */

const fs = require('fs');
const path = require('path');

const {
  ExcelJS,
  decodeA1Ref,
  decodeA1Range,
  worksheetToAoa,
  inferSheetName,
  readWorkbookFromPath,
  worksheetToCsv,
  addSheetFromAoa,
} = require('./exceljs-helpers.cjs');

const database = require('./database.cjs');
const fileStorage = require('./file-storage.cjs');

let windowManagerRef = null;
function setWindowManager(wm) {
  windowManagerRef = wm;
}
function broadcastResourceUpdated(resourceId) {
  if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
    windowManagerRef.broadcast('resource:updated', {
      id: resourceId,
      updates: { updated_at: Date.now() },
    });
  }
}
function broadcastResourceCreated(resource) {
  if (windowManagerRef && typeof windowManagerRef.broadcast === 'function') {
    windowManagerRef.broadcast('resource:created', resource);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function isExcelResource(resource) {
  if (!resource) return false;
  const mime = resource.file_mime_type || '';
  const filename = (resource.original_filename || resource.title || '').toLowerCase();
  return (
    resource.type === 'excel' ||
    resource.type === 'document' ||
    mime.includes('spreadsheetml') ||
    mime.includes('ms-excel') ||
    filename.endsWith('.xlsx') ||
    filename.endsWith('.xls')
  );
}

function getFullPathForResource(resource) {
  if (!resource?.internal_path) return null;
  const fullPath = fileStorage.getFullPath(resource.internal_path);
  return fs.existsSync(fullPath) ? fullPath : null;
}

/** @param {unknown} value */
function normalizeSetValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'boolean') return value;
  return String(value);
}

// =============================================================================
// Excel Operations
// =============================================================================

/**
 * @param {string} resourceId
 * @param {Object} options
 */
async function excelGet(resourceId, options = {}) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isExcelResource(resource)) {
      return { success: false, error: 'Resource is not an Excel file (xlsx/xls)' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'Excel file not found on disk' };
    }

    const wb = new ExcelJS.Workbook();
    await readWorkbookFromPath(wb, fullPath);

    const sheetName = inferSheetName(wb, options.sheet_name);
    const ws = sheetName ? wb.getWorksheet(sheetName) : null;

    const result = {
      success: true,
      resource_id: resourceId,
      title: resource.title,
      sheet_names: wb.worksheets.map((s) => s.name),
      sheet_name: sheetName,
    };

    if (ws) {
      if (options.range) {
        const range = decodeA1Range(options.range);
        if (range) {
          result.data = worksheetToAoa(ws, { rangeRef: options.range });
          result.range = options.range;
        } else {
          result.data = worksheetToAoa(ws);
        }
      } else {
        result.data = worksheetToAoa(ws);
      }
    } else {
      result.data = [];
    }

    return result;
  } catch (error) {
    console.error('[ExcelTools] excelGet error:', error);
    return { success: false, error: error.message };
  }
}

async function excelGetFilePath(resourceId) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isExcelResource(resource)) {
      return { success: false, error: 'Resource is not an Excel file (xlsx/xls)' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'Excel file not found on disk' };
    }

    return {
      success: true,
      resource_id: resourceId,
      title: resource.title,
      file_path: fullPath,
    };
  } catch (error) {
    console.error('[ExcelTools] excelGetFilePath error:', error);
    return { success: false, error: error.message };
  }
}

async function excelSetCell(resourceId, sheetName, cellRef, value) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isExcelResource(resource)) {
      return { success: false, error: 'Resource is not an Excel file' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'Excel file not found on disk' };
    }

    const wb = new ExcelJS.Workbook();
    await readWorkbookFromPath(wb, fullPath);

    const targetName = inferSheetName(wb, sheetName);
    if (!targetName) {
      return { success: false, error: 'Workbook has no sheets' };
    }
    const ws = wb.getWorksheet(targetName);
    if (!ws) {
      return { success: false, error: `Sheet "${targetName}" not found` };
    }

    const cell = String(cellRef).trim().toUpperCase();
    if (!/^[A-Z]+\d+$/.test(cell)) {
      return { success: false, error: `Invalid cell reference: ${cellRef}. Use A1-style (e.g. A1, B2)` };
    }

    ws.getCell(cell).value = normalizeSetValue(value);

    await wb.xlsx.writeFile(fullPath);
    broadcastResourceUpdated(resourceId);
    return {
      success: true,
      resource_id: resourceId,
      sheet_name: targetName,
      cell,
      value,
    };
  } catch (error) {
    console.error('[ExcelTools] excelSetCell error:', error);
    return { success: false, error: error.message };
  }
}

async function excelSetRange(resourceId, sheetName, rangeRef, values) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isExcelResource(resource)) {
      return { success: false, error: 'Resource is not an Excel file' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'Excel file not found on disk' };
    }

    const range = decodeA1Range(rangeRef);
    if (!range) {
      return { success: false, error: `Invalid range: ${rangeRef}` };
    }

    const wb = new ExcelJS.Workbook();
    await readWorkbookFromPath(wb, fullPath);

    const targetName = inferSheetName(wb, sheetName);
    if (!targetName) {
      return { success: false, error: 'Workbook has no sheets' };
    }
    let ws = wb.getWorksheet(targetName);
    if (!ws) {
      ws = wb.addWorksheet(targetName);
    }

    const rows = Array.isArray(values) ? values : [[values]];
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      const arr = Array.isArray(row) ? row : [row];
      for (let c = 0; c < arr.length; c += 1) {
        const rr = range.s.r + r + 1;
        const cc = range.s.c + c + 1;
        ws.getRow(rr).getCell(cc).value = normalizeSetValue(arr[c]);
      }
    }

    await wb.xlsx.writeFile(fullPath);
    broadcastResourceUpdated(resourceId);
    return {
      success: true,
      resource_id: resourceId,
      sheet_name: targetName,
      range: rangeRef,
      rows_written: rows.length,
    };
  } catch (error) {
    console.error('[ExcelTools] excelSetRange error:', error);
    return { success: false, error: error.message };
  }
}

async function excelAddRow(resourceId, sheetName, values, afterRow) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isExcelResource(resource)) {
      return { success: false, error: 'Resource is not an Excel file' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'Excel file not found on disk' };
    }

    const wb = new ExcelJS.Workbook();
    await readWorkbookFromPath(wb, fullPath);

    const targetName = inferSheetName(wb, sheetName);
    if (!targetName) {
      return { success: false, error: 'Workbook has no sheets' };
    }
    let ws = wb.getWorksheet(targetName);
    if (!ws) {
      ws = wb.addWorksheet(targetName);
    }

    const aoa = worksheetToAoa(ws);
    const rowIndex = afterRow != null ? afterRow + 1 : aoa.length;
    const arr = Array.isArray(values) ? values : [values];

    const excelRow = rowIndex + 1;
    const row = ws.getRow(excelRow);
    for (let c = 0; c < arr.length; c += 1) {
      row.getCell(c + 1).value = normalizeSetValue(arr[c]);
    }

    await wb.xlsx.writeFile(fullPath);
    broadcastResourceUpdated(resourceId);
    return {
      success: true,
      resource_id: resourceId,
      sheet_name: targetName,
      row_index: rowIndex,
      values: arr,
    };
  } catch (error) {
    console.error('[ExcelTools] excelAddRow error:', error);
    return { success: false, error: error.message };
  }
}

async function excelAddSheet(resourceId, sheetName, data) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isExcelResource(resource)) {
      return { success: false, error: 'Resource is not an Excel file' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'Excel file not found on disk' };
    }

    const wb = new ExcelJS.Workbook();
    await readWorkbookFromPath(wb, fullPath);

    const name = String(sheetName || 'Sheet').trim();
    if (wb.getWorksheet(name)) {
      return { success: false, error: `Sheet "${name}" already exists` };
    }

    const rows = data && Array.isArray(data) && data.length > 0 ? data : [['']];
    addSheetFromAoa(wb, rows, name);

    await wb.xlsx.writeFile(fullPath);
    broadcastResourceUpdated(resourceId);
    return {
      success: true,
      resource_id: resourceId,
      sheet_name: name,
    };
  } catch (error) {
    console.error('[ExcelTools] excelAddSheet error:', error);
    return { success: false, error: error.message };
  }
}

async function excelCreate(projectId, title, options = {}) {
  try {
    const queries = database.getQueries();
    const project = queries.getProjectById.get(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    const sheetName = options.sheet_name || 'Sheet1';
    const initialData = options.initial_data;
    const data = Array.isArray(initialData) ? initialData : [[options.initial_data ?? '']];
    if (data.length === 0) data.push(['']);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    for (const row of data) {
      ws.addRow(row);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const filename = (title || 'Untitled').replace(/\.xlsx$/i, '') + '.xlsx';
    const importResult = await fileStorage.importFromBuffer(Buffer.from(buffer), filename, 'document');

    const resourceId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const contentText = worksheetToCsv(ws).trim().substring(0, 500);

    queries.createResourceWithFile.run(
      resourceId,
      projectId,
      'excel',
      title.replace(/\.xlsx$/i, '') || 'Untitled',
      contentText,
      null,
      importResult.internalPath,
      importResult.mimeType,
      importResult.size,
      importResult.hash,
      null,
      filename,
      null,
      now,
      now
    );

    const resource = queries.getResourceById.get(resourceId);
    broadcastResourceCreated(resource);
    return {
      success: true,
      resource: {
        id: resource.id,
        title: resource.title,
        type: resource.type,
        project_id: resource.project_id,
        sheet_name: sheetName,
      },
    };
  } catch (error) {
    console.error('[ExcelTools] excelCreate error:', error);
    return { success: false, error: error.message };
  }
}

async function excelExport(resourceId, options = {}) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }
    if (!isExcelResource(resource)) {
      return { success: false, error: 'Resource is not an Excel file' };
    }

    const fullPath = getFullPathForResource(resource);
    if (!fullPath) {
      return { success: false, error: 'Excel file not found on disk' };
    }

    const format = (options.format || 'xlsx').toLowerCase();
    const wb = new ExcelJS.Workbook();
    await readWorkbookFromPath(wb, fullPath);
    const sheetName = inferSheetName(wb, options.sheet_name);
    const ws = sheetName ? wb.getWorksheet(sheetName) : null;

    if (format === 'csv') {
      const csv = ws ? worksheetToCsv(ws) : '';
      const buf = Buffer.from(csv, 'utf-8');
      if (options.destination_path) {
        fs.writeFileSync(options.destination_path, buf);
        return {
          success: true,
          resource_id: resourceId,
          format: 'csv',
          destination: options.destination_path,
        };
      }
      return {
        success: true,
        resource_id: resourceId,
        format: 'csv',
        data: buf.toString('base64'),
      };
    }

    const buffer = await wb.xlsx.writeBuffer();
    if (options.destination_path) {
      fs.writeFileSync(options.destination_path, Buffer.from(buffer));
      return {
        success: true,
        resource_id: resourceId,
        format: 'xlsx',
        destination: options.destination_path,
      };
    }
    return {
      success: true,
      resource_id: resourceId,
      format: 'xlsx',
      data: Buffer.from(buffer).toString('base64'),
    };
  } catch (error) {
    console.error('[ExcelTools] excelExport error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  setWindowManager,
  excelGet,
  excelGetFilePath,
  excelSetCell,
  excelSetRange,
  excelAddRow,
  excelAddSheet,
  excelCreate,
  excelExport,
};
