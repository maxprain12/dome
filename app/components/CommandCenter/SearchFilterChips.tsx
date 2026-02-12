
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
  Notebook,
} from 'lucide-react';

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  note: { label: 'Notes', icon: <StickyNote size={12} /> },
  notebook: { label: 'Notebooks', icon: <Notebook size={12} /> },
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
      {selectedTypes.length > 0 ? (
        <button
          className="filter-chip filter-chip-clear cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          onClick={onClear}
          aria-label="Show all types"
        >
          All
        </button>
      ) : null}
      {availableTypes.map((type) => {
        const config = TYPE_CONFIG[type];
        if (!config) return null;
        const isActive = selectedTypes.includes(type);
        return (
          <button
            key={type}
            className={`filter-chip cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${isActive ? 'filter-chip-active' : ''}`}
            onClick={() => onToggle(type)}
            aria-label={isActive ? `Filter by ${config.label} (active)` : `Filter by ${config.label}`}
          >
            {config.icon}
            {config.label}
          </button>
        );
      })}


    </div>
  );
}
