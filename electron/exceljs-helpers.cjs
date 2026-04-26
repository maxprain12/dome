/* eslint-disable no-console */
/**
 * ExcelJS utilities for the main process (Dome).
 * Replaces SheetJS (xlsx) for spreadsheet I/O.
 */

const ExcelJS = require('exceljs');
const path = require('path');

// -----------------------------------------------------------------------------
// A1 / range
// -----------------------------------------------------------------------------

/** @param {string} letters e.g. "AA" */
function colLettersToIndex0(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i += 1) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

/**
 * A1 or $A$1 -> { r, c } zero-based
 * @param {string} ref
 */
function decodeA1Ref(ref) {
  const s = String(ref).replace(/^\$/, '').replace(/\$/g, '');
  const m = s.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { r: parseInt(m[2], 10) - 1, c: colLettersToIndex0(m[1]) };
}

/**
 * A1-style range
 * @param {string} ref e.g. "A1:C3"
 */
function decodeA1Range(ref) {
  const parts = String(ref).split(':');
  if (parts.length !== 2) return null;
  const a = decodeA1Ref(parts[0]);
  const b = decodeA1Ref(parts[1]);
  if (!a || !b) return null;
  return {
    s: { r: Math.min(a.r, b.r), c: Math.min(a.c, b.c) },
    e: { r: Math.max(a.r, b.r), c: Math.max(a.c, b.c) },
  };
}

/** @param {number} c 0-based */
function colIndexToLetters(c) {
  let n = c + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * @param {import('exceljs').Cell} cell
 * @returns {string|number|boolean|Date}
 */
function cellValueToPrimitive(cell) {
  if (!cell) return '';
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v !== null) {
    if (Array.isArray(v)) return v.map((x) => (x && x.text) || x).join('');
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if ('formula' in v && v.result != null) return v.result;
    if (v.hyperlink) return v.text != null ? v.text : String(v.hyperlink);
    if (v.text) return v.text;
  }
  return String(v);
}

/**
 * 2D array (header:1), similar to XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).
 * @param {import('exceljs').Worksheet} worksheet
 * @param {{ maxRows?: number, rangeRef?: string }} [opts]
 * @returns {string[][]} rows of stringified cells for JSON transport
 */
function worksheetToAoa(worksheet, opts = {}) {
  const maxRows = opts.maxRows ?? 1_000_000;
  const rangeRef = opts.rangeRef;

  if (rangeRef) {
    const range = decodeA1Range(rangeRef);
    if (!range) return [];
    const aoa = [];
    for (let r = range.s.r; r <= range.e.r && aoa.length < maxRows; r += 1) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const cell = worksheet.getRow(r + 1).getCell(c + 1);
        const v = cellValueToPrimitive(cell);
        row.push(serializeCellForJson(v));
      }
      aoa.push(row);
    }
    return aoa;
  }

  const aoa = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > maxRows) return false;
    const r = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (r.length < colNumber - 1) r.push('');
      const v = cellValueToPrimitive(cell);
      r[colNumber - 1] = serializeCellForJson(v);
    });
    aoa.push(r);
    return true;
  });
  return aoa;
}

/**
 * @param {string|number|boolean|Date} v
 */
function serializeCellForJson(v) {
  if (v instanceof Date) return v.toISOString();
  if (v === null || v === undefined) return '';
  return v;
}

/**
 * @param {import('exceljs').Workbook} wb
 * @param {string} [name]
 * @returns {string|null} sheet name
 */
function inferSheetName(wb, name) {
  if (name) {
    const n = String(name).trim();
    const ws = wb.getWorksheet(n);
    if (ws) return ws.name;
  }
  return wb.worksheets[0]?.name ?? null;
}

/**
 * @param {import('exceljs').Workbook} wb
 * @param {string} filePath
 */
async function readWorkbookFromPath(wb, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xls') {
    const err = new Error(
      'Legacy .xls is not supported. Please open the file in Excel/LibreOffice and save as .xlsx.',
    );
    err.code = 'XLS_LEGACY';
    throw err;
  }
  await wb.xlsx.readFile(filePath);
}

/**
 * @param {import('exceljs').Workbook} wb
 * @param {ArrayBuffer|Buffer|import('stream').Stream} buffer
 */
async function readWorkbookFromBuffer(wb, buffer) {
  await wb.xlsx.load(buffer);
}

/**
 * Sheet to CSV (first sheet or named).
 * @param {import('exceljs').Worksheet} ws
 */
function worksheetToCsv(ws) {
  const lines = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cellValueToPrimitive(cell);
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) {
        cells.push(`"${s.replace(/"/g, '""')}"`);
      } else {
        cells.push(s);
      }
    });
    lines.push(cells.join(','));
  });
  return lines.join('\n');
}

/**
 * @param {import('exceljs').Workbook} wb
 * @param {string[][]} rows
 * @param {string} name
 * @param {import('exceljs').Workbook} [targetWb] default wb
 */
function addSheetFromAoa(wb, rows, name) {
  if (wb.getWorksheet(name)) {
    throw new Error(`Sheet "${name}" already exists`);
  }
  const ws = wb.addWorksheet(name);
  for (const row of rows) {
    ws.addRow(row);
  }
  return ws;
}

module.exports = {
  ExcelJS,
  decodeA1Ref,
  decodeA1Range,
  colIndexToLetters,
  colLettersToIndex0,
  cellValueToPrimitive,
  worksheetToAoa,
  inferSheetName,
  readWorkbookFromPath,
  readWorkbookFromBuffer,
  worksheetToCsv,
  addSheetFromAoa,
  serializeCellForJson,
};
