import React, { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';

const THUMBNAIL_SCALE = 0.15;
const THUMBNAIL_MAX_WIDTH = 120;

interface PDFThumbnailItemProps {
  page: PDFPageProxy;
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
}

function PDFThumbnailItem({ page, pageNumber, isActive, onClick }: PDFThumbnailItemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    const isMounted = true;

    async function render() {
      if (!canvasRef.current || !page) return;

      try {
        const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = Math.floor(viewport.width);
        const h = Math.floor(viewport.height);
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;

        if (isMounted) setIsRendering(false);
      } catch {
        if (isMounted) setIsRendering(false);
      }
    }

    render();
  }, [page]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-1 rounded border transition-colors cursor-pointer hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1"
      style={{
        borderColor: isActive ? 'var(--accent)' : 'var(--border)',
        background: isActive ? 'var(--dome-accent-bg, rgba(var(--accent-rgb), 0.1))' : 'transparent',
      }}
      title={`Page ${pageNumber}`}
      aria-label={`Go to page ${pageNumber}`}
    >
      <div
        className="relative overflow-hidden rounded shadow-sm"
        style={{
          maxWidth: THUMBNAIL_MAX_WIDTH,
          background: 'var(--bg)',
        }}
      >
        <canvas ref={canvasRef} className="block" />
        {isRendering && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.8)', fontSize: 10 }}
          >
            ...
          </div>
        )}
      </div>
      <span className="text-xs font-medium" style={{ color: 'var(--secondary-text)' }}>
        {pageNumber}
      </span>
    </button>
  );
}

interface PDFThumbnailsProps {
  pages: PDFPageProxy[];
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function PDFThumbnails({ pages, currentPage, onPageChange }: PDFThumbnailsProps) {
  if (pages.length === 0) {
    return (
      <p className="text-sm px-2 py-4" style={{ color: 'var(--tertiary-text)' }}>
        No pages loaded
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 py-2 overflow-y-auto max-h-[300px]">
      {pages.map((page, i) => (
        <PDFThumbnailItem
          key={i}
          page={page}
          pageNumber={i + 1}
          isActive={currentPage === i + 1}
          onClick={() => onPageChange(i + 1)}
        />
      ))}
    </div>
  );
}
