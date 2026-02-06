'use client';

import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Link2,
  File,
  FolderOpen,
  StickyNote,
} from 'lucide-react';

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  note: { label: 'Notes', icon: <StickyNote size={12} /> },
  pdf: { label: 'PDFs', icon: <FileText size={12} /> },
  document: { label: 'Docs', icon: <File size={12} /> },
  image: { label: 'Images', icon: <ImageIcon size={12} /> },
  video: { label: 'Videos', icon: <Video size={12} /> },
  audio: { label: 'Audio', icon: <Music size={12} /> },
  url: { label: 'URLs', icon: <Link2 size={12} /> },
  folder: { label: 'Folders', icon: <FolderOpen size={12} /> },
};

interface SearchFilterChipsProps {
  availableTypes: string[];
  selectedTypes: string[];
  onToggle: (type: string) => void;
  onClear: () => void;
}

export function SearchFilterChips({
  availableTypes,
  selectedTypes,
  onToggle,
  onClear,
}: SearchFilterChipsProps) {
  if (availableTypes.length <= 1) return null;

  return (
    <div className="filter-chips-container">
      {selectedTypes.length > 0 && (
        <button className="filter-chip filter-chip-clear" onClick={onClear}>
          All
        </button>
      )}
      {availableTypes.map((type) => {
        const config = TYPE_CONFIG[type];
        if (!config) return null;
        const isActive = selectedTypes.includes(type);
        return (
          <button
            key={type}
            className={`filter-chip ${isActive ? 'filter-chip-active' : ''}`}
            onClick={() => onToggle(type)}
          >
            {config.icon}
            {config.label}
          </button>
        );
      })}

      <style jsx>{`
        .filter-chips-container {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px 4px;
          flex-wrap: wrap;
        }

        .filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 500;
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          background: transparent;
          color: var(--secondary-text);
          cursor: pointer;
          transition: all var(--transition-fast);
          white-space: nowrap;
        }

        .filter-chip:hover {
          background: var(--bg-hover);
          border-color: var(--border-hover);
          color: var(--primary-text);
        }

        .filter-chip-active {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
        }

        .filter-chip-active:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
          opacity: 0.9;
        }

        .filter-chip-clear {
          font-weight: 600;
          color: var(--accent);
          border-color: var(--accent);
        }

        .filter-chip-clear:hover {
          background: var(--accent);
          color: white;
        }
      `}</style>
    </div>
  );
}
