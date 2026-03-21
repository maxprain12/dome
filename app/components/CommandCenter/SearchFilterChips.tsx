import React from 'react';
import { useTranslation } from 'react-i18next';
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

const TYPE_ICONS: Record<string, React.ReactNode> = {
  notebook: <Notebook size={12} />,
  pdf: <FileText size={12} />,
  document: <File size={12} />,
  image: <ImageIcon size={12} />,
  video: <Video size={12} />,
  audio: <Music size={12} />,
  url: <Link2 size={12} />,
  folder: <FolderOpen size={12} />,
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
  const { t } = useTranslation();
  if (availableTypes.length <= 1) return null;

  return (
    <div className="filter-chips-container">
      {selectedTypes.length > 0 ? (
        <button
          className="filter-chip filter-chip-clear cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          onClick={onClear}
          aria-label={t('commandFilter.show_all_types')}
        >
          {t('commandFilter.all')}
        </button>
      ) : null}
      {availableTypes.map((type) => {
        const icon = TYPE_ICONS[type];
        if (!icon) return null;
        const label = t(`commandFilter.types.${type}`);
        const isActive = selectedTypes.includes(type);
        return (
          <button
            key={type}
            className={`filter-chip cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${isActive ? 'filter-chip-active' : ''}`}
            onClick={() => onToggle(type)}
            aria-label={isActive ? t('commandFilter.filter_by_active', { label }) : t('commandFilter.filter_by', { label })}
          >
            {icon}
            {label}
          </button>
        );
      })}


    </div>
  );
}
