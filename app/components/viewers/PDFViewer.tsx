import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import IndexStatusBadge from './shared/IndexStatusBadge';
import type { Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';
import { loadPDFDocument, getPDFPage, getPDFOutline, type OutlineItem } from '@/lib/pdf/pdf-loader';
import type { PDFAnnotation, AnnotationType } from '@/lib/pdf/annotation-utils';
import { parseAnnotationFromDB, serializeAnnotationForDB } from '@/lib/pdf/annotation-utils';
import { usePDFViewerStore } from '@/lib/store/usePDFViewerStore';
import PDFPage from './pdf/PDFPage';
import AnnotationLayer from './pdf/AnnotationLayer';
import PDFPageInput from './pdf/PDFPageInput';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import PDFViewerSkeleton from './pdf/PDFViewerSkeleton';
import ErrorState from '@/components/ui/ErrorState';

interface PDFViewerProps {
  resource: Resource;
  initialPage?: number;
}

type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

function PDFViewerComponent({ resource, initialPage }: PDFViewerProps) {
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
  const [isOpeningExternal, setIsOpeningExternal] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const setPdfState = usePDFViewerStore((s) => s.setPdfState);

  const { annotations: dbAnnotations, addInteraction, updateInteraction, deleteInteraction } = useInteractions(resource.id);

  // Load PDF document
  useEffect(() => {
    async function loadPDF() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        // Get file path and read file in parallel (independent operations)
        const [pathResult, result] = await Promise.all([
          window.electron.resource.getFilePath(resource.id),
          window.electron.resource.readFile(resource.id),
        ]);

        if (pathResult.success && pathResult.data) {
          setFilePath(pathResult.data);
        }

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

          const toc = await getPDFOutline(doc);
          setOutline(toc);

          if (initialPage != null && initialPage >= 1 && initialPage <= numPages) {
            setCurrentPage(initialPage);
          } else if (initialPage != null && initialPage > numPages) {
            setCurrentPage(numPages);
          }
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
  }, [resource.id, initialPage]);

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

  // Calculate zoom based on mode; ResizeObserver for container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container || pages.length === 0) return;

    const recalculateZoom = () => {
      const containerWidth = container.clientWidth - 32;

      if (zoomMode === 'fit-width' && pages[currentPage - 1]) {
        const page = pages[currentPage - 1]!;
        const viewport = page.getViewport({ scale: 1.0 });
        setZoom(containerWidth / viewport.width);
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
    };

    recalculateZoom();

    const observer = new ResizeObserver(recalculateZoom);
    observer.observe(container);

    return () => observer.disconnect();
  }, [zoomMode, currentPage, pages]);

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
        case 'g':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            pageInputRef.current?.focus();
            pageInputRef.current?.select();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    pdfDocument,
    handlePreviousPage,
    handleNextPage,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
  ]);

  const handleOpenExternal = useCallback(async () => {
    if (filePath && window.electron) {
      setIsOpeningExternal(true);
      try {
        await window.electron.openPath(filePath);
      } finally {
        setIsOpeningExternal(false);
      }
    }
  }, [filePath]);

  const handleAnnotationCreate = useCallback(
    async (annotation: Omit<PDFAnnotation, 'id'>) => {
      const serialized = serializeAnnotationForDB(annotation as PDFAnnotation);
      const interaction = await addInteraction('annotation', serialized.content, serialized.position_data, serialized.metadata);

      // Index annotation in LanceDB if interaction was created successfully
      if (interaction && typeof window !== 'undefined' && window.electron) {
        // Annotations are stored in SQLite with FTS5 full-text search
        // No additional vector indexing needed
      }
    },
    [addInteraction, resource]
  );

  const handleAddNote = useCallback(
    async (pageIndex: number) => {
      const annotation: Omit<PDFAnnotation, 'id'> = {
        type: 'note',
        pageIndex,
        coordinates: { x: 0, y: 0, width: 0, height: 0 },
        style: { color },
        content: '',
      };
      await handleAnnotationCreate(annotation);
    },
    [handleAnnotationCreate, color]
  );

  const handleUpdateNote = useCallback(
    async (id: string, content: string) => {
      const ann = annotations.find((a) => a.id === id);
      if (!ann) return;
      const updated: PDFAnnotation = { ...ann, content };
      const serialized = serializeAnnotationForDB(updated);
      await updateInteraction(id, serialized.content, serialized.position_data, serialized.metadata);
    },
    [annotations, updateInteraction]
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      await deleteInteraction(id);
    },
    [deleteInteraction]
  );

  // Register PDF state for workspace side panel (PDF tab)
  useEffect(() => {
    if (!isLoading && pages.length > 0 && pdfDocument) {
      setPdfState({
        currentPage,
        totalPages: pdfDocument.numPages,
        outline,
        pages,
        annotations,
        zoom,
        activeTool,
        color,
        onPageChange: setCurrentPage,
        onZoomIn: handleZoomIn,
        onZoomOut: handleZoomOut,
        onResetZoom: handleResetZoom,
        onAddNote: handleAddNote,
        onUpdateNote: handleUpdateNote,
        onDeleteNote: handleDeleteNote,
        onToolSelect: setActiveTool,
        onColorChange: setColor,
      });
    }
    return () => setPdfState(null);
  }, [
    isLoading,
    pages,
    pdfDocument,
    currentPage,
    outline,
    annotations,
    zoom,
    activeTool,
    color,
    setPdfState,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,
  ]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <ErrorState error={error} />
        {filePath && (
          <button
            onClick={handleOpenExternal}
            disabled={isOpeningExternal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm mt-4 transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[44px]"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            <ExternalLink size={16} />
            {isOpeningExternal ? 'Opening...' : 'Open in External Viewer'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Minimal toolbar: page nav + open */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={handlePreviousPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded disabled:opacity-40"
            style={{ color: 'var(--secondary-text)' }}
            title="Página anterior"
            aria-label="Página anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <PDFPageInput
            currentPage={currentPage}
            totalPages={pdfDocument?.numPages ?? 0}
            onPageChange={setCurrentPage}
            inputRef={pageInputRef}
          />
          <button
            onClick={handleNextPage}
            disabled={!pdfDocument || currentPage >= pdfDocument.numPages}
            className="p-1.5 rounded disabled:opacity-40"
            style={{ color: 'var(--secondary-text)' }}
            title="Página siguiente"
            aria-label="Página siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <IndexStatusBadge resourceId={resource.id} resourceType="pdf" />
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded text-sm"
            style={{ color: 'var(--secondary-text)' }}
            aria-label="Abrir externo"
            title="Abrir en visor externo"
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {isLoading ? (
          <PDFViewerSkeleton />
        ) : pages.length > 0 && pages[currentPage - 1] != null ? (
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
