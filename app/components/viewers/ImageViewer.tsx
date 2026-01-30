'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RotateCw, Maximize2 } from 'lucide-react';
import { type Resource } from '@/types';
import LoadingState from '../workspace/shared/LoadingState';
import ErrorState from '../workspace/shared/ErrorState';
import ZoomControls from '../workspace/shared/ZoomControls';

interface ImageViewerProps {
  resource: Resource;
}

function ImageViewerComponent({ resource }: ImageViewerProps) {
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing
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
  }, []);

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
    return <ErrorState error={error} />;
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
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
            minZoom={0.25}
            maxZoom={4}
          />

          <div className="w-px h-5 mx-2" style={{ background: 'var(--border)' }} />

          <button
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

        {/* Keyboard Shortcuts Hint */}
        <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
          +/-: Zoom • R: Rotate • 0: Reset
        </span>
      </div>

      {/* Image Container */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {isLoading && !imageUrl ? (
          <LoadingState message="Loading image..." />
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

export default React.memo(ImageViewerComponent);
