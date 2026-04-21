import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, MessageSquareText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/types';
import { useInteractions } from '@/lib/hooks/useInteractions';
import { loadPDFDocument, getPDFPage, getPDFOutline, type OutlineItem } from '@/lib/pdf/pdf-loader';
import type { PDFAnnotation, AnnotationType } from '@/lib/pdf/annotation-utils';
import { parseAnnotationFromDB, serializeAnnotationForDB } from '@/lib/pdf/annotation-utils';
import { usePDFViewerStore } from '@/lib/store/usePDFViewerStore';
import { useManyStore } from '@/lib/store/useManyStore';
import { showToast } from '@/lib/store/useToastStore';
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
  const { t } = useTranslation();
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
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const setPdfState = usePDFViewerStore((s) => s.setPdfState);

  const [pdfRegionMode, setPdfRegionMode] = useState(false);
  const [pdfRegionSelect, setPdfRegionSelect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const pdfRegionDragRef = useRef<{ sx: number; sy: number; active: boolean } | null>(null);
  const pdfRegionSelectRef = useRef(pdfRegionSelect);
  pdfRegionSelectRef.current = pdfRegionSelect;
  
  // Track if initial page has been set to avoid reloads
  const initialPageSetRef = useRef(false);

  const { annotations: dbAnnotations, addInteraction, updateInteraction, deleteInteraction } = useInteractions(resource.id);

  // Load PDF document - only reloads when resource.id changes, not when initialPage changes
  useEffect(() => {
    async function loadPDF() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        // Reset initial page tracking when resource changes
        initialPageSetRef.current = false;

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

          // Set initial page only once when PDF first loads
          if (!initialPageSetRef.current) {
            if (initialPage != null && initialPage >= 1 && initialPage <= numPages) {
              setCurrentPage(initialPage);
            } else if (initialPage != null && initialPage > numPages) {
              setCurrentPage(numPages);
            }
            initialPageSetRef.current = true;
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
  }, [resource.id]); // Only reload when resource ID changes

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

  const cropCanvasRegion = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      const canvas = pageCanvasRef.current;
      if (!canvas || rect.w < 4 || rect.h < 4) return null;
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      const scaleX = canvas.width / cw;
      const scaleY = canvas.height / ch;
      const sx = Math.max(0, Math.floor(rect.x * scaleX));
      const sy = Math.max(0, Math.floor(rect.y * scaleY));
      const sw = Math.min(canvas.width - sx, Math.ceil(rect.w * scaleX));
      const sh = Math.min(canvas.height - sy, Math.ceil(rect.h * scaleY));
      if (sw < 2 || sh < 2) return null;
      const tmp = document.createElement('canvas');
      tmp.width = sw;
      tmp.height = sh;
      const ctx = tmp.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      return tmp.toDataURL('image/png');
    },
    [],
  );

  const finishPdfRegion = useCallback(
    (rect: { x: number; y: number; w: number; h: number } | null) => {
      if (!rect || rect.w < 8 || rect.h < 8) return;
      const url = cropCanvasRegion(rect);
      if (!url) {
        showToast('warning', t('viewer.pdf_region_too_small'));
        return;
      }
      const { setPendingPdfRegion, setContext, setOpen } = useManyStore.getState();
      setPendingPdfRegion({
        imageDataUrl: url,
        resourceId: resource.id,
        page: currentPage,
        resourceTitle: resource.title ?? 'PDF',
      });
      setContext(resource.id, resource.title ?? null);
      setOpen(true);
      setPdfRegionMode(false);
      setPdfRegionSelect(null);
    },
    [cropCanvasRegion, resource.id, resource.title, currentPage, t],
  );

  const handleAnnotationCreate = useCallback(
    async (annotation: Omit<PDFAnnotation, 'id'>) => {
      const serialized = serializeAnnotationForDB(annotation as PDFAnnotation);
      const interaction = await addInteraction('annotation', serialized.content, serialized.position_data, serialized.metadata);

      if (interaction && typeof window !== 'undefined' && window.electron) {
        // Annotations are stored in SQLite with FTS5 full-text search
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
              color: 'var(--base-text)',
            }}
          >
            <ExternalLink size={16} />
            {isOpeningExternal ? t('viewer.opening') : t('viewer.open_external_viewer')}
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
            title={t('viewer.previous_page')}
            aria-label={t('viewer.previous_page')}
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
            title={t('viewer.next_page')}
            aria-label={t('viewer.next_page')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {typeof window !== 'undefined' && window.electron?.db?.cloudLlm && (
            <button
              type="button"
              onClick={() => {
                setPdfRegionMode((m) => !m);
                setPdfRegionSelect(null);
                pdfRegionDragRef.current = null;
              }}
              className="p-1.5 rounded text-sm flex items-center gap-1"
              style={{
                color: pdfRegionMode ? 'var(--accent)' : 'var(--secondary-text)',
                background: pdfRegionMode ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
              }}
              aria-pressed={pdfRegionMode}
              aria-label={t('viewer.pdf_region_toggle')}
              title={t('viewer.pdf_region_hint')}
            >
              <MessageSquareText size={16} />
            </button>
          )}
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded text-sm"
            style={{ color: 'var(--secondary-text)' }}
            aria-label={t('viewer.open_external')}
            title={t('viewer.open_external')}
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
            <div className="relative inline-block">
              <PDFPage
                ref={pageCanvasRef}
                page={pages[currentPage - 1]!}
                scale={zoom}
                pageNumber={currentPage}
              />
              <div className={pdfRegionMode ? 'pointer-events-none' : ''}>
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
              {pdfRegionMode && (
                <div
                  className="absolute inset-0 z-20 cursor-crosshair"
                  style={{ touchAction: 'none' }}
                  onMouseDown={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const sx = e.clientX - r.left;
                    const sy = e.clientY - r.top;
                    pdfRegionDragRef.current = { sx, sy, active: true };
                    setPdfRegionSelect({ x: sx, y: sy, w: 0, h: 0 });
                  }}
                  onMouseMove={(e) => {
                    const d = pdfRegionDragRef.current;
                    if (!d?.active) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const cx = e.clientX - r.left;
                    const cy = e.clientY - r.top;
                    const x = Math.min(d.sx, cx);
                    const y = Math.min(d.sy, cy);
                    const w = Math.abs(cx - d.sx);
                    const h = Math.abs(cy - d.sy);
                    setPdfRegionSelect({ x, y, w, h });
                  }}
                  onMouseUp={() => {
                    const had = pdfRegionDragRef.current;
                    if (had) had.active = false;
                    const cur = pdfRegionSelectRef.current;
                    if (cur && cur.w >= 8 && cur.h >= 8 && had) {
                      finishPdfRegion(cur);
                    }
                  }}
                  onMouseLeave={() => {
                    const had = pdfRegionDragRef.current;
                    if (had) had.active = false;
                  }}
                >
                  {pdfRegionSelect && pdfRegionSelect.w > 2 && pdfRegionSelect.h > 2 && (
                    <div
                      className="absolute border-2 pointer-events-none"
                      style={{
                        left: pdfRegionSelect.x,
                        top: pdfRegionSelect.y,
                        width: pdfRegionSelect.w,
                        height: pdfRegionSelect.h,
                        borderColor: 'var(--dome-accent, var(--accent))',
                        background: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 14%, transparent)',
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default React.memo(PDFViewerComponent);
