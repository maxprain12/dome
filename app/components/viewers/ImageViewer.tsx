'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ZoomIn, ZoomOut, RotateCw, Maximize2, AlertCircle } from 'lucide-react';
import { type Resource } from '@/types';

interface ImageViewerProps {
  resource: Resource;
}

export default function ImageViewer({ resource }: ImageViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    async function loadImage() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        // First try thumbnail_data for quick preview
        if (resource.thumbnail_data) {
          setImageUrl(resource.thumbnail_data);
        }

        // Then load full image
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
    }

    loadImage();
  }, [resource.id, resource.thumbnail_data]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-center gap-2 px-4 py-2 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <button
          onClick={handleZoomOut}
          disabled={zoom <= 0.25}
          className="p-2 rounded-md transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
          style={{ color: 'var(--secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          title="Zoom out"
          aria-label="Alejar"
        >
          <ZoomOut size={18} />
        </button>

        <span
          className="text-sm font-medium min-w-[60px] text-center"
          style={{ color: 'var(--primary)' }}
        >
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={handleZoomIn}
          disabled={zoom >= 4}
          className="p-2 rounded-md transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
          style={{ color: 'var(--secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          title="Zoom in"
          aria-label="Acercar"
        >
          <ZoomIn size={18} />
        </button>

        <div
          className="w-px h-5 mx-2"
          style={{ background: 'var(--border)' }}
        />

        <button
          onClick={handleRotate}
          className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
          style={{ color: 'var(--secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          title="Rotate"
          aria-label="Rotar imagen"
        >
          <RotateCw size={18} />
        </button>

        <button
          onClick={handleResetView}
          className="p-2 rounded-md transition-colors"
          style={{ color: 'var(--secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          title="Reset view"
        >
          <Maximize2 size={18} />
        </button>
      </div>

      {/* Image Container */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {isLoading && !imageUrl ? (
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--brand-primary)' }} />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={resource.title}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        ) : null}
      </div>
    </div>
  );
}
