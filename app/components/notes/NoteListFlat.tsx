'use client';

import { useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import type { Note } from '@/types';
import { useNotesFlat } from '@/lib/hooks/useNotesFlat';

interface NoteListFlatProps {
  projectId?: string;
  activeNoteId?: string | null;
  basePath?: string;
}

export default function NoteListFlat({
  projectId = 'default',
  activeNoteId = null,
  basePath = '/workspace',
}: NoteListFlatProps) {
  const navigate = useNavigate();
  const { notes, isLoading, createNote } = useNotesFlat({ projectId });

  const handleNoteClick = (note: Note) => {
    navigate(`${basePath}/note?id=${note.id}`);
  };

  const handleCreateNote = async () => {
    const note = await createNote();
    if (note) {
      navigate(`${basePath}/note?id=${note.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="py-4 px-2 text-sm" style={{ color: 'var(--secondary-text)' }}>
        Loading notes...
      </div>
    );
  }

  return (
    <div className="note-list-flat py-2">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--secondary-text)' }}>
          Notes
        </span>
        <button
          type="button"
          className="p-1 rounded hover:bg-[var(--bg-hover)]"
          onClick={handleCreateNote}
          aria-label="New note"
        >
          <Plus size={14} />
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--secondary-text)' }}>
          No notes yet. Click + to create one.
        </div>
      ) : (
        <div className="space-y-0.5">
          {notes.map((note) => {
            const isActive = activeNoteId === note.id;
            return (
              <div
                key={note.id}
                className={`group flex items-center gap-2 rounded-md mx-1 px-2 py-1.5 cursor-pointer transition-colors ${
                  isActive ? 'bg-[var(--accent-bg)] text-[var(--primary-text)] font-medium' : 'hover:bg-[var(--bg-hover)]'
                }`}
                onClick={() => handleNoteClick(note)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleNoteClick(note)}
                aria-selected={isActive}
              >
                <FileText size={14} className="flex-shrink-0 opacity-70" />
                <span className="truncate flex-1">{note.title || 'Untitled'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
