/**
 * PDF.js Loader and Configuration
 * Handles PDF.js initialization and worker setup
 * Uses legacy build for Node.js/Electron compatibility
 */

// Import PDF.js - use standard import, worker will handle legacy mode
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  // Determine the correct worker path based on environment
  let workerPath: string;
  
  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && 'electron' in window;
  
  if (isElectron) {
    // In Electron, use absolute path from public folder
    // In dev: http://localhost:3000/pdf.worker.min.js
    // In prod: file:// path will be resolved by Electron
    workerPath = '/pdf.worker.min.js';
  } else {
    // In browser/Next.js, use public folder path
    workerPath = '/pdf.worker.min.js';
  }
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
  
  // Log in development for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('[PDF.js] Worker configured:', workerPath, 'Electron:', isElectron);
  }
}

export interface PDFDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPage>;
}

export interface PDFPage {
  viewport: PDFViewport;
  render: (options: PDFRenderOptions) => { promise: Promise<void> };
  getTextContent: () => Promise<PDFTextContent>;
}

export interface PDFViewport {
  width: number;
  height: number;
  scale: number;
  convertToViewportPoint: (x: number, y: number) => [number, number];
  convertToPdfPoint: (x: number, y: number) => [number, number];
}

export interface PDFRenderOptions {
  canvasContext: CanvasRenderingContext2D;
  viewport: PDFViewport;
}

export interface PDFTextContent {
  items: Array<{
    str: string;
    transform: number[];
    width: number;
    height: number;
  }>;
}

/**
 * Load PDF document from data URL or blob
 */
export async function loadPDFDocument(
  source: string | ArrayBuffer | Uint8Array
): Promise<pdfjsLib.PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data: source,
    useSystemFonts: true,
    verbosity: 0, // Suppress console warnings
  });

  return await loadingTask.promise;
}

/**
 * Get page from PDF document
 */
export async function getPDFPage(
  document: pdfjsLib.PDFDocumentProxy,
  pageNumber: number
): Promise<pdfjsLib.PDFPageProxy> {
  return await document.getPage(pageNumber);
}

/**
 * Render PDF page to canvas
 * Note: This function is deprecated in favor of direct rendering in PDFPage component
 * to avoid canvas reuse issues. Kept for backward compatibility.
 */
export async function renderPDFPage(
  page: pdfjsLib.PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number = 1.0
): Promise<void> {
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas context not available');
  }

  // Handle high DPI displays
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = viewport.width;
  const displayHeight = viewport.height;

  // Set canvas dimensions - always set to ensure clean state
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  
  // Clear and reset context
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(dpr, dpr);

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
}

/**
 * Get text content from PDF page
 */
export async function getPageTextContent(
  page: pdfjsLib.PDFPageProxy
) {
  return await page.getTextContent();
}

/**
 * Extract text from a rectangular region in PDF coordinates
 * Uses the transform matrix from PDF.js text items to determine position
 * 
 * Note: PDF.js text items use PDF coordinate system (origin bottom-left, Y up)
 * The pdfRect is also in PDF coordinates (from convertViewportRectToPDF)
 */
export function extractTextFromRegion(
  textContent: Awaited<ReturnType<typeof getPageTextContent>>,
  viewport: pdfjsLib.PageViewport,
  pdfRect: { x: number; y: number; width: number; height: number }
): string {
  const textItems: Array<{ str: string; y: number; x: number; width: number }> = [];
  const { items } = textContent;

  // PDF coordinate system: origin at bottom-left, Y increases upward
  // pdfRect.y is the bottom edge (min Y), pdfRect.y + pdfRect.height is the top edge (max Y)
  const rectBottomY = pdfRect.y;
  const rectTopY = pdfRect.y + pdfRect.height;
  const rectLeftX = pdfRect.x;
  const rectRightX = pdfRect.x + pdfRect.width;
  
  for (const item of items) {
    if (!('transform' in item) || !item.transform || !item.str || !item.str.trim()) continue;

    // Transform matrix: [a, b, c, d, e, f]
    // e = x translation, f = y translation (in PDF coordinates, bottom-left origin)
    const [a, b, c, d, e, f] = item.transform;
    
    // Get text item position and dimensions in PDF coordinates
    const itemX = e;
    const itemY = f; // Bottom edge of text item in PDF coordinates
    const itemWidth = item.width || 0;
    const itemHeight = item.height || 0;
    const itemTopY = itemY + itemHeight; // Top edge of text item

    // Check if text item intersects with rectangle
    // X intersection: item overlaps horizontally
    const intersectsX = itemX < rectRightX && itemX + itemWidth > rectLeftX;
    // Y intersection: item overlaps vertically (in PDF coords, higher Y = higher on page)
    const intersectsY = itemY < rectTopY && itemTopY > rectBottomY;

    if (intersectsX && intersectsY) {
      // Store in PDF coordinates for sorting
      textItems.push({
        str: item.str,
        y: itemY, // Bottom edge in PDF coordinates
        x: itemX,
        width: itemWidth,
      });
    }
  }

  // Sort by Y position (higher Y = higher on page = top to bottom visually) and X position (left to right)
  textItems.sort((a, b) => {
    const yDiff = b.y - a.y; // Higher Y first (top to bottom visually)
    if (Math.abs(yDiff) > 5) {
      return yDiff;
    }
    // Same line, sort by X (left to right)
    return a.x - b.x;
  });

  // Join text items, preserving line breaks and word spacing
  let result = '';
  let lastY = -Infinity;
  let lastXEnd = -Infinity;
  
  for (const item of textItems) {
    const isNewLine = Math.abs(item.y - lastY) > 5;
    const itemXEnd = item.x + item.width;
    const gap = item.x - lastXEnd;
    
    if (isNewLine) {
      // New line - add space before if not first item
      if (result) result += ' ';
      result += item.str;
    } else if (gap > 3) {
      // Significant gap between items - likely a space
      result += ' ' + item.str;
    } else {
      // Same word/line - check if we need a space
      const needsSpace = result && !result.endsWith(' ') && !item.str.startsWith(' ');
      result += (needsSpace ? ' ' : '') + item.str;
    }
    lastY = item.y;
    lastXEnd = itemXEnd;
  }

  return result.trim();
}

/**
 * Convert viewport coordinates to PDF coordinates
 */
export function viewportToPDF(
  viewport: pdfjsLib.PageViewport,
  x: number,
  y: number
): [number, number] {
  return viewport.convertToPdfPoint(x, y) as [number, number];
}

/**
 * Convert PDF coordinates to viewport coordinates
 */
export function pdfToViewport(
  viewport: pdfjsLib.PageViewport,
  x: number,
  y: number
): [number, number] {
  return viewport.convertToViewportPoint(x, y) as [number, number];
}
