/**
 * PDF Annotation Utilities
 * Helper functions for coordinate mapping, rendering, and annotation management
 */

import type { PageViewport } from 'pdfjs-dist';

export type AnnotationType = 'highlight' | 'note';

export interface PDFAnnotation {
  id: string;
  type: AnnotationType;
  pageIndex: number;
  // Coordenadas en espacio PDF (puntos, no pixels)
  coordinates: {
    x: number; // Coordenada X en puntos PDF
    y: number; // Coordenada Y en puntos PDF
    width?: number; // Ancho en puntos PDF
    height?: number; // Alto en puntos PDF
  };
  style: {
    color: string;
    opacity?: number;
    strokeWidth?: number;
  };
  content?: string; // Para notas
  selectedText?: string; // Para highlights - texto extraído del PDF
}

/**
 * Convert viewport coordinates to PDF coordinates
 */
export function convertViewportToPDF(
  viewport: PageViewport,
  viewportX: number,
  viewportY: number
): [number, number] {
  return viewport.convertToPdfPoint(viewportX, viewportY) as [number, number];
}

/**
 * Convert PDF coordinates to viewport coordinates
 */
export function convertPDFToViewport(
  viewport: PageViewport,
  pdfX: number,
  pdfY: number
): [number, number] {
  return viewport.convertToViewportPoint(pdfX, pdfY) as [number, number];
}

/**
 * Convert viewport rectangle to PDF rectangle
 */
export function convertViewportRectToPDF(
  viewport: PageViewport,
  viewportRect: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const [x1, y1] = viewport.convertToPdfPoint(viewportRect.x, viewportRect.y);
  const [x2, y2] = viewport.convertToPdfPoint(
    viewportRect.x + viewportRect.width,
    viewportRect.y + viewportRect.height
  );

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/**
 * Convert PDF rectangle to viewport rectangle
 */
export function convertPDFRectToViewport(
  viewport: PageViewport,
  pdfRect: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const [x1, y1] = viewport.convertToViewportPoint(pdfRect.x, pdfRect.y);
  const [x2, y2] = viewport.convertToViewportPoint(
    pdfRect.x + pdfRect.width,
    pdfRect.y + pdfRect.height
  );

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/**
 * Convert annotation from database format to PDFAnnotation
 */
export function parseAnnotationFromDB(
  interaction: any
): PDFAnnotation | null {
  try {
    const metadata = interaction.metadata || {};
    const positionData = interaction.position_data || {};

    if (metadata.type && ['highlight', 'note'].includes(metadata.type)) {
      return {
        id: interaction.id,
        type: metadata.type as AnnotationType,
        pageIndex: positionData.pageIndex ?? 0,
        coordinates: {
          x: positionData.x ?? 0,
          y: positionData.y ?? 0,
          width: positionData.width,
          height: positionData.height,
        },
        style: {
          color: metadata.color ?? '#ffeb3b',
          opacity: metadata.opacity ?? 0.3,
          strokeWidth: metadata.strokeWidth ?? 2,
        },
        content: interaction.content || undefined,
        selectedText: positionData.selectedText || undefined,
      };
    }
  } catch (error) {
    console.error('Error parsing annotation:', error);
  }
  return null;
}

/**
 * Convert PDFAnnotation to database format
 */
export function serializeAnnotationForDB(
  annotation: PDFAnnotation
): {
  position_data: Record<string, any>;
  metadata: Record<string, any>;
  content: string;
} {
  return {
    position_data: {
      pageIndex: annotation.pageIndex,
      x: annotation.coordinates.x,
      y: annotation.coordinates.y,
      width: annotation.coordinates.width,
      height: annotation.coordinates.height,
      selectedText: annotation.selectedText,
    },
    metadata: {
      type: annotation.type,
      color: annotation.style.color,
      opacity: annotation.style.opacity,
      strokeWidth: annotation.style.strokeWidth,
    },
    content: annotation.content || '',
  };
}

/**
 * Render annotation on canvas
 * Coordinates are in PDF space, need to convert to viewport for rendering
 */
export function renderAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: PDFAnnotation,
  viewport: PageViewport
): void {
  ctx.save();

  const { coordinates, style, type } = annotation;

  // Convert PDF coordinates to viewport coordinates
  const viewportRect = convertPDFRectToViewport(viewport, {
    x: coordinates.x,
    y: coordinates.y,
    width: coordinates.width ?? 0,
    height: coordinates.height ?? 0,
  });

  ctx.globalAlpha = style.opacity ?? 0.3;
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.strokeWidth ?? 2;

  switch (type) {
    case 'highlight':
      renderHighlight(ctx, viewportRect, style);
      break;
    case 'note':
      renderNote(ctx, { ...annotation, coordinates: viewportRect });
      break;
  }

  ctx.restore();
}

function renderHighlight(
  ctx: CanvasRenderingContext2D,
  viewportRect: { x: number; y: number; width: number; height: number },
  style: PDFAnnotation['style']
): void {
  if (viewportRect.width > 0 && viewportRect.height > 0) {
    ctx.globalAlpha = style.opacity ?? 0.3;
    ctx.fillStyle = style.color;
    ctx.fillRect(viewportRect.x, viewportRect.y, viewportRect.width, viewportRect.height);
  }
}


function renderNote(
  ctx: CanvasRenderingContext2D,
  annotation: PDFAnnotation & { coordinates: { x: number; y: number; width?: number; height?: number } }
): void {
  const { coordinates, style, content } = annotation;
  const noteWidth = 200;
  const noteHeight = 150;

  // Draw note background
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = style.color || '#ffeb3b';
  ctx.fillRect(coordinates.x, coordinates.y, noteWidth, noteHeight);

  // Draw note border
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fbc02d';
  ctx.lineWidth = 2;
  ctx.strokeRect(coordinates.x, coordinates.y, noteWidth, noteHeight);

  // Draw text if available
  if (content) {
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    const lines = content.split('\n');
    const lineHeight = 16;
    lines.slice(0, 8).forEach((line, i) => {
      ctx.fillText(line.substring(0, 25), coordinates.x + 8, coordinates.y + 20 + i * lineHeight);
    });
  }
}

/**
 * Check if point is inside annotation bounds
 */
export function isPointInAnnotation(
  x: number,
  y: number,
  annotation: PDFAnnotation,
  viewport: PageViewport
): boolean {
  const { coordinates } = annotation;

  // Convert PDF coordinates to viewport for hit testing
  const viewportRect = convertPDFRectToViewport(viewport, {
    x: coordinates.x,
    y: coordinates.y,
    width: coordinates.width ?? 0,
    height: coordinates.height ?? 0,
  });

  return (
    x >= viewportRect.x &&
    x <= viewportRect.x + viewportRect.width &&
    y >= viewportRect.y &&
    y <= viewportRect.y + viewportRect.height
  );
}
