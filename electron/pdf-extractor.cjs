/**
 * PDF Extractor Module
 * 
 * Provides extraction and summarization capabilities for PDF documents.
 * Uses pdfjs-dist for text extraction and integrates with AI for summarization.
 */

const fs = require('fs');
const path = require('path');

let pdfjsLib = null;
let pdfjsLoadAttempted = false;

/**
 * Load pdfjs-dist library
 */
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  
  if (!pdfjsLoadAttempted) {
    pdfjsLoadAttempted = true;
    try {
      pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (error) {
      console.warn('[PDF Extractor] pdfjs-dist not available:', error.message);
      return null;
    }
  }
  return pdfjsLib;
}

/**
 * Extract text content from a PDF file
 * @param {string} filePath - Path to PDF file
 * @param {object} options - Extraction options
 * @param {number} options.maxChars - Maximum characters to extract (default: 50000)
 * @param {number} options.pages - Specific pages to extract (e.g., "1-5" or "1,3,5")
 * @returns {Promise<{success: boolean, text?: string, pages?: number, error?: string}>}
 */
async function extractPdfText(filePath, options = {}) {
  const { maxChars = 50000, pages: pageSpec } = options;
  
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'PDF file not found' };
  }

  const pdfjs = await loadPdfJs();
  if (!pdfjs?.getDocument) {
    return { success: false, error: 'PDF library not available' };
  }

  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjs.getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    
    // Parse page specification
    let pagesToExtract = [];
    if (pageSpec) {
      const parts = pageSpec.split(',').map(p => {
        const range = p.trim().split('-');
        if (range.length === 2) {
          return { start: parseInt(range[0]), end: parseInt(range[1]) };
        }
        return { start: parseInt(p), end: parseInt(p) };
      });
      
      for (const part of parts) {
        for (let i = part.start; i <= part.end && i <= numPages; i++) {
          if (!pagesToExtract.includes(i)) {
            pagesToExtract.push(i);
          }
        }
      }
      pagesToExtract.sort((a, b) => a - b);
    } else {
      pagesToExtract = Array.from({ length: numPages }, (_, i) => i + 1);
    }

    const textParts = [];
    let totalChars = 0;

    for (const pageNum of pagesToExtract) {
      if (totalChars >= maxChars) break;
      
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str || '').join(' ');
      
      if (totalChars + pageText.length > maxChars) {
        const remaining = maxChars - totalChars;
        textParts.push(pageText.substring(0, remaining));
        totalChars += remaining;
        break;
      }
      
      textParts.push(pageText);
      totalChars += pageText.length;
    }

    return {
      success: true,
      text: textParts.join('\n\n').trim(),
      pages: pagesToExtract.length,
      totalPages: numPages,
    };
  } catch (error) {
    console.error('[PDF Extractor] Error extracting text:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get PDF metadata (title, author, page count, etc.)
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<{success: boolean, metadata?: object, error?: string}>}
 */
async function getPdfMetadata(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'PDF file not found' };
  }

  const pdfjs = await loadPdfJs();
  if (!pdfjs?.getDocument) {
    return { success: false, error: 'PDF library not available' };
  }

  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjs.getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const metadata = await pdfDoc.getMetadata();
    const info = metadata?.info || {};
    
    return {
      success: true,
      metadata: {
        title: info.Title || path.basename(filePath, '.pdf'),
        author: info.Author || 'Unknown',
        pageCount: pdfDoc.numPages,
        creator: info.Creator || '',
        producer: info.Producer || '',
        creationDate: info.CreationDate || '',
        modificationDate: info.ModDate || '',
      },
    };
  } catch (error) {
    console.error('[PDF Extractor] Error getting metadata:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Extract page structure/headings from PDF
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<{success: boolean, structure?: object[], error?: string}>}
 */
async function extractPdfStructure(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'PDF file not found' };
  }

  const pdfjs = await loadPdfJs();
  if (!pdfjs?.getDocument) {
    return { success: false, error: 'PDF library not available' };
  }

  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjs.getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    
    const structure = [];
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items;
      
      // Simple heuristic: detect potential headings based on font size
      let maxFontSize = 0;
      for (const item of items) {
        if (item.height > maxFontSize) {
          maxFontSize = item.height;
        }
      }
      
      // Get first few items as potential title/heading
      const headingItems = items
        .filter(item => item.height >= maxFontSize * 0.9)
        .slice(0, 5)
        .map(item => item.str)
        .join(' ')
        .trim();
      
      if (headingItems) {
        structure.push({
          page: i,
          heading: headingItems.substring(0, 200),
          fontSize: maxFontSize,
        });
      }
    }
    
    return {
      success: true,
      structure,
      totalPages: numPages,
    };
  } catch (error) {
    console.error('[PDF Extractor] Error extracting structure:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Generate a summary of PDF content using AI
 * This function extracts text and returns it in a format suitable for AI summarization
 * @param {string} filePath - Path to PDF file
 * @param {object} options - Options for extraction and summarization
 * @returns {Promise<{success: boolean, text?: string, summary?: string, metadata?: object, error?: string}>}
 */
async function summarizePdf(filePath, options = {}) {
  const { maxChars = 30000, prompt = 'Provide a concise summary of this document.' } = options;
  
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'PDF file not found' };
  }

  // Extract text from PDF
  const extractResult = await extractPdfText(filePath, { maxChars });
  if (!extractResult.success) {
    return { success: false, error: extractResult.error };
  }

  // Get metadata
  const metadataResult = await getPdfMetadata(filePath);
  
  return {
    success: true,
    text: extractResult.text,
    metadata: metadataResult.success ? metadataResult.metadata : null,
    totalPages: extractResult.totalPages,
    extractedPages: extractResult.pages,
    prompt,
    // The actual summary will be generated by the AI agent using this extracted text
    // This returns the extracted content so the AI can generate a summary
    readyForSummary: true,
  };
}

