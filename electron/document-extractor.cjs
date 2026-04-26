/* eslint-disable no-console */
/**
 * Document Text Extraction Module - Main Process
 * Extracts plain text from document files for card preview snippets
 */

const fs = require('fs');
const path = require('path');

// Try to load mammoth (DOCX)
let mammoth = null;
try {
  mammoth = require('mammoth');
  console.log('[DocumentExtractor] mammoth module loaded successfully');
} catch (error) {
  console.warn('[DocumentExtractor] mammoth module not available, DOCX extraction disabled');
}

const { readWorkbookFromPath, worksheetToCsv } = require('./exceljs-helpers.cjs');

/**
 * Extract plain text from a DOCX file
 * @param {string} filePath - Path to the DOCX file
 * @param {number} maxChars - Maximum characters to extract
 * @returns {Promise<string|null>}
 */
async function extractDocxText(filePath, maxChars = 500) {
  if (!mammoth) {
    console.warn('[DocumentExtractor] mammoth not available, skipping DOCX extraction');
    return null;
  }

  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value.trim();
    return text ? text.substring(0, maxChars) : null;
  } catch (error) {
    console.error('[DocumentExtractor] Error extracting DOCX text:', error.message);
    return null;
  }
}

/** Default rows per sheet when extracting XLSX (configurable) */
const XLSX_SHEET_ROWS = 150;
/** Default max chars for XLSX extraction (for indexing/RAG) */
const XLSX_MAX_CHARS = 3000;

const ExcelJS = require('exceljs');

/**
 * Extract plain text from an XLSX file (ExcelJS; legacy .xls is not supported).
 * Iterates all sheets with [Sheet: Name] headers for context preservation.
 * @param {string} filePath
 * @param {number} maxChars
 * @returns {Promise<string|null>}
 */
async function extractXlsxText(filePath, maxChars = XLSX_MAX_CHARS) {
  const wb = new ExcelJS.Workbook();
  try {
    await readWorkbookFromPath(wb, filePath);
  } catch (error) {
    if (error && error.code === 'XLS_LEGACY') {
      console.warn('[DocumentExtractor] Legacy .xls is not supported; use .xlsx');
      return null;
    }
    console.error('[DocumentExtractor] Error reading spreadsheet:', error.message);
    return null;
  }

  try {
    if (wb.worksheets.length === 0) return null;

    const parts = [];
    let totalChars = 0;

    for (const sheet of wb.worksheets) {
      if (totalChars >= maxChars) break;
      const rawCsv = worksheetToCsv(sheet);
      const lines = rawCsv.split('\n');
      const limited = lines.slice(0, XLSX_SHEET_ROWS).join('\n');
      const csv = limited.trim();
      if (!csv) continue;

      const header = `[Sheet: ${sheet.name}]\n`;
      const block = header + csv;
      const remaining = maxChars - totalChars;
      const chunk = block.length > remaining ? block.substring(0, remaining) : block;
      parts.push(chunk);
      totalChars += chunk.length;
    }

    const text = parts.join('\n\n').trim();
    return text || null;
  } catch (error) {
    console.error('[DocumentExtractor] Error extracting XLSX text:', error.message);
    return null;
  }
}

/**
 * Extract plain text from a CSV file
 * @param {string} filePath - Path to the CSV file
 * @param {number} maxChars - Maximum characters to extract
 * @returns {string|null}
 */
function extractCsvText(filePath, maxChars = 500) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const text = content.trim();
    return text ? text.substring(0, maxChars) : null;
  } catch (error) {
    console.error('[DocumentExtractor] Error extracting CSV text:', error.message);
    return null;
  }
}

/**
 * Extract plain text from a text-based file (.txt, .md, .json, .rtf)
 * @param {string} filePath - Path to the file
 * @param {number} maxChars - Maximum characters to extract
 * @returns {string|null}
 */
function extractPlainText(filePath, maxChars = 500) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const text = content.trim();
    return text ? text.substring(0, maxChars) : null;
  } catch (error) {
    console.error('[DocumentExtractor] Error extracting plain text:', error.message);
    return null;
  }
}

/**
 * Extract text from any supported document file
 * @param {string} filePath - Path to the document file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string|null>} Extracted text or null
 */
async function extractDocumentText(filePath, mimeType) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('[DocumentExtractor] File not found:', filePath);
    return null;
  }

  const ext = path.extname(filePath).toLowerCase().replace('.', '');

  try {
    switch (ext) {
      case 'docx':
      case 'doc':
        return await extractDocxText(filePath);

      case 'xlsx':
      case 'xls':
        return await extractXlsxText(filePath);

      case 'csv':
        return extractCsvText(filePath);

      case 'txt':
      case 'md':
      case 'json':
      case 'rtf':
        return extractPlainText(filePath);

      default:
        console.log('[DocumentExtractor] Unsupported extension:', ext);
        return null;
    }
  } catch (error) {
    console.error('[DocumentExtractor] Extraction failed for', ext, ':', error.message);
    return null;
  }
}

// Lazy-load pdfjs-dist for PDF text extraction
let pdfjsLib = null;
let pdfjsLoadAttempted = false;

/**
 * Extract full text from a PDF file using pdfjs-dist
 * @param {string} filePath - Path to the PDF file
 * @param {number} maxChars - Maximum characters to extract (default 50000)
 * @returns {Promise<string|null>} Extracted text or null
 */
async function extractTextFromPDF(filePath, maxChars = 50000) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('[DocumentExtractor] PDF file not found:', filePath);
    return null;
  }

  if (!pdfjsLib && !pdfjsLoadAttempted) {
    pdfjsLoadAttempted = true;
    try {
      pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (error) {
      console.warn('[DocumentExtractor] pdfjs-dist not available, PDF extraction disabled:', error.message);
      return null;
    }
  }

  if (!pdfjsLib?.getDocument) return null;

  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const textParts = [];

    for (let i = 1; i <= numPages && textParts.join('').length < maxChars; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str || '').join(' ');
      textParts.push(pageText);
    }

    const fullText = textParts.join('\n\n').trim();
    return fullText ? fullText.substring(0, maxChars) : null;
  } catch (error) {
    console.error('[DocumentExtractor] Error extracting PDF text:', error.message);
    return null;
  }
}

const MAX_CHAT_ATTACH_CHARS = 80_000;

/**
 * Best-effort plain text for chat attachment (path on disk; same process as file picker / drag in Electron)
 */
async function extractChatAttachmentText(filePath, maxChars = MAX_CHAT_ATTACH_CHARS) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    return extractTextFromPDF(filePath, maxChars);
  }
  if (ext === '.docx' || ext === '.doc') {
    return extractDocxText(filePath, maxChars);
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return await extractXlsxText(filePath, maxChars);
  }
  if (ext === '.csv') {
    return extractCsvText(filePath, maxChars);
  }
  if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.rtf') {
    return extractPlainText(filePath, maxChars);
  }
  if (ext === '.pptx' || ext === '.ppt') {
    return `[PowerPoint: ${path.basename(filePath)} — import as resource in the library to extract text.]`;
  }
  return null;
}

module.exports = {
  extractDocumentText,
  extractDocxText,
  extractXlsxText,
  extractCsvText,
  extractPlainText,
  extractTextFromPDF,
  extractChatAttachmentText,
};
