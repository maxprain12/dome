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

// Try to load xlsx (SheetJS)
let XLSX = null;
try {
  XLSX = require('xlsx');
  console.log('[DocumentExtractor] xlsx module loaded successfully');
} catch (error) {
  console.warn('[DocumentExtractor] xlsx module not available, XLSX extraction disabled');
}

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

/**
 * Extract plain text from an XLSX/XLS file
 * @param {string} filePath - Path to the spreadsheet file
 * @param {number} maxChars - Maximum characters to extract
 * @returns {string|null}
 */
function extractXlsxText(filePath, maxChars = 500) {
  if (!XLSX) {
    console.warn('[DocumentExtractor] xlsx not available, skipping XLSX extraction');
    return null;
  }

  try {
    const workbook = XLSX.readFile(filePath, { sheetRows: 20 });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return null;

    const firstSheet = workbook.Sheets[firstSheetName];
    const csv = XLSX.utils.sheet_to_csv(firstSheet);
    const text = csv.trim();
    return text ? text.substring(0, maxChars) : null;
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
        return extractXlsxText(filePath);

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

module.exports = {
  extractDocumentText,
  extractDocxText,
  extractXlsxText,
  extractCsvText,
  extractPlainText,
  extractTextFromPDF,
};
