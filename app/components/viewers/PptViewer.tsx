'use client';

import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { type Resource } from '@/types';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';

// Fixed internal resolution — all slides render at this size
const SLIDE_W = 960;
const SLIDE_H = 540;

export interface PptViewerHandle {
  // Navigation is controlled via activeIndex prop — no imperative scroll needed
}

interface PptViewerProps {
  resource: Resource;
  /** Currently visible slide (0-based). Controlled by parent. */
  activeIndex: number;
  onSlidesLoaded?: (count: number) => void;
  /** Called once with cloned HTMLElement[] for each slide, to use as thumbnails. */
  onThumbnailsReady?: (elements: HTMLElement[]) => void;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const PptViewerComponent = forwardRef<PptViewerHandle, PptViewerProps>(
  function PptViewerComponent({ resource, activeIndex, onSlidesLoaded, onThumbnailsReady }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const slideEls = useRef<HTMLElement[]>([]);
    // Keep a ref so loadPptx can read current activeIndex without being in its deps
    const activeIndexRef = useRef(activeIndex);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scale, setScale] = useState(1);

    useImperativeHandle(ref, () => ({}), []);

    // Keep ref in sync
    useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

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

    // Show the active slide, hide all others — pure DOM, no re-render
    useEffect(() => {
      const slides = slideEls.current;
      slides.forEach((el, i) => {
        el.style.display = i === activeIndex ? 'block' : 'none';
      });
    }, [activeIndex]);

    const loadPptx = useCallback(async () => {
      if (typeof window === 'undefined' || !window.electron || !stageRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.resource.readDocumentContent(resource.id);
        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to read presentation');
        }

        const arrayBuffer = base64ToArrayBuffer(result.data);
        const { init } = await import('pptx-preview');

        // Render into the stage element
        const previewer = init(stageRef.current, {
          width: SLIDE_W,
          height: SLIDE_H,
          mode: 'list',
        });
        await previewer.preview(arrayBuffer);

        // Wait two rAF cycles for pptx-preview to finish DOM work
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const stage = stageRef.current;
            if (!stage) return;

            // pptx-preview typically wraps slides in one container div
            const wrapper = stage.firstElementChild as HTMLElement | null;
            let slides: HTMLElement[];

            if (wrapper && wrapper.children.length > 0) {
              slides = Array.from(wrapper.children) as HTMLElement[];
              // Fix wrapper so it doesn't push height beyond one slide
              wrapper.style.position = 'relative';
              wrapper.style.height = `${SLIDE_H}px`;
              wrapper.style.overflow = 'hidden';
            } else {
              slides = Array.from(stage.children) as HTMLElement[];
            }

            slideEls.current = slides;

            // Stack all slides at (0,0), show only active
            const current = activeIndexRef.current;
            slides.forEach((slide, i) => {
              slide.style.position = 'absolute';
              slide.style.top = '0';
              slide.style.left = '0';
              slide.style.display = i === current ? 'block' : 'none';
            });

            onSlidesLoaded?.(slides.length);

            // Build thumbnail clones (one per slide, full size — scaled down by the strip)
            if (onThumbnailsReady) {
              const clones = slides.map((slide) => {
                const clone = slide.cloneNode(true) as HTMLElement;
                clone.style.position = 'absolute';
                clone.style.top = '0';
                clone.style.left = '0';
                clone.style.display = 'block';
                return clone;
              });
              onThumbnailsReady(clones);
            }
          })
        );
      } catch (err) {
        console.error('[PptViewer] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load presentation');
      } finally {
        setIsLoading(false);
      }
    }, [resource.id, onSlidesLoaded, onThumbnailsReady]);

    useEffect(() => {
      const id = setTimeout(loadPptx, 50);
      return () => clearTimeout(id);
    }, [loadPptx]);

    if (error) return <ErrorState error={error} />;

    // The outer wrapper is sized to the VISUAL (scaled) dimensions of the slide,
    // so shadows and centering work correctly.
    const scaledW = Math.round(SLIDE_W * scale);
    const scaledH = Math.round(SLIDE_H * scale);

    return (
      <div
        ref={hostRef}
        className="h-full w-full flex items-center justify-center"
        style={{ backgroundColor: '#111118', overflow: 'hidden' }}
      >
        {/* Outer wrapper: visual size — handles shadow + border-radius */}
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
          }}
        >
          {/* Stage: full SLIDE_W × SLIDE_H, scaled from top-left origin */}
          <div
            ref={stageRef}
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              position: 'absolute',
              top: 0,
              left: 0,
              background: '#ffffff',
              overflow: 'hidden',
            }}
          />
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <LoadingState message="Cargando presentación..." />
          </div>
        )}
      </div>
    );
  }
);

export default React.memo(PptViewerComponent);
export { SLIDE_W, SLIDE_H };
