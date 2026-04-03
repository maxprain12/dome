
import React, { useState } from 'react';
import { Bookmark } from 'lucide-react';

interface AnnotationInputProps {
  isOpen: boolean;
  onRequestOpen: () => void;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
  currentTime: number;
  placeholder?: string;
  addNoteLabel?: string;
}

function AnnotationInputComponent({
  isOpen,
  onRequestOpen,
  onClose,
  onSave,
  currentTime: _currentTime,
  placeholder = 'Note at this timestamp...',
  addNoteLabel = 'Add Note',
}: AnnotationInputProps) {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      await onSave(content.trim());
      setContent('');
      onClose();
    } catch (error) {
      console.error('Error saving annotation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSave();
    }
    if (e.key === 'Escape') {
      setContent('');
      onClose();
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onRequestOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors hover:bg-[var(--bg-tertiary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer"
        style={{
          color: 'var(--secondary-text)',
          border: '1px solid var(--border)',
        }}
        aria-label={addNoteLabel}
        title={addNoteLabel}
      >
        <Bookmark size={14} aria-hidden />
        {addNoteLabel}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="annotation-input-content" className="sr-only">
        Annotation note
      </label>
      <input
        id="annotation-input-content"
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className="px-2 py-1 text-sm rounded"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          color: 'var(--primary-text)',
          width: '180px',
        }}
        autoFocus
        onKeyDown={handleKeyDown}
        disabled={isSaving}
      />
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={isSaving || !content.trim()}
        className="px-2 py-1 text-sm rounded transition-opacity cursor-pointer"
        style={{
          background: 'var(--accent)',
          color: 'white',
          opacity: isSaving || !content.trim() ? 0.5 : 1,
        }}
      >
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

export default React.memo(AnnotationInputComponent);
