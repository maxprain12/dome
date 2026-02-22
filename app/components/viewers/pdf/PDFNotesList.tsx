import React, { useState } from 'react';
import { ChevronRight, Pencil, Trash2, Plus } from 'lucide-react';
import type { PDFAnnotation } from '@/lib/pdf/annotation-utils';

const PREVIEW_MAX_LENGTH = 60;

function truncatePreview(text: string): string {
  if (!text || !text.trim()) return '(empty note)';
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= PREVIEW_MAX_LENGTH) return t;
  return t.slice(0, PREVIEW_MAX_LENGTH) + '…';
}

interface PDFNotesListProps {
  annotations: PDFAnnotation[];
  currentPage: number;
  onGoToPage: (page: number) => void;
  onAddNote: (pageIndex: number) => void;
  onUpdateNote: (id: string, content: string) => void;
  onDeleteNote: (id: string) => void;
}

export default function PDFNotesList({
  annotations,
  currentPage,
  onGoToPage,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: PDFNotesListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const notes = annotations.filter((a) => a.type === 'note');
  const sortedNotes = [...notes].sort((a, b) => a.pageIndex - b.pageIndex);

  const startEdit = (ann: PDFAnnotation) => {
    setEditingId(ann.id);
    setEditValue(ann.content ?? '');
  };

  const saveEdit = () => {
    if (editingId != null) {
      onUpdateNote(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  return (
    <div className="flex flex-col gap-2 py-2">
      <button
        type="button"
        onClick={() => onAddNote(currentPage - 1)}
        className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1"
        style={{ color: 'var(--accent)' }}
      >
        <Plus size={14} />
        Add note for page {currentPage}
      </button>

      {sortedNotes.length === 0 ? (
        <p className="text-sm px-2 py-4" style={{ color: 'var(--tertiary-text)' }}>
          No notes yet
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {sortedNotes.map((ann) => (
            <div
              key={ann.id}
              className="rounded border px-2 py-1.5"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg)',
              }}
            >
              {editingId === ann.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full px-2 py-1 text-sm rounded resize-none"
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      color: 'var(--primary-text)',
                      minHeight: 60,
                    }}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="px-2 py-1 text-xs rounded cursor-pointer"
                      style={{
                        background: 'var(--accent)',
                        color: 'white',
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-2 py-1 text-xs rounded cursor-pointer"
                      style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--secondary-text)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                      Page {ann.pageIndex + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onGoToPage(ann.pageIndex + 1)}
                        className="p-1 rounded cursor-pointer hover:bg-[var(--border)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1"
                        style={{ color: 'var(--secondary-text)' }}
                        title="Go to page"
                        aria-label={`Go to page ${ann.pageIndex + 1}`}
                      >
                        <ChevronRight size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(ann)}
                        className="p-1 rounded cursor-pointer hover:bg-[var(--border)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1"
                        style={{ color: 'var(--secondary-text)' }}
                        title="Edit note"
                        aria-label="Edit note"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(ann.id)}
                        className="p-1 rounded cursor-pointer hover:bg-[var(--border)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1"
                        style={{ color: 'var(--error, #ef4444)' }}
                        title="Delete note"
                        aria-label="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p
                    className="text-sm mt-1 break-words line-clamp-2"
                    style={{ color: 'var(--primary-text)' }}
                  >
                    {truncatePreview(ann.content ?? '')}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
