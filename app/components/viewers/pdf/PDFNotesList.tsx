import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronRightIcon,
  PencilIcon,
  Delete02Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import React, { useState } from 'react';
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
        className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-card focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        style={{ color: 'var(--primary)' }}
      >
        <HugeiconsIcon icon={PlusSignIcon} size={14} />
        Add note for page {currentPage}
      </button>

      {sortedNotes.length === 0 ? (
        <p className="text-sm px-2 py-4 text-muted-foreground">
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
                background: 'var(--background)',
              }}
            >
              {editingId === ann.id ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    aria-label="Note text"
                    className="w-full px-2 py-1 text-sm rounded resize-none"
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      minHeight: 60,
                    }}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="px-2 py-1 text-xs rounded cursor-pointer"
                      style={{
                        background: 'var(--primary)',
                        color: 'var(--primary-foreground)',
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-2 py-1 text-xs rounded cursor-pointer"
                      style={{
                        background: 'var(--card)',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Page {ann.pageIndex + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onGoToPage(ann.pageIndex + 1)}
                        className="p-1 rounded cursor-pointer hover:bg-[var(--border)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                        style={{ color: 'var(--muted-foreground)' }}
                        title="Go to page"
                        aria-label={`Go to page ${ann.pageIndex + 1}`}
                      >
                        <HugeiconsIcon icon={ChevronRightIcon} size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(ann)}
                        className="p-1 rounded cursor-pointer hover:bg-[var(--border)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                        style={{ color: 'var(--muted-foreground)' }}
                        title="Edit note"
                        aria-label="Edit note"
                      >
                        <HugeiconsIcon icon={PencilIcon} size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(ann.id)}
                        className="p-1 rounded cursor-pointer hover:bg-[var(--border)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                        style={{ color: 'var(--destructive)' }}
                        title="Delete note"
                        aria-label="Delete note"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={14} />
                      </button>
                    </div>
                  </div>
                  <p
                    className="text-sm mt-1 break-words line-clamp-2 text-foreground"
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
