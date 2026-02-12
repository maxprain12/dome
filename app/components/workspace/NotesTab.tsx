
import { useState, useCallback } from 'react';
import { Plus, Trash2, Loader2, Edit3, Check, X } from 'lucide-react';
import { useInteractions, type ParsedInteraction } from '@/lib/hooks/useInteractions';
import { formatRelativeDate } from '@/lib/utils';

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

  const formatDate = (timestamp: number) => formatRelativeDate(timestamp);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
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
          <label htmlFor="notes-add-input" className="sr-only">Add a note</label>
          <textarea
            id="notes-add-input"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 p-2 text-sm rounded-md resize-none"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--primary-text)',
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
            className="p-2 rounded-md transition-colors self-end disabled:opacity-50 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
            title="Add note (⌘+Enter)"
            aria-label="Add note"
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
              className="p-3 rounded-lg content-visibility-auto"
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
                      border: '1px solid var(--accent)',
                      color: 'var(--primary-text)',
                      minHeight: '80px',
                    }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleCancelEdit}
                      className="p-2.5 min-h-[44px] min-w-[44px] rounded-md transition-colors"
                      style={{ color: 'var(--secondary)' }}
                      aria-label="Cancel edit"
                    >
                      <X size={16} />
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="p-2.5 min-h-[44px] min-w-[44px] rounded-md transition-colors"
                      style={{ color: 'var(--accent)' }}
                      aria-label="Save edit"
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
                    style={{ color: 'var(--primary-text)' }}
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
                        className="p-2 min-h-[44px] min-w-[44px] rounded transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                        style={{ color: 'var(--secondary)' }}
                        title="Edit note"
                        aria-label="Edit note"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="p-2 min-h-[44px] min-w-[44px] rounded transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)] hover:text-[#ef4444] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                        style={{ color: 'var(--secondary)' }}
                        title="Delete note"
                        aria-label="Delete note"
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
