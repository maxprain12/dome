'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { PDFAnnotation, AnnotationType } from '@/lib/pdf/annotation-utils';
import { 
  renderAnnotation, 
  isPointInAnnotation,
  convertViewportRectToPDF,
  convertPDFRectToViewport
} from '@/lib/pdf/annotation-utils';
import { getPageTextContent, extractTextFromRegion } from '@/lib/pdf/pdf-loader';

interface AnnotationLayerProps {
  page: PDFPageProxy;
  pageIndex: number;
  scale: number;
  annotations: PDFAnnotation[];
  activeTool: AnnotationType | null;
  color: string;
  strokeWidth: number;
  onAnnotationCreate: (annotation: Omit<PDFAnnotation, 'id'>) => void;
  onAnnotationSelect?: (annotation: PDFAnnotation | null) => void;
}

export default function AnnotationLayer({
  page,
  pageIndex,
  scale,
  annotations,
  activeTool,
  color,
  strokeWidth,
  onAnnotationCreate,
  onAnnotationSelect,
}: AnnotationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<PDFAnnotation | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [inputPosition, setInputPosition] = useState<{ x: number; y: number } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Filter annotations for this page
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;

    const viewport = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    renderAllAnnotations(ctx, viewport.width, viewport.height);
  }, [page, scale, pageAnnotations, selectedAnnotation]);

  const renderAllAnnotations = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.clearRect(0, 0, width, height);

      const viewport = page.getViewport({ scale });

      // Render existing annotations
      pageAnnotations.forEach((annotation) => {
        if (annotation.id !== selectedAnnotation?.id) {
          renderAnnotation(ctx, annotation, viewport);
        }
      });

      // Render selected annotation on top (with highlight)
      if (selectedAnnotation) {
        renderAnnotation(ctx, selectedAnnotation, viewport);
        // Draw selection border
        const { coordinates } = selectedAnnotation;
        if (coordinates.width && coordinates.height) {
          const viewportRect = convertPDFRectToViewport(viewport, {
            x: coordinates.x,
            y: coordinates.y,
            width: coordinates.width,
            height: coordinates.height,
          });
          ctx.strokeStyle = '#2196f3';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(
            viewportRect.x - 2,
            viewportRect.y - 2,
            viewportRect.width + 4,
            viewportRect.height + 4
          );
          ctx.setLineDash([]);
        }
      }

      // Render current highlight being drawn
      if (isDrawing && startPoint && currentPoint && activeTool === 'highlight') {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.min(startPoint.x, currentPoint.x),
          Math.min(startPoint.y, currentPoint.y),
          Math.abs(currentPoint.x - startPoint.x),
          Math.abs(currentPoint.y - startPoint.y)
        );
        ctx.globalAlpha = 1;
      }
    },
    [pageAnnotations, selectedAnnotation, isDrawing, startPoint, currentPoint, activeTool, color, page, scale]
  );

  const getCanvasCoordinates = useCallback(
    (event: MouseEvent | React.MouseEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      return { x, y };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!activeTool) {
        // Check if clicking on existing annotation
        const coords = getCanvasCoordinates(e);
        if (!coords) return;

        const viewport = page.getViewport({ scale });
        const clickedAnnotation = pageAnnotations.find((ann) =>
          isPointInAnnotation(coords.x, coords.y, ann, viewport)
        );

        if (clickedAnnotation) {
          setSelectedAnnotation(clickedAnnotation);
          onAnnotationSelect?.(clickedAnnotation);
        } else {
          setSelectedAnnotation(null);
          onAnnotationSelect?.(null);
        }
        return;
      }

      const coords = getCanvasCoordinates(e);
      if (!coords) return;

      if (activeTool === 'highlight') {
        setIsDrawing(true);
        setStartPoint(coords);
      } else if (activeTool === 'note') {
        // Show note input at click position
        setInputPosition(coords);
        setInputValue('');
        setShowNoteInput(true);
      }
    },
    [activeTool, getCanvasCoordinates, pageAnnotations, onAnnotationSelect, page, scale]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const coords = getCanvasCoordinates(e);
      if (!coords) return;

      setCurrentPoint(coords);

      if (!isDrawing || !activeTool || activeTool !== 'highlight') return;

      // Redraw canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const viewport = page.getViewport({ scale });
      renderAllAnnotations(ctx, viewport.width, viewport.height);
    },
    [isDrawing, activeTool, getCanvasCoordinates, page, scale, renderAllAnnotations]
  );

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      const coords = getCanvasCoordinates(e);
      
      if (!isDrawing || !activeTool || !startPoint || activeTool !== 'highlight') {
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPoint(null);
        return;
      }

      if (!coords) {
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPoint(null);
        return;
      }

      // Create highlight annotation
      const viewport = page.getViewport({ scale });
      const viewportWidth = Math.abs(coords.x - startPoint.x);
      const viewportHeight = Math.abs(coords.y - startPoint.y);
      
      if (viewportWidth > 5 && viewportHeight > 5) {
        // Convert viewport coordinates to PDF coordinates
        const viewportRect = {
          x: Math.min(startPoint.x, coords.x),
          y: Math.min(startPoint.y, coords.y),
          width: viewportWidth,
          height: viewportHeight,
        };
        
        const pdfRect = convertViewportRectToPDF(viewport, viewportRect);

        // Extract text from the selected region
        let selectedText = '';
        try {
          const textContent = await getPageTextContent(page);
          selectedText = extractTextFromRegion(textContent, viewport, pdfRect);
        } catch (error) {
          console.error('Error extracting text from PDF:', error);
        }

        const annotation: Omit<PDFAnnotation, 'id'> = {
          type: 'highlight',
          pageIndex,
          coordinates: {
            x: pdfRect.x,
            y: pdfRect.y,
            width: pdfRect.width,
            height: pdfRect.height,
          },
          style: {
            color,
            opacity: 0.3,
          },
          selectedText: selectedText || undefined,
        };

        onAnnotationCreate(annotation);
      }

      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
    },
    [
      isDrawing,
      activeTool,
      startPoint,
      pageIndex,
      color,
      onAnnotationCreate,
      getCanvasCoordinates,
      page,
      scale,
    ]
  );


  // Handle note input submission
  const handleNoteSubmit = useCallback(() => {
    if (!inputValue.trim() || !inputPosition) {
      setShowNoteInput(false);
      setInputPosition(null);
      setInputValue('');
      return;
    }

    // Convert viewport coordinates to PDF coordinates
    const viewport = page.getViewport({ scale });
    const [pdfX, pdfY] = viewport.convertToPdfPoint(inputPosition.x, inputPosition.y);

    const annotation: Omit<PDFAnnotation, 'id'> = {
      type: 'note',
      pageIndex,
      coordinates: {
        x: pdfX,
        y: pdfY,
        width: 200, // Fixed size in PDF points
        height: 150,
      },
      style: {
        color,
      },
      content: inputValue.trim(),
    };

    onAnnotationCreate(annotation);
    setShowNoteInput(false);
    setInputPosition(null);
    setInputValue('');
  }, [inputValue, inputPosition, pageIndex, color, onAnnotationCreate, page, scale]);

  // Focus input when it appears
  useEffect(() => {
    if (showNoteInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNoteInput]);

  const viewport = page.getViewport({ scale });

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          width: `${viewport.width}px`,
          height: `${viewport.height}px`,
          pointerEvents: activeTool ? 'auto' : 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ pointerEvents: 'auto', cursor: activeTool ? 'crosshair' : 'default' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsDrawing(false);
          setStartPoint(null);
          setCurrentPoint(null);
        }}
        />
      </div>

      {/* Note Input Modal */}
      {showNoteInput && inputPosition && (
        <div
          className="absolute z-50 pointer-events-auto"
          style={{
            left: `${inputPosition.x}px`,
            top: `${inputPosition.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="flex flex-col gap-2 p-2 rounded shadow-lg"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              minWidth: '250px',
              minHeight: '150px',
            }}
          >
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowNoteInput(false);
                  setInputPosition(null);
                  setInputValue('');
                }
              }}
              placeholder="Enter note text..."
              className="px-2 py-1 text-sm rounded resize-none"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--primary)',
                minHeight: '100px',
              }}
              rows={4}
            />
            <div className="flex gap-2">
              <button
                onClick={handleNoteSubmit}
                className="px-3 py-1 text-xs rounded"
                style={{
                  background: 'var(--brand-primary)',
                  color: 'white',
                }}
              >
                Add Note
              </button>
              <button
                onClick={() => {
                  setShowNoteInput(false);
                  setInputPosition(null);
                  setInputValue('');
                }}
                className="px-3 py-1 text-xs rounded"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--secondary)',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
