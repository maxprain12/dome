import { useEffect, useState } from 'react';

interface DomePdfPageInlineProps {
  resourceId: string;
  pageNumber: number;
  alt?: string;
}

/**
 * Renders a PDF page as PNG via main-process pdf.js (dome-pdf-page: links in markdown).
 */
export default function DomePdfPageInline({ resourceId, pageNumber, alt }: DomePdfPageInlineProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.electron?.pdf?.renderPage?.({
          resourceId,
          pageNumber,
        });
        if (cancelled) return;
        if (res?.success && res.dataUrl) {
          setDataUrl(res.dataUrl);
        } else {
          setErr(res?.error || 'render failed');
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resourceId, pageNumber]);

  if (err) {
    return (
      <span className="text-xs opacity-70" title={err}>
        [PDF p.{pageNumber}]
      </span>
    );
  }
  if (!dataUrl) {
    return (
      <span className="text-xs opacity-50 animate-pulse" title={`Cargando página ${pageNumber}…`}>
        …
      </span>
    );
  }
  return (
    <img
      src={dataUrl}
      alt={alt || `PDF page ${pageNumber}`}
      style={{
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 6,
        border: '1px solid var(--border)',
      }}
    />
  );
}
