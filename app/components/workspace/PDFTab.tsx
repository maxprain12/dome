import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, List, Image, Highlighter, StickyNote } from 'lucide-react';
import { usePDFViewerStore } from '@/lib/store/usePDFViewerStore';
import PDFOutline from '../viewers/pdf/PDFOutline';
import PDFThumbnails from '../viewers/pdf/PDFThumbnails';
import PDFHighlightsList from '../viewers/pdf/PDFHighlightsList';
import PDFNotesList from '../viewers/pdf/PDFNotesList';

type SectionId = 'toc' | 'thumbnails' | 'highlights' | 'notes';

const SECTION_CONFIG: Array<{ id: SectionId; label: string; icon: React.ReactNode }> = [
  { id: 'toc', label: 'Índice', icon: <List size={12} /> },
  { id: 'thumbnails', label: 'Páginas', icon: <Image size={12} /> },
  { id: 'highlights', label: 'Resaltados', icon: <Highlighter size={12} /> },
  { id: 'notes', label: 'Notas', icon: <StickyNote size={12} /> },
];

const COLORS = ['#ffeb3b', '#4caf50', '#2196f3', '#f44336', '#ff9800', '#9c27b0'];

export default function PDFTab() {
  const pdfState = usePDFViewerStore((s) => s.pdfState);
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(
    new Set(['toc', 'thumbnails'])
  );

  if (!pdfState) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm" style={{ color: 'var(--tertiary-text)' }}>
          Cargando PDF...
        </p>
      </div>
    );
  }

  const toggleSection = (id: SectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compact nav: page + zoom */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        <button
          type="button"
          onClick={() => pdfState.onPageChange(Math.max(1, pdfState.currentPage - 1))}
          disabled={pdfState.currentPage <= 1}
          className="p-1 rounded disabled:opacity-40"
          style={{ color: 'var(--secondary-text)' }}
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs flex-1 text-center" style={{ color: 'var(--primary-text)' }}>
          {pdfState.currentPage} / {pdfState.totalPages}
        </span>
        <button
          type="button"
          onClick={() => pdfState.onPageChange(Math.min(pdfState.totalPages, pdfState.currentPage + 1))}
          disabled={pdfState.currentPage >= pdfState.totalPages}
          className="p-1 rounded disabled:opacity-40"
          style={{ color: 'var(--secondary-text)' }}
          aria-label="Página siguiente"
        >
          <ChevronRight size={14} />
        </button>
        <div className="w-px h-4" style={{ background: 'var(--border)' }} />
        <button
          type="button"
          onClick={pdfState.onZoomOut}
          className="p-1 rounded"
          style={{ color: 'var(--secondary-text)' }}
          aria-label="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <span className="text-xs w-8 text-center" style={{ color: 'var(--secondary-text)' }}>
          {Math.round(pdfState.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={pdfState.onZoomIn}
          className="p-1 rounded"
          style={{ color: 'var(--secondary-text)' }}
          aria-label="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
      </div>

      {/* Annotations: highlight + note + colors */}
      <div
        className="flex items-center gap-1 px-2 py-1 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={() => pdfState.onToolSelect(pdfState.activeTool === 'highlight' ? null : 'highlight')}
          className="p-1.5 rounded"
          style={{
            background: pdfState.activeTool === 'highlight' ? 'var(--bg-tertiary)' : 'transparent',
            color: pdfState.activeTool === 'highlight' ? 'var(--accent)' : 'var(--secondary-text)',
          }}
          title="Resaltar"
          aria-label="Resaltar"
        >
          <Highlighter size={14} />
        </button>
        <button
          type="button"
          onClick={() => pdfState.onToolSelect(pdfState.activeTool === 'note' ? null : 'note')}
          className="p-1.5 rounded"
          style={{
            background: pdfState.activeTool === 'note' ? 'var(--bg-tertiary)' : 'transparent',
            color: pdfState.activeTool === 'note' ? 'var(--accent)' : 'var(--secondary-text)',
          }}
          title="Nota"
          aria-label="Nota"
        >
          <StickyNote size={14} />
        </button>
        {(pdfState.activeTool === 'highlight' || pdfState.activeTool === 'note') && (
          <div className="flex gap-0.5 ml-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pdfState.onColorChange(c)}
                className="w-4 h-4 rounded border"
                style={{
                  background: c,
                  borderColor: pdfState.color === c ? 'var(--accent)' : 'var(--border)',
                }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Collapsible sections */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {SECTION_CONFIG.map(({ id, label, icon }) => {
          const isExpanded = expandedSections.has(id);
          return (
            <div
              key={id}
              className="border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                onClick={() => toggleSection(id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
                style={{ color: 'var(--secondary-text)' }}
                title={label}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {icon}
                <span className="text-xs">{label}</span>
              </button>
              {isExpanded && (
                <div className="px-2 pb-2">
                  {id === 'toc' && (
                    <PDFOutline
                      outline={pdfState.outline}
                      currentPage={pdfState.currentPage}
                      onPageChange={pdfState.onPageChange}
                    />
                  )}
                  {id === 'thumbnails' && (
                    <PDFThumbnails
                      pages={pdfState.pages}
                      currentPage={pdfState.currentPage}
                      onPageChange={pdfState.onPageChange}
                    />
                  )}
                  {id === 'highlights' && (
                    <PDFHighlightsList
                      annotations={pdfState.annotations}
                      onGoToPage={pdfState.onPageChange}
                    />
                  )}
                  {id === 'notes' && (
                    <PDFNotesList
                      annotations={pdfState.annotations}
                      currentPage={pdfState.currentPage}
                      onGoToPage={pdfState.onPageChange}
                      onAddNote={pdfState.onAddNote}
                      onUpdateNote={pdfState.onUpdateNote}
                      onDeleteNote={pdfState.onDeleteNote}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
