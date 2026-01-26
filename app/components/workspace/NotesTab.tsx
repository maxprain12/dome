'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Loader2, Edit3, Check, X } from 'lucide-react';
import { useInteractions, type ParsedInteraction } from '@/lib/hooks/useInteractions';

interface NotesTabProps {
  resourceId: string;
}

export default function NotesTab({ resourceId }: NotesTabProps) {
  const {
    notes,
    isLoading,
    error,
    addInteraction,
    updateInteraction,
    deleteInteraction,
  } = useInteractions(resourceId);

  const [newNote, setNewNote] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim()) return;

    setIsAdding(true);
    await addInteraction('note', newNote.trim());
    setNewNote('');
    setIsAdding(false);
  }, [newNote, addInteraction]);

  const handleStartEdit = useCallback((note: ParsedInteraction) => {
    setEditingId(note.id);
    setEditContent(note.content);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editContent.trim()) return;

    await updateInteraction(editingId, editContent.trim());
    setEditingId(null);
    setEditContent('');
  }, [editingId, editContent, updateInteraction]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditContent('');
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm('Are you sure you want to delete this note?')) {
        await deleteInteraction(id);
      }
    },
    [deleteInteraction]
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-primary)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Add Note Input */}
      <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-2">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 p-2 text-sm rounded-md resize-none"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--primary)',
              minHeight: '60px',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                handleAddNote();
              }
            }}
          />
          <button
            onClick={handleAddNote}
            disabled={!newNote.trim() || isAdding}
            className="p-2 rounded-md transition-colors self-end disabled:opacity-50"
            style={{
              background: 'var(--brand-primary)',
              color: 'white',
            }}
            title="Add note (⌘+Enter)"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus size={18} />}
          </button>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--tertiary)' }}>
          Press ⌘+Enter to add
        </p>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {notes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'var(--secondary)' }}>
              No notes yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--tertiary)' }}>
              Add your first note above
            </p>
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="p-3 rounded-lg"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {editingId === note.id ? (
                /* Editing Mode */
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full p-2 text-sm rounded-md resize-none"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--brand-primary)',
                      color: 'var(--primary)',
                      minHeight: '80px',
                    }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleCancelEdit}
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: 'var(--secondary)' }}
                    >
                      <X size={16} />
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: 'var(--brand-primary)' }}
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <>
                  <p
                    className="text-sm whitespace-pre-wrap"
                    style={{ color: 'var(--primary)' }}
                  >
                    {note.content}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--tertiary)' }}>
                      {formatDate(note.created_at)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(note)}
                        className="p-1 rounded transition-colors"
                        style={{ color: 'var(--secondary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-tertiary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                        title="Edit note"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="p-1 rounded transition-colors"
                        style={{ color: 'var(--secondary)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-tertiary)';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--secondary)';
                        }}
                        title="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
