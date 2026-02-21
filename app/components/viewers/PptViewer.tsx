'use client';

import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { init as initPptxPreview } from 'pptx-preview';
import { type Resource } from '@/types';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';
import { fixDarkSlideTextColors } from '@/lib/pptx-color-fix';

// Fixed internal resolution — used for aspect ratio and scaling
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
  /** Called with cloned HTMLElement[] for each slide (for thumbnails). */
  onThumbnailElementsReady?: (elements: HTMLElement[]) => void;
}

/**
 * Read the PPTX theme's lt1 (Light 1) color, apply it as --ppt-text-default
 * on the container, and return the resolved hex value for downstream use.
 */
function applyThemeTextColor(previewer: any, container: HTMLElement): string {
  let hex = '#ffffff';
  try {
    const themes: any[] = previewer?.pptx?.themes ?? [];
    const lt1: string | undefined = themes[0]?.clrScheme?.lt1;
    if (lt1) {
      hex = lt1.startsWith('#') ? lt1 : `#${lt1}`;
    }
  } catch {
    // Non-critical — CSS fallback handles the common case
  }
  container.style.setProperty('--ppt-text-default', hex);
  return hex;
}

const PptViewerComponent = forwardRef<PptViewerHandle, PptViewerProps>(
  function PptViewerComponent({ resource, activeIndex, onSlidesLoaded, onThumbnailElementsReady }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const previewerRef = useRef<any>(null);
    const thumbDivRef = useRef<HTMLDivElement | null>(null);
    const lightColorRef = useRef<string>('#ffffff');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scale, setScale] = useState(1);
    const loadedResourceId = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({}), []);

    // Scale so the slide fits inside the host div
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

    // When activeIndex changes, tell the existing previewer to show that slide,
    // then re-apply the dark-slide color fix on the freshly rendered content.
    useEffect(() => {
      const previewer = previewerRef.current;
      if (!previewer || isLoading) return;
      previewer.renderSingleSlide(activeIndex);
      // pptx-preview re-renders the DOM synchronously; we need one paint cycle
      // before getComputedStyle reliably reflects the new slide's background.
      const rafId = requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (containerRef.current) {
            fixDarkSlideTextColors(containerRef.current, lightColorRef.current);
          }
        }),
      );
      return () => cancelAnimationFrame(rafId);
    }, [activeIndex, isLoading]);

    const loadPptx = useCallback(async () => {
      if (typeof window === 'undefined' || !window.electron?.resource?.readFile) return;
      if (!containerRef.current) return;

      // Avoid re-loading the same resource
      if (loadedResourceId.current === resource.id) return;

      try {
        setIsLoading(true);
        setError(null);

        // ── 1. Read PPTX as data URL via IPC ─────────────────────────────
        const result = await window.electron.resource.readFile(resource.id);
        if (!result?.success || !result.data) {
          throw new Error(result?.error || 'Failed to read presentation file');
        }

        // ── 2. Decode data URL → ArrayBuffer ─────────────────────────────
        const base64 = (result.data as string).split(',')[1];
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const buffer = bytes.buffer;

        // ── 3. Init pptx-preview directly in the visible container ────────
        containerRef.current.innerHTML = '';
        const previewer = initPptxPreview(containerRef.current, {
          width: SLIDE_W,
          height: SLIDE_H,
          mode: 'slide',
        });
        previewerRef.current = previewer;

        // Renders slide 0 and resolves when done
        await previewer.preview(buffer);

        // Apply theme color CSS variable and capture lt1 for DOM-level color fix
        const lightColor = applyThemeTextColor(previewer, containerRef.current);
        lightColorRef.current = lightColor;

        const count: number = previewer.slideCount;
        loadedResourceId.current = resource.id;
        onSlidesLoaded?.(count);

        // Show the active slide (might not be 0 if user navigated before load)
        if (activeIndex > 0 && activeIndex < count) {
          previewer.renderSingleSlide(activeIndex);
        }

        // Fix near-black text on dark slides (pptx-preview applies dk1 inline
        // which overrides any CSS rule — must be done with DOM manipulation).
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
        if (containerRef.current) {
          fixDarkSlideTextColors(containerRef.current, lightColor);
        }

        setIsLoading(false);

        // ── 4. Generate thumbnail elements in the background ──────────────
        // Uses a separate off-screen previewer so the main view is undisturbed.
        if (onThumbnailElementsReady && count > 0) {
          const thumbDiv = document.createElement('div');
          thumbDiv.style.cssText =
            'position:fixed;left:-9999px;top:-9999px;width:960px;height:540px;overflow:hidden;pointer-events:none;';
          document.body.appendChild(thumbDiv);
          thumbDivRef.current = thumbDiv;

          const thumbPreviewer = initPptxPreview(thumbDiv, {
            width: SLIDE_W,
            height: SLIDE_H,
            mode: 'slide',
          });

          (async () => {
            try {
              await thumbPreviewer.preview(buffer);
              const thumbLightColor = applyThemeTextColor(thumbPreviewer, thumbDiv);

              const elements: HTMLElement[] = [];
              for (let i = 0; i < count; i++) {
                thumbPreviewer.renderSingleSlide(i);
                // Two rAF cycles to let the DOM settle
                await new Promise<void>((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(() => r())),
                );
                // Fix dark-slide text colors before cloning
                fixDarkSlideTextColors(thumbDiv, thumbLightColor);
                const wrapper = thumbDiv.querySelector('.pptx-preview-slide-wrapper');
                if (wrapper) {
                  elements.push(wrapper.cloneNode(true) as HTMLElement);
                }
              }
              onThumbnailElementsReady(elements);
            } catch {
              // Thumbnail generation is non-critical — silently skip
            } finally {
              try {
                thumbPreviewer.destroy?.();
                if (document.body.contains(thumbDiv)) document.body.removeChild(thumbDiv);
              } catch {}
              thumbDivRef.current = null;
            }
          })();
        }
      } catch (err) {
        console.error('[PptViewer] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load presentation');
        setIsLoading(false);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resource.id]);

    // Load on mount and when resource changes
    useEffect(() => {
      loadedResourceId.current = null;
      const id = setTimeout(loadPptx, 50);
      return () => clearTimeout(id);
    }, [loadPptx]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        try { previewerRef.current?.destroy?.(); } catch {}
        previewerRef.current = null;
        const td = thumbDivRef.current;
        if (td && document.body.contains(td)) {
          try { document.body.removeChild(td); } catch {}
        }
        thumbDivRef.current = null;
      };
    }, []);

    if (error) return <ErrorState error={error} />;

    const scaledW = Math.round(SLIDE_W * scale);
    const scaledH = Math.round(SLIDE_H * scale);

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
          {/* pptx-preview renders directly into this div */}
          <div
            ref={containerRef}
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              /* Theme text-color fix: slides with no explicit color use lt1 (white)
                 rather than Dome's dark body color. pptx-preview's inline styles
                 (higher specificity) still override this for explicitly colored text. */
              ['--ppt-text-default' as any]: '#ffffff',
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
