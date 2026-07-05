
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCw, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type Resource } from '@/types';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';
import ZoomControls from './shared/ZoomControls';
import { useMountAction } from '@/lib/hooks/useMountAction';

interface ImageViewerProps {
  resource: Resource;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

function ImageViewerComponent({ resource }: ImageViewerProps) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const loadImage = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;

    try {
      setIsLoading(true);
      setError(null);

      if (resource.thumbnail_data) {
        setImageUrl(resource.thumbnail_data);
      }

      const result = await window.electron.resource.readFile(resource.id);

      if (result.success && result.data) {
        setImageUrl(result.data);
      } else {
        setError(result.error || 'Failed to load image');
      }
    } catch (err) {
      console.error('Error loading image:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [resource.id, resource.thumbnail_data]);

  const mountRef = useMountAction(loadImage);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, MIN_ZOOM));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Wheel: Ctrl/⌘ + wheel zooms (like maps/design tools), plain wheel pans.
  // Native listener because React registers `wheel` as passive (no preventDefault).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0022);
        setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor)));
      } else {
        setOffset((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag to pan.
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  }, [offset.x, offset.y]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      setOffset({ x: start.ox + (e.clientX - start.x), y: start.oy + (e.clientY - start.y) });
    };
    const onUp = () => {
      dragStartRef.current = null;
      setDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const handleDoubleClick = useCallback(() => {
    if (zoom !== 1 || offset.x !== 0 || offset.y !== 0) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setZoom(2);
    }
  }, [zoom, offset.x, offset.y]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
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
          handleResetView();
          break;
        case 'r':
          e.preventDefault();
          handleRotate();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleZoomIn, handleZoomOut, handleResetView, handleRotate]);

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <div ref={mountRef} className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <div className="flex items-center gap-2">
          <ZoomControls
            zoom={zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onReset={handleResetView}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
          />

          <div className="w-px h-5 mx-2" style={{ background: 'var(--border)' }} />

          <button
            type="button"
            onClick={handleRotate}
            className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{ color: 'var(--secondary-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Rotate 90° (R)"
            aria-label="Rotate image"
          >
            <RotateCw size={18} />
          </button>

          <button
            type="button"
            onClick={handleResetView}
            className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{ color: 'var(--secondary-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Reset view (0)"
            aria-label="Reset view"
          >
            <Maximize2 size={18} />
          </button>
        </div>

        {/* Keyboard/mouse hints */}
        <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
          {t('media.image_viewer_hints')}
        </span>
      </div>

      {/* Image Container — overflow hidden + drag-pan/zoom transform */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pan/zoom surface; keyboard equivalents are global (+/-/0/R) */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center p-4 select-none"
        style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {isLoading && !imageUrl ? (
          <LoadingState message="Loading image..." />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={resource.title}
            className={`max-w-full max-h-full object-contain ${dragging ? '' : 'transition-transform duration-150'}`}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        ) : null}
      </div>
    </div>
  );
}

export default React.memo(ImageViewerComponent);
