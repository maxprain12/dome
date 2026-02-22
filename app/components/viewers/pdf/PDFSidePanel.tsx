import React, { useState } from 'react';
import { ChevronDown, ChevronRight, List, Image, Highlighter, StickyNote } from 'lucide-react';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { OutlineItem } from '@/lib/pdf/pdf-loader';
import type { PDFAnnotation } from '@/lib/pdf/annotation-utils';
import PDFOutline from './PDFOutline';
import PDFThumbnails from './PDFThumbnails';
import PDFHighlightsList from './PDFHighlightsList';
import PDFNotesList from './PDFNotesList';

type SectionId = 'toc' | 'thumbnails' | 'highlights' | 'notes';

const SECTION_CONFIG: Array<{
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'toc', label: 'Índice', icon: <List size={14} /> },
  { id: 'thumbnails', label: 'Páginas', icon: <Image size={14} /> },
  { id: 'highlights', label: 'Resaltados', icon: <Highlighter size={14} /> },
  { id: 'notes', label: 'Notas', icon: <StickyNote size={14} /> },
];

interface PDFSidePanelProps {
  outline: OutlineItem[];
  pages: PDFPageProxy[];
  annotations: PDFAnnotation[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onAddNote: (pageIndex: number) => void;
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
}

export default function PDFSidePanel({
  outline,
  pages,
  annotations,
  currentPage,
  onPageChange,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: PDFSidePanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(
    new Set(['toc', 'thumbnails'])
  );

  const toggleSection = (id: SectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="flex flex-col w-[260px] shrink-0 border-l overflow-hidden"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-secondary)',
      }}
    >
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
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors"
                style={{
                  background: isExpanded ? 'var(--bg)' : 'transparent',
                  color: 'var(--secondary-text)',
                }}
                title={label}
                aria-label={label}
              >
                {isExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                {icon}
                <span className="text-xs truncate">{label}</span>
              </button>
              {isExpanded && (
                <div className="px-2 pb-3">
                  {id === 'toc' && (
                    <PDFOutline
                      outline={outline}
                      currentPage={currentPage}
                      onPageChange={onPageChange}
                    />
                  )}
                  {id === 'thumbnails' && (
                    <PDFThumbnails
                      pages={pages}
                      currentPage={currentPage}
                      onPageChange={onPageChange}
                    />
                  )}
                  {id === 'highlights' && (
                    <PDFHighlightsList
                      annotations={annotations}
                      onGoToPage={onPageChange}
                    />
                  )}
                  {id === 'notes' && (
                    <PDFNotesList
                      annotations={annotations}
                      currentPage={currentPage}
                      onGoToPage={onPageChange}
                      onAddNote={onAddNote}
                      onUpdateNote={onUpdateNote}
                      onDeleteNote={onDeleteNote}
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
