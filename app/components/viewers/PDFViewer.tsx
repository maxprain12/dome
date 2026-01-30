'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2 } from 'lucide-react';
import type { Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';
import { loadPDFDocument, getPDFPage } from '@/lib/pdf/pdf-loader';
import type { PDFAnnotation, AnnotationType } from '@/lib/pdf/annotation-utils';
import { parseAnnotationFromDB, serializeAnnotationForDB } from '@/lib/pdf/annotation-utils';
import PDFPage from './pdf/PDFPage';
import AnnotationLayer from './pdf/AnnotationLayer';
import AnnotationToolbar from './pdf/AnnotationToolbar';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import LoadingState from '../workspace/shared/LoadingState';
import ErrorState from '../workspace/shared/ErrorState';
import ZoomControls from '../workspace/shared/ZoomControls';

interface PDFViewerProps {
  resource: Resource;
}

type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

function PDFViewerComponent({ resource }: PDFViewerProps) {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [annotations, setAnnotations] = useState<PDFAnnotation[]>([]);
  const [activeTool, setActiveTool] = useState<AnnotationType | null>(null);
  const [color, setColor] = useState('#ffeb3b');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const containerRef = useRef<HTMLDivElement>(null);

  const { annotations: dbAnnotations, addInteraction } = useInteractions(resource.id);

  // Load PDF document
  useEffect(() => {
    async function loadPDF() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        // Get the file path for external operations
        const pathResult = await window.electron.resource.getFilePath(resource.id);
        if (pathResult.success && pathResult.data) {
          setFilePath(pathResult.data);
        }

        // Read the file
        const result = await window.electron.resource.readFile(resource.id);

        if (result.success && result.data) {
          // Convert data URL to ArrayBuffer
          const response = await fetch(result.data);
          const arrayBuffer = await response.arrayBuffer();

          // Load PDF document
          const doc = await loadPDFDocument(arrayBuffer);
          setPdfDocument(doc);

          // Load all pages
          const numPages = doc.numPages;
          const pagePromises: Promise<PDFPageProxy>[] = [];
          for (let i = 1; i <= numPages; i++) {
            pagePromises.push(getPDFPage(doc, i));
          }
          const loadedPages = await Promise.all(pagePromises);
          setPages(loadedPages);
        } else {
          setError(result.error || 'Failed to load PDF');
        }
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    loadPDF();
  }, [resource.id]);

  // Parse annotations from database
  useEffect(() => {
    const parsedAnnotations: PDFAnnotation[] = [];
    dbAnnotations.forEach((interaction) => {
      const annotation = parseAnnotationFromDB(interaction);
      if (annotation) {
        parsedAnnotations.push(annotation);
      }
    });
    setAnnotations(parsedAnnotations);
  }, [dbAnnotations]);

  // Calculate zoom based on mode
  useEffect(() => {
    if (!containerRef.current || pages.length === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 32;

    if (zoomMode === 'fit-width' && pages[currentPage - 1]) {
      const page = pages[currentPage - 1]!;
      const viewport = page.getViewport({ scale: 1.0 });
      const calculatedZoom = containerWidth / viewport.width;
      setZoom(calculatedZoom);
    } else if (zoomMode === 'fit-page' && pages[currentPage - 1]) {
      const page = pages[currentPage - 1]!;
      const viewport = page.getViewport({ scale: 1.0 });
      const containerHeight = container.clientHeight - 100;
      const calculatedZoom = Math.min(
        (container.clientWidth - 32) / viewport.width,
        containerHeight / viewport.height
      );
      setZoom(calculatedZoom);
    }
  }, [zoomMode, currentPage, pages, containerRef]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'PageUp':
        case 'ArrowUp':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handlePreviousPage();
          }
          break;
        case 'PageDown':
        case 'ArrowDown':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleNextPage();
          }
          break;
        case 'Home':
          e.preventDefault();
          setCurrentPage(1);
          break;
        case 'End':
          e.preventDefault();
          if (pdfDocument) {
            setCurrentPage(pdfDocument.numPages);
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleResetZoom();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [pdfDocument, currentPage]);

  const handleZoomIn = useCallback(() => {
    setZoomMode('custom');
    setZoom((prev) => Math.min(prev * 1.25, 3.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomMode('custom');
    setZoom((prev) => Math.max(prev / 1.25, 0.5));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomMode('fit-width');
  }, []);

  const handleFitToPage = useCallback(() => {
    setZoomMode('fit-page');
  }, []);

  const handlePreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    if (pdfDocument) {
      setCurrentPage((prev) => Math.min(pdfDocument.numPages, prev + 1));
    }
  }, [pdfDocument]);

  const handleOpenExternal = useCallback(async () => {
    if (filePath && window.electron) {
      await window.electron.openPath(filePath);
    }
  }, [filePath]);

  const handleAnnotationCreate = useCallback(
    async (annotation: Omit<PDFAnnotation, 'id'>) => {
      const serialized = serializeAnnotationForDB(annotation as PDFAnnotation);
      const interaction = await addInteraction('annotation', serialized.content, serialized.position_data, serialized.metadata);

      // Index annotation in LanceDB if interaction was created successfully
      if (interaction && typeof window !== 'undefined' && window.electron) {
        try {
          const resourceResult = await window.electron.db.resources.getById(resource.id);
          const resourceData = resourceResult.success ? resourceResult.data : null;

          const textToIndex = annotation.type === 'highlight'
            ? (annotation.selectedText || '')
            : (annotation.content || '');

          if (textToIndex.trim()) {
            window.electron.vector.annotations.index({
              annotationId: interaction.id,
              resourceId: resource.id,
              text: textToIndex,
              metadata: {
                annotation_type: annotation.type,
                page_index: annotation.pageIndex,
                resource_type: 'pdf',
                title: resourceData?.title || resource.title,
                project_id: resourceData?.project_id || resource.project_id,
              },
            }).catch((error) => {
              console.error('Error indexing annotation:', error);
            });
          }
        } catch (error) {
          console.error('Error preparing annotation for indexing:', error);
        }
      }
    },
    [addInteraction, resource]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <ErrorState error={error} />
        {filePath && (
          <button
            onClick={handleOpenExternal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm mt-4 transition-all hover:brightness-110"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            <ExternalLink size={16} />
            Open in External Viewer
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Main Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <div className="flex items-center gap-2">
          {/* Page Navigation */}
          <button
            onClick={handlePreviousPage}
            disabled={currentPage <= 1}
            className="p-2 rounded-md transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{ color: 'var(--secondary-text)' }}
            onMouseEnter={(e) => {
              if (currentPage > 1) {
                e.currentTarget.style.background = 'var(--bg-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Previous page (Page Up)"
            aria-label="Previous page"
          >
            <ChevronLeft size={18} />
          </button>

          <span
            className="text-sm font-medium min-w-[100px] text-center"
            style={{ color: 'var(--primary-text)' }}
          >
            {pdfDocument ? `${currentPage} / ${pdfDocument.numPages}` : '0 / 0'}
          </span>

          <button
            onClick={handleNextPage}
            disabled={!pdfDocument || currentPage >= pdfDocument.numPages}
            className="p-2 rounded-md transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{ color: 'var(--secondary-text)' }}
            onMouseEnter={(e) => {
              if (pdfDocument && currentPage < pdfDocument.numPages) {
                e.currentTarget.style.background = 'var(--bg-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Next page (Page Down)"
            aria-label="Next page"
          >
            <ChevronRight size={18} />
          </button>

          <div className="w-px h-5 mx-2" style={{ background: 'var(--border)' }} />

          {/* Zoom Controls */}
          <ZoomControls
            zoom={zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onReset={handleResetZoom}
            minZoom={0.5}
            maxZoom={3.0}
          />

          <div className="w-px h-5 mx-2" style={{ background: 'var(--border)' }} />

          <button
            onClick={handleFitToPage}
            className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{ color: 'var(--secondary-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Fit to page"
            aria-label="Fit to page"
          >
            <Maximize2 size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenExternal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{ color: 'var(--secondary-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            aria-label="Open in external application"
            title="Open in external viewer"
          >
            <ExternalLink size={16} />
            Open
          </button>

          {/* Keyboard Shortcuts Hint */}
          <span className="text-xs ml-2" style={{ color: 'var(--tertiary-text)' }}>
            PgUp/PgDn: Navigate • +/-: Zoom • 0: Reset • Home/End: First/Last
          </span>
        </div>
      </div>

      {/* Annotation Toolbar */}
      <AnnotationToolbar
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        color={color}
        onColorChange={setColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
      />

      {/* PDF Container */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <LoadingState message="Loading PDF..." />
          </div>
        ) : pages.length > 0 && pages[currentPage - 1] ? (
          <div className="flex flex-col items-center p-4">
            <div className="relative">
              <PDFPage page={pages[currentPage - 1]!} scale={zoom} pageNumber={currentPage} />
              <AnnotationLayer
                page={pages[currentPage - 1]!}
                pageIndex={currentPage - 1}
                scale={zoom}
                annotations={annotations}
                activeTool={activeTool}
                color={color}
                strokeWidth={strokeWidth}
                onAnnotationCreate={handleAnnotationCreate}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default React.memo(PDFViewerComponent);
