import { useEffect, useRef, useState, forwardRef, useCallback, type MutableRefObject } from 'react';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';

interface PDFPageProps {
  page: PDFPageProxy;
  scale: number;
  pageNumber: number;
}

const PDFPage = forwardRef<HTMLCanvasElement, PDFPageProps>(function PDFPage(
  { page, scale, pageNumber },
  ref,
) {
  const innerRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setCanvasRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      innerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as MutableRefObject<HTMLCanvasElement | null>).current = el;
    },
    [ref],
  );

  useEffect(() => {
    let isMounted = true;

    async function renderPage() {
      if (!innerRef.current || !page) return;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* */
        }
        renderTaskRef.current = null;
      }

      try {
        setIsRendering(true);
        setError(null);

        const canvas = innerRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Canvas context not available');
        }

        context.clearRect(0, 0, canvas.width, canvas.height);

        const dpr = window.devicePixelRatio || 1;
        const displayWidth = viewport.width;
        const displayHeight = viewport.height;

        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        context.scale(dpr, dpr);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;

        if (isMounted) {
          setIsRendering(false);
          renderTaskRef.current = null;
        }
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'RenderingCancelledException') {
          return;
        }

        console.error(`Error rendering page ${pageNumber}:`, err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to render page');
          setIsRendering(false);
          renderTaskRef.current = null;
        }
      }
    }

    void renderPage();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* */
        }
        renderTaskRef.current = null;
      }
    };
  }, [page, scale, pageNumber]);

  return (
    <div className="relative mb-4" style={{ background: 'var(--bg)' }}>
      <canvas
        ref={setCanvasRef}
        className="block shadow-lg"
        style={{
          display: 'block',
          margin: '0 auto',
        }}
      />
      {isRendering && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(255, 255, 255, 0.8)' }}
        >
          <div className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            Loading page {pageNumber}...
          </div>
        </div>
      )}
      {error && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(255, 255, 255, 0.9)' }}
        >
          <div className="text-sm text-red-500">Error: {error}</div>
        </div>
      )}
    </div>
  );
});

export default PDFPage;
