'use client';

import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { PPT_SLIDE_LIGHT_DEFAULT } from '@/lib/ui/palettes';
import { init as initPptxPreview } from '@/lib/pptx-preview';
import { type Resource } from '@/types';
import ListState from '@/components/shared/ListState';
import { fixDarkSlideTextColors } from '@/lib/pptx-color-fix';
import { normalizePptxArrayBuffer, countSlidesInArrayBuffer } from '@/lib/pptx-normalize';
import { useTranslation } from 'react-i18next';

// Fixed internal resolution — used for aspect ratio and scaling
const SLIDE_W = 960;
const SLIDE_H = 540;

/** Wait two animation frames so the DOM has had a chance to settle. */
const waitTwoPaintCycles = (): Promise<void> =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

/** Imperative handle reserved for future navigation APIs. */
export type PptViewerHandle = Record<string, never>;

interface PptxTheme {
  clrScheme?: {
    lt1?: string;
  };
}

interface PptxPreviewer {
  pptx?: {
    themes?: PptxTheme[];
    slides?: unknown[];
  };
  slideCount?: number;
  currentIndex?: number;
  renderSingleSlide?: (index: number) => void;
  destroy?: () => void;
}

function safeRenderSlide(previewer: PptxPreviewer, index: number, slideCount: number): void {
  if (index < 0 || index >= slideCount) return;
  try {
    previewer.renderSingleSlide?.(index);
  } catch (err) {
    console.warn('[PptViewer] renderSingleSlide failed:', err);
  }
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
function applyThemeTextColor(previewer: PptxPreviewer, container: HTMLElement): string {
  let hex: string = PPT_SLIDE_LIGHT_DEFAULT;
  try {
    const themes = previewer?.pptx?.themes ?? [];
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
    const { t } = useTranslation();
    const hostRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const previewerRef = useRef<PptxPreviewer | null>(null);
    const thumbDivRef = useRef<HTMLDivElement | null>(null);
    const lightColorRef = useRef<string>(PPT_SLIDE_LIGHT_DEFAULT);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scale, setScale] = useState(1);
    const loadedResourceId = useRef<string | null>(null);
    const lastRenderedIndexRef = useRef<number | null>(null);

    // pptx-preview injects nav chrome + black wrapper; scope overrides to this viewer.
    useEffect(() => {
      const style = document.createElement('style');
      style.setAttribute('data-ppt-viewer', '');
      style.textContent = `
        .ppt-viewer-host .pptx-preview-wrapper {
          background: ${PPT_SLIDE_LIGHT_DEFAULT} !important;
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
        }
        .ppt-viewer-host .pptx-preview-wrapper-pre,
        .ppt-viewer-host .pptx-preview-wrapper-next,
        .ppt-viewer-host .pptx-preview-wrapper-pagination {
          display: none !important;
        }
        .ppt-viewer-host .pptx-preview-slide-wrapper {
          color: var(--ppt-text-default);
        }
      `;
      document.head.appendChild(style);
      return () => { style.remove(); };
    }, []);

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

    useImperativeHandle(ref, () => ({}), []);

    const mountPresentation = useCallback(async (
      previewer: PptxPreviewer & { load?: (data: ArrayBuffer) => Promise<unknown>; preview?: (data: ArrayBuffer) => Promise<unknown> },
      buffer: ArrayBuffer,
      slideIndex: number,
      options?: { trackRendered?: boolean; rootEl?: HTMLElement | null },
    ): Promise<number> => {
      if (typeof previewer.load === 'function') {
        await previewer.load(buffer);
      } else if (typeof previewer.preview === 'function') {
        await previewer.preview(buffer);
      } else {
        throw new Error('Visor PPT no disponible');
      }

      const count = previewer.slideCount ?? previewer.pptx?.slides?.length ?? 0;
      if (count <= 0) {
        const zipCount = await countSlidesInArrayBuffer(buffer);
        if (zipCount === 0) {
          throw new Error(
            'Esta presentación está vacía (0 diapositivas). El agente probablemente no ejecutó addSlide() al crearla. Pídele que la genere de nuevo con ppt_create.',
          );
        }
        throw new Error(
          'El archivo tiene diapositivas pero el visor no pudo interpretarlas. Pide al agente que regenere la presentación con ppt_create.',
        );
      }

      const safeIndex = Math.min(Math.max(0, slideIndex), count - 1);
      safeRenderSlide(previewer, safeIndex, count);
      if (options?.trackRendered !== false) {
        lastRenderedIndexRef.current = safeIndex;
      }

      const root = options?.rootEl ?? containerRef.current;
      const wrapper = root?.querySelector('.pptx-preview-slide-wrapper');
      if (!wrapper) {
        throw new Error('No se pudo renderizar la presentación');
      }

      return count;
    }, []);

    // When activeIndex changes, tell the existing previewer to show that slide,
    // then re-apply the dark-slide color fix on the freshly rendered content.
    useEffect(() => {
      const previewer = previewerRef.current;
      if (!previewer || isLoading) return;
      const count = previewer.slideCount ?? previewer.pptx?.slides?.length ?? 0;
      if (count <= 0) return;
      if (lastRenderedIndexRef.current === activeIndex) return;
      safeRenderSlide(previewer, activeIndex, count);
      lastRenderedIndexRef.current = activeIndex;
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
        let buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        try {
          buffer = await normalizePptxArrayBuffer(buffer);
        } catch (normErr) {
          console.warn('[PptViewer] normalize failed (non-fatal):', normErr);
        }

        // ── 3. Init pptx-preview directly in the visible container ────────
        containerRef.current.innerHTML = '';
        const previewer = initPptxPreview(containerRef.current, {
          width: SLIDE_W,
          height: SLIDE_H,
          mode: 'slide',
        });
        previewerRef.current = previewer;

        const count = await mountPresentation(previewer, buffer, 0);

        // Apply theme color CSS variable and capture lt1 for DOM-level color fix
        const lightColor = applyThemeTextColor(previewer, containerRef.current);
        lightColorRef.current = lightColor;

        loadedResourceId.current = resource.id;
        onSlidesLoaded?.(count);

        // Parent resets activeIndex to 0 via onSlidesLoaded; avoid stale index here.
        setIsLoading(false);

        // Fix near-black text on dark slides (pptx-preview applies dk1 inline
        // which overrides any CSS rule — must be done with DOM manipulation).
        await waitTwoPaintCycles();
        if (containerRef.current) {
          fixDarkSlideTextColors(containerRef.current, lightColor);
        }

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
              await mountPresentation(thumbPreviewer, buffer, 0, { trackRendered: false, rootEl: thumbDiv });
              const thumbLightColor = applyThemeTextColor(thumbPreviewer, thumbDiv);
              const thumbCount = thumbPreviewer.slideCount ?? count;

              const elements: HTMLElement[] = [];
              for (let i = 0; i < thumbCount; i++) {
                if (i !== 0) safeRenderSlide(thumbPreviewer, i, thumbCount);
                // Two rAF cycles to let the DOM settle
                await waitTwoPaintCycles();
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
    }, [resource, mountPresentation, onSlidesLoaded, onThumbnailElementsReady]);

    // Load on mount and when resource changes
    useEffect(() => {
      loadedResourceId.current = null;
      lastRenderedIndexRef.current = null;
      const id = setTimeout(loadPptx, 50);
      return () => clearTimeout(id);
    }, [loadPptx]);

    // Cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps -- destroy previewer/DOM nodes on unmount only
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

    if (error) return <ListState variant="error" errorMessage={error} fullHeight />;

    const scaledW = Math.round(SLIDE_W * scale);
    const scaledH = Math.round(SLIDE_H * scale);

    return (
      <div
        ref={hostRef}
        className="ppt-viewer-host size-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--card)', overflow: 'hidden' }}
      >
        <div
          className="ppt-viewer-stage relative shrink-0 overflow-hidden rounded-sm bg-background shadow-[0_16px_56px_-8px_rgba(0,0,0,0.75),0_4px_20px_rgba(0,0,0,0.5)]"
          style={{
            width: scaledW,
            height: scaledH,
            visibility: isLoading ? 'hidden' : 'visible',
          }}
        >
          {/* pptx-preview renders directly into this div */}
          <div
            ref={containerRef}
            className="ppt-viewer-canvas"
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              ['--ppt-text-default' as string]: 'var(--primary-foreground)',
            }}
          />
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <ListState variant="loading" loadingLabel={t('viewer.loading_presentation')} fullHeight />
          </div>
        )}
      </div>
    );
  }
);

export default React.memo(PptViewerComponent);
export { SLIDE_W, SLIDE_H };
