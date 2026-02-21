'use client';

import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { type Resource } from '@/types';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';

// Fixed internal resolution — used for aspect ratio and scaling
const SLIDE_W = 960;
const SLIDE_H = 540;

export interface PptViewerHandle {
  // Navigation is controlled via activeIndex prop — no imperative scroll needed
}

interface SlideImage {
  index: number;
  image_base64: string;
}

interface PptViewerProps {
  resource: Resource;
  /** Currently visible slide (0-based). Controlled by parent. */
  activeIndex: number;
  onSlidesLoaded?: (count: number) => void;
  /** Called with data URLs for each slide (for thumbnails). */
  onThumbnailUrlsReady?: (urls: string[]) => void;
}

const PptViewerComponent = forwardRef<PptViewerHandle, PptViewerProps>(
  function PptViewerComponent({ resource, activeIndex, onSlidesLoaded, onThumbnailUrlsReady }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [slides, setSlides] = useState<SlideImage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scale, setScale] = useState(1);

    useImperativeHandle(ref, () => ({}), []);

    // Compute scale so the slide fits inside the host div
    const computeScale = useCallback(() => {
      const host = hostRef.current;
      if (!host) return;
      const pad = 56;
      const s = Math.min(
        (host.clientWidth - pad) / SLIDE_W,
        (host.clientHeight - pad) / SLIDE_H,
      );
      setScale(Math.max(s, 0.1));
    }, []);

    useEffect(() => {
      computeScale();
      const ro = new ResizeObserver(computeScale);
      if (hostRef.current) ro.observe(hostRef.current);
      return () => ro.disconnect();
    }, [computeScale]);

    const loadPptx = useCallback(async () => {
      if (typeof window === 'undefined' || !window.electron?.resource?.extractPptImages) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.resource.extractPptImages(resource.id);
        if (!result.success) {
          throw new Error(result.error || 'Failed to extract slide images');
        }

        const slideList = result.slides ?? [];
        setSlides(slideList);

        onSlidesLoaded?.(slideList.length);

        if (onThumbnailUrlsReady && slideList.length > 0) {
          const urls = slideList.map((s) => `data:image/png;base64,${s.image_base64}`);
          onThumbnailUrlsReady(urls);
        }
      } catch (err) {
        console.error('[PptViewer] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load presentation');
      } finally {
        setIsLoading(false);
      }
    }, [resource.id, onSlidesLoaded, onThumbnailUrlsReady]);

    useEffect(() => {
      const id = setTimeout(loadPptx, 50);
      return () => clearTimeout(id);
    }, [loadPptx]);

    if (error) return <ErrorState error={error} />;

    const scaledW = Math.round(SLIDE_W * scale);
    const scaledH = Math.round(SLIDE_H * scale);

    const activeSlide = slides[activeIndex];
    const activeSrc = activeSlide
      ? `data:image/png;base64,${activeSlide.image_base64}`
      : '';

    return (
      <div
        ref={hostRef}
        className="h-full w-full flex items-center justify-center"
        style={{ backgroundColor: '#111118', overflow: 'hidden' }}
      >
        <div
          style={{
            width: scaledW,
            height: scaledH,
            flexShrink: 0,
            position: 'relative',
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 16px 56px -8px rgba(0,0,0,0.75), 0 4px 20px rgba(0,0,0,0.5)',
            visibility: isLoading ? 'hidden' : 'visible',
            background: '#ffffff',
          }}
        >
          {activeSrc ? (
            <img
              src={activeSrc}
              alt={`Slide ${activeIndex + 1}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : null}
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <LoadingState message="Extrayendo diapositivas..." />
          </div>
        )}
      </div>
    );
  }
);

export default React.memo(PptViewerComponent);
export { SLIDE_W, SLIDE_H };
