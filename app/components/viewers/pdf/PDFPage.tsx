'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

interface PDFPageProps {
  page: PDFPageProxy;
  scale: number;
  pageNumber: number;
}

export default function PDFPage({ page, scale, pageNumber }: PDFPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function renderPage() {
      if (!canvasRef.current || !page) return;

      // Cancel previous render task if it exists
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }

      try {
        setIsRendering(true);
        setError(null);
        
        // Create a new canvas element to avoid reusing the same canvas
        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Canvas context not available');
        }

        // Clear the canvas before rendering
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Set canvas dimensions
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
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        
        if (isMounted) {
          setIsRendering(false);
          renderTaskRef.current = null;
        }
      } catch (err) {
        // Ignore cancellation errors
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

    renderPage();

    return () => {
      isMounted = false;
      // Cancel render task on unmount
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }
    };
  }, [page, scale, pageNumber]);

  return (
    <div className="relative mb-4" style={{ background: 'white' }}>
      <canvas
        ref={canvasRef}
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
}
