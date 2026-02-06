'use client';

import React, { useState } from 'react';
import { Bookmark } from 'lucide-react';

interface AnnotationInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
  currentTime: number;
  placeholder?: string;
}

function AnnotationInputComponent({
  isOpen,
  onClose,
  onSave,
  currentTime,
  placeholder = 'Note at this timestamp...',
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
      handleSave();
    }
    if (e.key === 'Escape') {
      setContent('');
      onClose();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        style={{
          color: 'var(--secondary-text)',
          border: '1px solid var(--border)',
        }}
        aria-label="Add annotation"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-tertiary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title="Add annotation at current time"
      >
        <Bookmark size={14} />
        Add Note
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
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
        onClick={handleSave}
        disabled={isSaving || !content.trim()}
        className="px-2 py-1 text-sm rounded transition-opacity"
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
