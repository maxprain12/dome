
import React, { useState } from 'react';
import { Filter, Grid3X3, List, Image as ImageIcon, Video, Music, Link2, File, FolderOpen, Notebook, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ResourceType } from '@/types';

export type { ResourceType };

interface FilterBarProps {
  selectedTypes: ResourceType[];
  onTypesChange: (types: ResourceType[]) => void;
  sortBy: 'updated_at' | 'created_at' | 'title';
  onSortByChange: (sortBy: 'updated_at' | 'created_at' | 'title') => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onCreateFolder?: () => void;
}

export function FilterBar({
  selectedTypes,
  onTypesChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  onCreateFolder,
}: FilterBarProps) {
  const { t } = useTranslation();
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const RESOURCE_TYPES: { type: ResourceType; label: string; icon: React.ReactNode }[] = [
    { type: 'notebook', label: t('filter.types.notebooks'), icon: <Notebook size={14} /> },
    { type: 'image', label: t('filter.types.images'), icon: <ImageIcon size={14} /> },
    { type: 'video', label: t('filter.types.videos'), icon: <Video size={14} /> },
    { type: 'audio', label: t('filter.types.audio'), icon: <Music size={14} /> },
    { type: 'pdf', label: t('filter.types.pdfs'), icon: <File size={14} /> },
    { type: 'url', label: t('filter.types.links'), icon: <Link2 size={14} /> },
    { type: 'excel', label: t('filter.types.excel'), icon: <File size={14} /> },
    { type: 'ppt', label: t('filter.types.presentations'), icon: <File size={14} /> },
  ];

  const toggleType = (type: ResourceType) => {
    if (selectedTypes.includes(type)) {
      onTypesChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...selectedTypes, type]);
    }
  };

  const clearFilters = () => {
    onTypesChange([]);
  };

  const activeFilterCount = selectedTypes.length;

  return (
    <div className="filter-bar">
      <div className="filter-bar-left">
        {/* Sort dropdown */}
        <div className="sort-dropdown">
          <label htmlFor="filter-sort-select" className="sr-only">{t('filter.sort_by')}</label>
          <select
            id="filter-sort-select"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as any)}
            className="sort-select"
            aria-label={t('filter.sort_by')}
          >
            <option value="updated_at">{t('filter.sort.recently_updated')}</option>
            <option value="created_at">{t('filter.sort.date_created')}</option>
            <option value="title">{t('filter.sort.alphabetical')}</option>
          </select>
        </div>

        {/* Filter button */}
        <div className="filter-dropdown-container">
          <button
            className={`filter-btn min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${activeFilterCount > 0 ? 'active' : ''}`}
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            aria-label={t('filter.filter_by_type')}
          >
            <Filter size={16} />
            <span>{t('filter.filter')}</span>
            {activeFilterCount > 0 ? (
              <span className="filter-count">{activeFilterCount}</span>
            ) : null}
          </button>

          {showFilterDropdown && (
            <div className="filter-dropdown">
              <div className="filter-dropdown-header">
                <span>{t('filter.filter_by_type')}</span>
                {activeFilterCount > 0 ? (
                  <button className="clear-btn cursor-pointer" onClick={clearFilters} aria-label={t('filter.clear_all')}>
                    {t('filter.clear_all')}
                  </button>
                ) : null}
              </div>
              <div className="filter-options">
                {RESOURCE_TYPES.map(({ type, label, icon }) => (
                  <button
                    key={type}
                    className={`filter-option cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${selectedTypes.includes(type) ? 'selected' : ''}`}
                    onClick={() => toggleType(type)}
                    aria-label={`Filter by ${label}`}
                    aria-pressed={selectedTypes.includes(type)}
                  >
                    {icon}
                    <span>{label}</span>
                    {selectedTypes.includes(type) && <X size={12} className="remove-icon" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 ? (
          <div className="active-filters">
            {selectedTypes.map((type) => {
              const typeInfo = RESOURCE_TYPES.find((t) => t.type === type);
              return (
                <button
                  key={type}
                  className="filter-chip cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  onClick={() => toggleType(type)}
                  aria-label={`Remove ${typeInfo?.label ?? type} filter`}
                >
                  {typeInfo?.icon}
                  <span>{typeInfo?.label}</span>
                  <X size={12} />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="filter-bar-right">
        {/* Create Folder button */}
        {onCreateFolder && (
          <button className="create-folder-btn min-h-[44px] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" onClick={onCreateFolder} aria-label={t('filter.new_folder')}>
            <FolderOpen size={16} />
            <span>{t('filter.new_folder')}</span>
          </button>
        )}

        {/* View mode toggle */}
        <div className="view-mode-toggle">
          <button
            className={`view-btn min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            aria-label={t('filter.grid_view')}
            aria-pressed={viewMode === 'grid'}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            className={`view-btn min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => onViewModeChange('list')}
            aria-label={t('filter.list_view')}
            aria-pressed={viewMode === 'list'}
          >
            <List size={16} />
          </button>
        </div>
      </div>

    </div>
  );
}

export default FilterBar;