/**
 * Extract tables from PDF (basic implementation)
 * Looks for structured text that might be tables
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<{success: boolean, tables?: object[], error?: string}>}
 */
async function extractPdfTables(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'PDF file not found' };
  }

  const pdfjs = await loadPdfJs();
  if (!pdfjs?.getDocument) {
    return { success: false, error: 'PDF library not available' };
  }

  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjs.getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    
    const tables = [];
    
    // Simple table detection: look for multiple items on same line with similar spacing
    for (let i = 1; i <= Math.min(numPages, 20); i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items;
      
      // Group items by their Y position (same line)
      const lines = {};
      for (const item of items) {
        const y = Math.round(item.transform[5] * 10) / 10; // Round to 1 decimal
        if (!lines[y]) lines[y] = [];
        lines[y].push({
          text: item.str,
          x: item.transform[4],
        });
      }
      
      // Check each line for potential table rows
      const sortedY = Object.keys(lines).sort((a, b) => parseFloat(b) - parseFloat(a));
      let currentTable = null;
      let tableRows = [];
      
      for (const y of sortedY) {
        const lineItems = lines[y].sort((a, b) => a.x - b.x);
        const text = lineItems.map(item => item.text).join(' | ').trim();
        
        // Detect table-like patterns (multiple pipe-separated items or consistent spacing)
        if (text.includes(' | ') && text.split(' | ').length >= 2) {
          if (!currentTable) {
            currentTable = { page: i, rows: [] };
          }
          tableRows.push(text);
        } else if (currentTable && tableRows.length > 1) {
          currentTable.rows = tableRows;
          tables.push(currentTable);
          currentTable = null;
          tableRows = [];
        }
      }
      
      if (currentTable && tableRows.length > 1) {
        currentTable.rows = tableRows;
        tables.push(currentTable);
      }
    }
    
    return {
      success: true,
      tables,
      count: tables.length,
    };
  } catch (error) {
    console.error('[PDF Extractor] Error extracting tables:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get PDF file path from resource ID
 * @param {string} resourceId - Resource ID
 * @param {object} database - Database instance
 * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
 */
/**
 * Render one PDF page to a PNG data URL (main process; uses @napi-rs/canvas).
 * @param {string} filePath
 * @param {number} [pageNum]
 * @param {number} [scale]
 * @returns {Promise<{ success: boolean, dataUrl?: string, error?: string }>}
 */
async function renderPdfPagePngDataUrl(filePath, pageNum = 1, scale = 1.5) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'PDF file not found' };
  }

  const pdfjs = await loadPdfJs();
  if (!pdfjs?.getDocument) {
    return { success: false, error: 'PDF library not available' };
  }

  let createCanvas;
  try {
    createCanvas = require('@napi-rs/canvas').createCanvas;
  } catch (e) {
    return { success: false, error: 'Canvas not available: ' + (e?.message || e) };
  }

  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjs.getDocument({
      data,
      disableFontFace: true,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const p = Math.min(Math.max(1, pageNum), pdfDoc.numPages);
    const page = await pdfDoc.getPage(p);
    const viewport = page.getViewport({ scale });
    const w = Math.max(1, Math.floor(viewport.width));
    const h = Math.max(1, Math.floor(viewport.height));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    });
    await renderTask.promise;
    const buf = canvas.toBuffer('image/png');
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    return { success: true, dataUrl };
  } catch (error) {
    console.error('[PDF Extractor] render page PNG:', error.message);
    return { success: false, error: error.message };
  }
}

async function getPdfFilePathFromResource(resourceId, database) {
  try {
    const queries = database.getQueries();
    const resource = queries.getResourceById.get(resourceId);
    
    if (!resource) {
      return { success: false, error: 'Resource not found' };
    }

    if (resource.type !== 'pdf') {
      return { success: false, error: 'Resource is not a PDF' };
    }

    // Get file path from file_storage
    const fileStorage = require('./file-storage.cjs');
    const filePathResult = await fileStorage.getFilePath(resource.id);
    
    if (!filePathResult.success || !filePathResult.path) {
      return { success: false, error: 'PDF file not found in storage' };
    }

    return {
      success: true,
      filePath: filePathResult.path,
      title: resource.title,
    };
  } catch (error) {
    console.error('[PDF Extractor] Error getting PDF file path:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  extractPdfText,
  getPdfMetadata,
  extractPdfStructure,
  summarizePdf,
  extractPdfTables,
  getPdfFilePathFromResource,
  renderPdfPagePngDataUrl,
};
