/**
 * PptCapturePage – hidden route used exclusively by the main process
 * to render PPTX slides and capture them as PNG images via Electron's
 * webContents.capturePage(). Never shown to the user.
 *
 * The main process loads this route in an invisible BrowserWindow and
 * communicates via IPC (ppt-capture:* channels) — no executeJavaScript
 * with user-controlled data.
 */
import { useEffect, useRef } from 'react';
import { PPT_SLIDE_LIGHT_DEFAULT } from '@/lib/ui/palettes';
import { init as initPptxPreview } from '@/lib/pptx-preview';
import { fixDarkSlideTextColors } from '@/lib/pptx-color-fix';
import './ppt-capture-page.css';

const SLIDE_W = 960;
const SLIDE_H = 540;

/** Wait two animation frames so the DOM has had a chance to settle. */
const waitTwoPaintCycles = (): Promise<void> =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

interface PptxTheme {
  clrScheme?: {
    lt1?: string;
  };
}

interface PptxPreviewer {
  pptx?: {
    themes?: PptxTheme[];
  };
  slideCount?: number;
  renderSingleSlide?: (index: number) => void;
  preview?: (buffer: ArrayBuffer) => Promise<void>;
}

type PptCaptureApi = {
  init: (base64Data: string) => Promise<number>;
  renderSlide: (index: number) => Promise<boolean>;
};

export default function PptCapturePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const captureApiRef = useRef<PptCaptureApi | null>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-ppt-capture', '');
    style.textContent = `
      .pptx-preview-wrapper-next,
      .pptx-preview-wrapper-pagination {
        display: none !important;
      }
      .pptx-preview-slide-wrapper {
        color: var(--ppt-text-default);
      }
    `;
    document.head.appendChild(style);

    const root = document.getElementById('root');
    const prevRootStyle = root?.getAttribute('style') ?? '';
    const prevBodyStyle = document.body.getAttribute('style') ?? '';

    document.body.setAttribute(
      'style',
      'margin:0;padding:0;overflow:hidden;background:var(--card);width:960px;height:540px;',
    );
    if (root) {
      root.setAttribute(
        'style',
        'position:fixed;top:0;left:0;width:960px;height:540px;overflow:hidden;',
      );
    }

    const captureApi: PptCaptureApi = {
      init: async (base64Data: string): Promise<number> => {
        if (!containerRef.current) throw new Error('Capture container not mounted');

        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        containerRef.current.innerHTML = '';

        const previewer = initPptxPreview(containerRef.current, {
          width: SLIDE_W,
          height: SLIDE_H,
          mode: 'slide',
        });

        (window as unknown as Record<string, unknown>).__pptPreviewer = previewer;

        await previewer.preview(bytes.buffer);

        let lightColor: string = PPT_SLIDE_LIGHT_DEFAULT;
        try {
          const themes = (previewer as PptxPreviewer).pptx?.themes ?? [];
          const lt1 = themes[0]?.clrScheme?.lt1;
          if (lt1 && containerRef.current) {
            lightColor = lt1.startsWith('#') ? lt1 : `#${lt1}`;
            containerRef.current.style.setProperty('--ppt-text-default', lightColor);
          }
        } catch {
          // Non-critical
        }
        (window as unknown as Record<string, unknown>).__pptLightColor = lightColor;

        await waitTwoPaintCycles();
        if (containerRef.current) {
          fixDarkSlideTextColors(containerRef.current, lightColor);
        }

        return previewer.slideCount;
      },

      renderSlide: (index: number): Promise<boolean> => {
        const previewer = (window as unknown as Record<string, unknown>).__pptPreviewer as PptxPreviewer | undefined;
        if (!previewer || !containerRef.current) return Promise.resolve(false);
        previewer.renderSingleSlide?.(index);
        return new Promise((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const lightColor = (window as unknown as Record<string, unknown>).__pptLightColor as string ?? PPT_SLIDE_LIGHT_DEFAULT;
              fixDarkSlideTextColors(containerRef.current!, lightColor);
              resolve(true);
            }),
          );
        });
      },
    };

    captureApiRef.current = captureApi;

    const unsubInit = window.electron.on('ppt-capture:init', async (base64Data: string) => {
      try {
        const slideCount = await captureApi.init(base64Data);
        window.electron.send('ppt-capture:init-done', { slideCount });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        window.electron.send('ppt-capture:init-done', { error: message });
      }
    });

    const unsubRender = window.electron.on('ppt-capture:render-slide', async (index: number) => {
      try {
        const ok = await captureApi.renderSlide(index);
        if (!ok) {
          window.electron.send('ppt-capture:render-done', { error: `Failed to render slide ${index}` });
          return;
        }
        window.electron.send('ppt-capture:render-done', { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        window.electron.send('ppt-capture:render-done', { error: message });
      }
    });

    window.electron.send('ppt-capture:ready');

    return () => {
      unsubInit();
      unsubRender();
      style.remove();
      captureApiRef.current = null;
      document.body.setAttribute('style', prevBodyStyle);
      if (root) root.setAttribute('style', prevRootStyle);
    };
  }, []);

  return (
    <div className="ppt-capture-root">
      <div ref={containerRef} className="ppt-capture-container" />
    </div>
  );
}
