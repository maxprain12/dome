/**
 * PDF.js Loader and Configuration
 * Handles PDF.js initialization and worker setup.
 * Uses legacy build for Electron compatibility (includes Uint8Array.prototype.toHex polyfill).
 */

// Legacy build: includes polyfill for toHex, required in Electron worker context
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Worker URL must match the installed pdfjs-dist version (avoids stale public/pdf.worker.min.mjs)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
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

export interface OutlineItem {
  title: string;
  pageNumber?: number;
  items?: OutlineItem[];
}

/**
 * Resolve page number from outline item dest.
 * Handles: string (named dest), array [ref, 'XYZ', ...], ref as object or integer.
 */
async function resolveDestPage(
  document: pdfjsLib.PDFDocumentProxy,
  dest: string | Array<unknown> | null
): Promise<number | undefined> {
  if (!dest) return undefined;
  try {
    let explicitDest: Array<unknown> | null;
    if (typeof dest === 'string') {
      explicitDest = await document.getDestination(dest);
    } else if (Array.isArray(dest)) {
      explicitDest = dest;
    } else {
      return undefined;
    }
    if (!explicitDest || explicitDest.length === 0) return undefined;

    const ref = explicitDest[0];
    if (ref != null && typeof ref === 'object') {
      const index = await document.getPageIndex(ref as Parameters<typeof document.getPageIndex>[0]);
      return index + 1; // 1-based
    }
    if (typeof ref === 'number' && Number.isInteger(ref)) {
      return ref + 1; // 0-based to 1-based
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract table of contents from PDF document.
 * Returns a tree of outline items with resolved page numbers.
 */
export async function getPDFOutline(
  document: pdfjsLib.PDFDocumentProxy
): Promise<OutlineItem[]> {
  try {
    const rawOutline = await document.getOutline();
    if (!rawOutline || rawOutline.length === 0) return [];

    async function processItem(item: (typeof rawOutline)[0]): Promise<OutlineItem> {
      let pageNumber: number | undefined;
      if (item.dest) {
        pageNumber = await resolveDestPage(document, item.dest);
      }

      const children: OutlineItem[] = [];
      if (item.items && item.items.length > 0) {
        for (const child of item.items) {
          children.push(await processItem(child));
        }
      }

      // If parent has no pageNumber, use first child's page for navigation
      if (pageNumber == null && children.length > 0) {
        pageNumber = children[0]?.pageNumber;
      }

      return {
        title: item.title || 'Untitled',
        pageNumber,
        items: children.length > 0 ? children : undefined,
      };
    }

    const result: OutlineItem[] = [];
    for (const item of rawOutline) {
      result.push(await processItem(item));
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Get text content from PDF page
 */
export async function getPageTextContent(
  page: pdfjsLib.PDFPageProxy
) {
  return await page.getTextContent();
}

const THUMBNAIL_MAX_SIZE = 400;

/**
 * Generate thumbnail (first page) from PDF data URL.
 * Uses browser canvas - no Node.js dependencies. Returns JPEG data URL.
 */
export async function generatePdfThumbnailFromData(pdfDataUrl: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const base64 = pdfDataUrl.includes(',') ? pdfDataUrl.split(',')[1] : pdfDataUrl;
    if (!base64) return null;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const pdfDoc = await loadPDFDocument(bytes);
    const page = await getPDFPage(pdfDoc, 1);
    const viewport = page.getViewport({ scale: 1 });

    const scale = Math.min(
      THUMBNAIL_MAX_SIZE / viewport.width,
      THUMBNAIL_MAX_SIZE / viewport.height
    );
    const scaledViewport = page.getViewport({ scale });
    const w = Math.floor(scaledViewport.width);
    const h = Math.floor(scaledViewport.height);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      pdfDoc.destroy();
      return null;
    }

    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      canvas,
    }).promise;

    pdfDoc.destroy();

    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    console.warn('[PDF] Thumbnail generation failed:', err);
    return null;
  }
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
