/* eslint-disable no-console */
/**
 * Excel Tools Handler - Main Process
 *
 * Provides functions to read and modify Excel (XLSX/XLS) resources.
 * Uses SheetJS (xlsx) for all spreadsheet operations.
 */

const fs = require('fs');
const path = require('path');

let XLSX = null;
try {
  XLSX = require('xlsx');
} catch (err) {
  console.warn('[ExcelTools] xlsx not available:', err.message);
}

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

function inferSheetName(wb, sheetName) {
  if (sheetName && wb.SheetNames.includes(sheetName)) return sheetName;
  return wb.SheetNames[0] || null;
}

function cellValueToType(value) {
  if (value === null || value === undefined) return { t: 's', v: '' };
  if (typeof value === 'number' && !Number.isNaN(value)) return { t: 'n', v: value };
  if (typeof value === 'boolean') return { t: 'b', v: value };
  return { t: 's', v: String(value) };
}

// =============================================================================
// Excel Operations
// =============================================================================

/**
 * Get Excel workbook content as structured JSON.
 * @param {string} resourceId - Resource ID
 * @param {Object} options - { sheet_name?, range? }
 * @returns {Promise<Object>}
 */
async function excelGet(resourceId, options = {}) {
  if (!XLSX) {
    return { success: false, error: 'xlsx module not available' };
  }

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

    const wb = XLSX.readFile(fullPath);
    const sheetName = inferSheetName(wb, options.sheet_name);
    const sheet = sheetName ? wb.Sheets[sheetName] : null;

    const result = {
      success: true,
      resource_id: resourceId,
      title: resource.title,
      sheet_names: wb.SheetNames,
      sheet_name: sheetName,
    };

    if (sheet) {
      if (options.range) {
        try {
          const range = XLSX.utils.decode_range(options.range);
          const data = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            range: options.range,
            defval: '',
          });
          result.data = data;
          result.range = options.range;
        } catch (e) {
          result.data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        }
      } else {
        result.data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (sheet['!ref']) result.range = sheet['!ref'];
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

/**
 * Set a single cell value.
 * @param {string} resourceId - Resource ID
 * @param {string} sheetName - Sheet name (or first sheet if null)
 * @param {string} cellRef - A1-style cell (e.g. A1, B2)
 * @param {string|number|boolean} value - Cell value
 * @returns {Promise<Object>}
 */
async function excelSetCell(resourceId, sheetName, cellRef, value) {
  if (!XLSX) {
    return { success: false, error: 'xlsx module not available' };
  }

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

    const wb = XLSX.readFile(fullPath);
    const targetSheet = inferSheetName(wb, sheetName);
    const ws = wb.Sheets[targetSheet];
    if (!ws) {
      return { success: false, error: `Sheet "${targetSheet}" not found` };
    }

    const cell = String(cellRef).trim().toUpperCase();
    if (!/^[A-Z]+\d+$/.test(cell)) {
      return { success: false, error: `Invalid cell reference: ${cellRef}. Use A1-style (e.g. A1, B2)` };
    }

    ws[cell] = cellValueToType(value);

    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      const decoded = XLSX.utils.decode_cell(cell);
      range.e.r = Math.max(range.e.r, decoded.r);
      range.e.c = Math.max(range.e.c, decoded.c);
      ws['!ref'] = XLSX.utils.encode_range(range);
    } else {
      ws['!ref'] = cell + ':' + cell;
    }

    XLSX.writeFile(wb, fullPath);
    broadcastResourceUpdated(resourceId);
    return {
      success: true,
      resource_id: resourceId,
      sheet_name: targetSheet,
      cell,
      value,
    };
  } catch (error) {
    console.error('[ExcelTools] excelSetCell error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Set a range of values (2D array).
 * @param {string} resourceId - Resource ID
 * @param {string} sheetName - Sheet name
 * @param {string} rangeRef - A1-style range (e.g. A1:C3)
 * @param {Array<Array>} values - 2D array of values
 * @returns {Promise<Object>}
 */
async function excelSetRange(resourceId, sheetName, rangeRef, values) {
  if (!XLSX) {
    return { success: false, error: 'xlsx module not available' };
  }

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

    const wb = XLSX.readFile(fullPath);
    const targetSheet = inferSheetName(wb, sheetName);
    let ws = wb.Sheets[targetSheet];
    if (!ws) {
      ws = {};
      wb.SheetNames.push(targetSheet);
      wb.Sheets[targetSheet] = ws;
    }

    const range = XLSX.utils.decode_range(rangeRef);
    const rows = Array.isArray(values) ? values : [[values]];
    let maxR = range.s.r;
    let maxC = range.s.c;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const arr = Array.isArray(row) ? row : [row];
      for (let c = 0; c < arr.length; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c });
        ws[cellAddr] = cellValueToType(arr[c]);
        maxR = Math.max(maxR, range.s.r + r);
        maxC = Math.max(maxC, range.s.c + c);
      }
    }

    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: range.s.r, c: range.s.c },
      e: { r: maxR, c: maxC },
    });

    XLSX.writeFile(wb, fullPath);
    broadcastResourceUpdated(resourceId);
    return {
      success: true,
      resource_id: resourceId,
      sheet_name: targetSheet,
      range: rangeRef,
      rows_written: rows.length,
    };
  } catch (error) {
    console.error('[ExcelTools] excelSetRange error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a row to a sheet.
 * @param {string} resourceId - Resource ID
 * @param {string} sheetName - Sheet name
 * @param {Array} values - Row values
 * @param {number} [afterRow] - 0-based row index after which to insert (default: append)
 * @returns {Promise<Object>}
 */
async function excelAddRow(resourceId, sheetName, values, afterRow) {
  if (!XLSX) {
    return { success: false, error: 'xlsx module not available' };
  }

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

    const wb = XLSX.readFile(fullPath);
    const targetSheet = inferSheetName(wb, sheetName);
    let ws = wb.Sheets[targetSheet];
    if (!ws) {
      ws = {};
      wb.SheetNames.push(targetSheet);
      wb.Sheets[targetSheet] = ws;
    }

    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const rowIndex = afterRow != null ? afterRow + 1 : data.length;
    const arr = Array.isArray(values) ? values : [values];

    for (let c = 0; c < arr.length; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: rowIndex, c });
      ws[cellAddr] = cellValueToType(arr[c]);
    }

    const maxR = Math.max(data.length, rowIndex);
    const maxC = Math.max(data[0]?.length || 0, arr.length);
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxR, c: Math.max(maxC - 1, 0) },
    });

    XLSX.writeFile(wb, fullPath);
    broadcastResourceUpdated(resourceId);
    return {
      success: true,
      resource_id: resourceId,
      sheet_name: targetSheet,
      row_index: rowIndex,
      values: arr,
    };
  } catch (error) {
    console.error('[ExcelTools] excelAddRow error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a new sheet to the workbook.
 * @param {string} resourceId - Resource ID
 * @param {string} sheetName - New sheet name
 * @param {Array<Array>} [data] - Optional initial data (2D array)
 * @returns {Promise<Object>}
 */
async function excelAddSheet(resourceId, sheetName, data) {
  if (!XLSX) {
    return { success: false, error: 'xlsx module not available' };
  }

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

    const wb = XLSX.readFile(fullPath);
    const name = String(sheetName || 'Sheet').trim();
    if (wb.SheetNames.includes(name)) {
      return { success: false, error: `Sheet "${name}" already exists` };
    }

    const ws = XLSX.utils.aoa_to_sheet(data && Array.isArray(data) ? data : [['']]);
    wb.SheetNames.push(name);
    wb.Sheets[name] = ws;

    XLSX.writeFile(wb, fullPath);
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

/**
 * Create a new Excel resource.
 * @param {string} projectId - Project ID
 * @param {string} title - Resource title
 * @param {Object} [options] - { sheet_name?, initial_data?, folder_id? }
 * @returns {Promise<Object>}
 */
async function excelCreate(projectId, title, options = {}) {
  if (!XLSX) {
    return { success: false, error: 'xlsx module not available' };
  }

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

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = (title || 'Untitled').replace(/\.xlsx$/i, '') + '.xlsx';
    const importResult = await fileStorage.importFromBuffer(
      Buffer.from(buffer),
      filename,
      'document'
    );

    const resourceId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const contentText = XLSX.utils.sheet_to_csv(ws).trim().substring(0, 500);

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

/**
 * Export Excel to destination path or return base64.
 * @param {string} resourceId - Resource ID
 * @param {Object} options - { format?: 'xlsx'|'csv', destination_path? }
 * @returns {Promise<Object>}
 */
async function excelExport(resourceId, options = {}) {
  if (!XLSX) {
    return { success: false, error: 'xlsx module not available' };
  }

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
    const wb = XLSX.readFile(fullPath);
    const sheetName = inferSheetName(wb, options.sheet_name);
    const ws = wb.Sheets[sheetName];

    if (format === 'csv') {
      const csv = ws ? XLSX.utils.sheet_to_csv(ws) : '';
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

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    if (options.destination_path) {
      fs.writeFileSync(options.destination_path, buffer);
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
      data: buffer.toString('base64'),
    };
  } catch (error) {
    console.error('[ExcelTools] excelExport error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  setWindowManager,
  excelGet,
  excelSetCell,
  excelSetRange,
  excelAddRow,
  excelAddSheet,
  excelCreate,
  excelExport,
};
