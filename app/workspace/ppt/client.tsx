'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { startTransition } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import SidePanel from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import GraphPanel from '@/components/workspace/GraphPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import PptViewer from '@/components/viewers/PptViewer';
import SlideThumbnailStrip from '@/workspace/ppt/SlideThumbnailStrip';
import { useAppStore } from '@/lib/store/useAppStore';
import { type Resource } from '@/types';

interface PptWorkspaceClientProps {
  resourceId: string;
}

export default function PptWorkspaceClient({ resourceId }: PptWorkspaceClientProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [slideCount, setSlideCount] = useState(0);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [thumbStripCollapsed, setThumbStripCollapsed] = useState(false);
  const [thumbnails, setThumbnails] = useState<HTMLElement[]>([]);

  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);

  const slidesContainerRef = useRef<HTMLDivElement>(null);

  // --- Slide event handlers ---

  const handleSlidesLoaded = useCallback((count: number) => {
    setSlideCount(count);
    setActiveSlideIndex(0);
  }, []);

  const handleThumbnailsReady = useCallback((elements: HTMLElement[]) => {
    setThumbnails(elements);
  }, []);

  const handleSelectSlide = useCallback((index: number) => {
    startTransition(() => setActiveSlideIndex(index));
  }, []);

  const handlePrevSlide = useCallback(() => {
    setActiveSlideIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextSlide = useCallback(() => {
    setActiveSlideIndex((prev) => Math.min(slideCount - 1, prev + 1));
  }, [slideCount]);

  // --- Resource loading ---

  useEffect(() => {
    async function loadResource() {
      if (!window.electron?.db?.resources) {
        setError('Database not available');
        setLoading(false);
        return;
      }
      try {
        const result = await window.electron.db.resources.getById(resourceId);
        if (!result?.success || !result.data) {
          setError('Presentation not found');
          setLoading(false);
          return;
        }
        setResource(result.data);
      } catch (err) {
        console.error('Error loading presentation:', err);
        setError('Failed to load presentation');
      } finally {
        setLoading(false);
      }
    }
    loadResource();
  }, [resourceId]);

  useEffect(() => {
    if (resourceId) {
      useAppStore.getState().setSelectedSourceIds([resourceId]);
    }
  }, [resourceId]);

  useEffect(() => {
    if (!resourceId || typeof window === 'undefined' || !window.electron) return;
    const unsubscribe = window.electron.on(
      'resource:updated',
      (payload: { id?: string; updates?: Partial<Resource> }) => {
        if (payload?.id !== resourceId || !resource) return;
        setResource((prev) => (prev ? { ...prev, ...payload.updates } : prev));
      }
    );
    return unsubscribe;
  }, [resourceId, resource]);

  // --- Keyboard navigation ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (slideCount === 0) return;
      const active = document.activeElement;
      const isInput =
        active?.tagName === 'INPUT' ||
        active?.tagName === 'TEXTAREA' ||
        (active as HTMLElement)?.isContentEditable;
      if (isInput) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevSlide(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleNextSlide(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideCount, handlePrevSlide, handleNextSlide]);

  // --- Presentation mode ---

  const handlePresentationMode = useCallback(async () => {
    const el = slidesContainerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch (err) {
      console.error('Fullscreen failed:', err);
    }
  }, []);

  // --- Export ---

  const handleExportPpt = useCallback(async () => {
    if (!resource || !window.electron?.resource?.export) return;
    try {
      const filePath = await window.electron.showSaveDialog({
        defaultPath:
          (resource.title || 'Presentation')
            .replace(/[<>:"/\\|?*]/g, '_')
            .substring(0, 80) + '.pptx',
        filters: [{ name: 'PowerPoint', extensions: ['pptx'] }],
      });
      if (filePath) {
        const result = await window.electron.resource.export(resourceId, filePath);
        if (result?.success && result?.data && window.electron?.openPath) {
          await window.electron.openPath(result.data);
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [resourceId, resource]);

  // --- Metadata save ---

  const handleSaveMetadata = useCallback(
    async (updates: Partial<Resource>): Promise<boolean> => {
      if (!resource || typeof window === 'undefined' || !window.electron) return false;
      try {
        const updatedResource = { ...resource, ...updates, updated_at: Date.now() };
        const result = await window.electron.db.resources.update(updatedResource);
        if (result.success) { setResource(updatedResource); return true; }
        return false;
      } catch (err) {
        console.error('Error saving metadata:', err);
        return false;
      }
    },
    [resource]
  );

  // --- Loading / error states ---

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111118' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading presentation...</div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--error)' }}>{error || 'Presentation not found'}</div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{
        position: 'fixed',
        top: 'var(--app-header-total)',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={isPanelOpen}
        onToggleSidePanel={() => setIsPanelOpen(!isPanelOpen)}
        onShowMetadata={() => setShowMetadata(true)}
        subtitle={slideCount > 0 ? `(${slideCount} diapositivas)` : undefined}
        onExportDocx={handleExportPpt}
        onPresentationMode={handlePresentationMode}
      />

      <div className="flex-1 flex relative min-h-0" style={{ overflow: 'clip' }}>
        {sourcesPanelOpen && resource && (
          <SourcesPanel resourceId={resourceId} projectId={resource.project_id} />
        )}

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Main presentation area — no scroll */}
          <div
            ref={slidesContainerRef}
            className="flex-1 flex min-h-0 slides-presentation-container"
            style={{ overflow: 'hidden', background: '#111118' }}
          >
            {/* Thumbnail strip */}
            {slideCount > 0 && (
              <SlideThumbnailStrip
                slideCount={slideCount}
                activeIndex={activeSlideIndex}
                onSelect={handleSelectSlide}
                thumbnailElements={thumbnails}
                collapsed={thumbStripCollapsed}
                onToggleCollapsed={() => setThumbStripCollapsed((c) => !c)}
              />
            )}

            {/* Slide viewer + nav pill */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
              <div className="flex-1 min-h-0 relative">
                <PptViewer
                  resource={resource}
                  activeIndex={activeSlideIndex}
                  onSlidesLoaded={handleSlidesLoaded}
                  onThumbnailsReady={handleThumbnailsReady}
                />

                {/* Navigation pill */}
                {slideCount > 0 && (
                  <div
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 shrink-0 z-10"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 999,
                      padding: '8px 18px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={handlePrevSlide}
                      disabled={activeSlideIndex <= 0}
                      className="flex items-center justify-center w-7 h-7 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
                      style={{ color: 'rgba(255,255,255,0.85)' }}
                      aria-label="Diapositiva anterior"
                    >
                      <ChevronLeft size={17} />
                    </button>

                    <span
                      className="text-sm font-medium tabular-nums min-w-[3.5rem] text-center"
                      style={{ color: 'rgba(255,255,255,0.65)' }}
                    >
                      {activeSlideIndex + 1} / {slideCount}
                    </span>

                    <button
                      type="button"
                      onClick={handleNextSlide}
                      disabled={activeSlideIndex >= slideCount - 1}
                      className="flex items-center justify-center w-7 h-7 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
                      style={{ color: 'rgba(255,255,255,0.85)' }}
                      aria-label="Diapositiva siguiente"
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeStudioOutput && (
            <StudioOutputViewer
              output={activeStudioOutput}
              onClose={() => useAppStore.getState().setActiveStudioOutput(null)}
            />
          )}
        </div>

        <SidePanel
          resourceId={resourceId}
          resource={resource}
          isOpen={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
        />

        {studioPanelOpen && resource && (
          <StudioPanel projectId={resource.project_id} resourceId={resource.id} />
        )}
        {graphPanelOpen && resource && <GraphPanel resource={resource} />}
      </div>

      <MetadataModal
        resource={resource}
        isOpen={showMetadata}
        onClose={() => setShowMetadata(false)}
        onSave={handleSaveMetadata}
      />
    </div>
  );
}
