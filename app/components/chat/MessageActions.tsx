'use client';

import { useState } from 'react';
import { Copy, Check, BookmarkPlus } from 'lucide-react';

interface MessageActionsProps {
  content: string;
  onSaveAsNote?: (content: string) => void;
}

export default function MessageActions({ content, onSaveAsNote }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed silently
    }
  };

  const handleSaveAsNote = () => {
    if (onSaveAsNote) {
      onSaveAsNote(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
        style={{
          color: copied ? 'var(--success)' : 'var(--tertiary-text)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!copied) e.currentTarget.style.color = 'var(--secondary-text)';
          e.currentTarget.style.background = 'var(--bg-secondary)';
        }}
        onMouseLeave={(e) => {
          if (!copied) e.currentTarget.style.color = 'var(--tertiary-text)';
          e.currentTarget.style.background = 'transparent';
        }}
        title="Copy response"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>

      {onSaveAsNote && (
        <button
          onClick={handleSaveAsNote}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
          style={{
            color: saved ? 'var(--success)' : 'var(--tertiary-text)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!saved) e.currentTarget.style.color = 'var(--secondary-text)';
            e.currentTarget.style.background = 'var(--bg-secondary)';
          }}
          onMouseLeave={(e) => {
            if (!saved) e.currentTarget.style.color = 'var(--tertiary-text)';
            e.currentTarget.style.background = 'transparent';
          }}
          title="Save as note"
        >
          {saved ? <Check size={13} /> : <BookmarkPlus size={13} />}
          <span>{saved ? 'Saved!' : 'Save as note'}</span>
        </button>
      )}
    </div>
  );
}
