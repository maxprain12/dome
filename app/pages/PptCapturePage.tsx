/**
 * PptCapturePage – hidden route used exclusively by the main process
 * to render PPTX slides and capture them as PNG images via Electron's
 * webContents.capturePage(). Never shown to the user.
 *
 * The main process loads this route in an invisible BrowserWindow,
 * then communicates via executeJavaScript() through the window.__pptCapture
 * API exposed here.
 */
import { useEffect, useRef } from 'react';
import { init as initPptxPreview } from 'pptx-preview';
import { fixDarkSlideTextColors } from '@/lib/pptx-color-fix';

const SLIDE_W = 960;
const SLIDE_H = 540;

export default function PptCapturePage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Hide pptx-preview navigation controls (arrows + pagination counter).
    // Also neutralise Dome's global text color so the slide's own theme
    // color becomes the effective default — pptx-preview sets explicit inline
    // `style="color:…"` on elements it can resolve, which always wins over
    // this class-level rule. The `--ppt-text-default` variable is set
    // dynamically in `init()` after we can read the PPTX theme.
    const style = document.createElement('style');
    style.setAttribute('data-ppt-capture', '');
    style.textContent = `
      .pptx-preview-wrapper-next,
      .pptx-preview-wrapper-pagination {
        display: none !important;
      }
      /* Default text color for slide content that has no explicit color in
         the PPTX XML (i.e. uses theme inheritance). Updated per-presentation
         in init() from the PPTX theme's lt1 (Light 1) value. Falls back to
         white which is correct for the most common dark-background designs. */
      .pptx-preview-slide-wrapper {
        color: var(--ppt-text-default, #ffffff);
      }
    `;
    document.head.appendChild(style);

    // Force the page to look like a plain 960×540 white canvas —
    // no app chrome, no scrollbars.
    const root = document.getElementById('root');
    const prevRootStyle = root?.getAttribute('style') ?? '';
    const prevBodyStyle = document.body.getAttribute('style') ?? '';

    document.body.setAttribute(
      'style',
      'margin:0;padding:0;overflow:hidden;background:#fff;width:960px;height:540px;',
    );
    if (root) {
      root.setAttribute(
        'style',
        'position:fixed;top:0;left:0;width:960px;height:540px;overflow:hidden;',
      );
    }

    // Expose the control API that ppt-slide-extractor.cjs calls via
    // win.webContents.executeJavaScript().
    (window as any).__pptCapture = {
      /**
       * Load a PPTX file from a base64 string and render the first slide.
       * @returns The total number of slides.
       */
      init: async (base64Data: string): Promise<number> => {
        if (!containerRef.current) throw new Error('Capture container not mounted');

        // Decode base64 → ArrayBuffer
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        // Clear any previous presentation
        containerRef.current.innerHTML = '';

        const previewer = initPptxPreview(containerRef.current, {
          width: SLIDE_W,
          height: SLIDE_H,
          mode: 'slide',
        });

        // Store on window so renderSlide() can access it
        (window as any).__pptPreviewer = previewer;

        await previewer.preview(bytes.buffer);

        // Read the PPTX theme's "lt1" (Light 1) color — this is the default
        // text color on dark-background slides (white in most dark themes).
        // We apply it as a CSS variable so any text element that pptx-preview
        // doesn't explicitly color (theme-inherited) still renders correctly.
        let lightColor = '#ffffff';
        try {
          const themes: any[] = (previewer as any).pptx?.themes ?? [];
          const lt1 = themes[0]?.clrScheme?.lt1;
          if (lt1 && containerRef.current) {
            // lt1 is stored without the '#' prefix in pptx-preview's clrScheme
            lightColor = lt1.startsWith('#') ? lt1 : `#${lt1}`;
            containerRef.current.style.setProperty('--ppt-text-default', lightColor);
          }
        } catch {
          // Non-critical: the CSS fallback (#ffffff) handles the common case.
        }
        (window as any).__pptLightColor = lightColor;

        // Fix dark-slide text colors for slide 0 (already rendered by preview)
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        if (containerRef.current) {
          fixDarkSlideTextColors(containerRef.current, lightColor);
        }

        return previewer.slideCount;
      },

      /**
       * Render the slide at the given 0-based index.
       * Waits two rAF cycles so getComputedStyle reflects the new slide, then
       * applies the dark-slide text color fix. Returns a promise for the caller to await.
       */
      renderSlide: (index: number): Promise<boolean> => {
        const previewer = (window as any).__pptPreviewer;
        if (!previewer || !containerRef.current) return Promise.resolve(false);
        previewer.renderSingleSlide(index);
        return new Promise((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const lightColor = (window as any).__pptLightColor ?? '#ffffff';
              fixDarkSlideTextColors(containerRef.current!, lightColor);
              resolve(true);
            }),
          );
        });
      },

      getSlideCount: (): number => {
        return (window as any).__pptPreviewer?.slideCount ?? 0;
      },
    };

    // Signal that the API is ready for the main process to poll.
    (window as any).__pptCaptureReady = true;

    return () => {
      style.remove();
      (window as any).__pptCapture = null;
      (window as any).__pptCaptureReady = false;
      (window as any).__pptPreviewer = null;
      (window as any).__pptLightColor = undefined;
      // Restore styles
      document.body.setAttribute('style', prevBodyStyle);
      if (root) root.setAttribute('style', prevRootStyle);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: SLIDE_W,
        height: SLIDE_H,
        overflow: 'hidden',
        background: '#ffffff',
        margin: 0,
        padding: 0,
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
