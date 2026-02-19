
import React, { useState, useMemo } from 'react';
import { Filter, Grid3X3, List, Calendar, Tag, FileText, Image as ImageIcon, Video, Music, Link2, File, FolderOpen, Notebook, X } from 'lucide-react';

export type ResourceType = 'note' | 'pdf' | 'video' | 'audio' | 'image' | 'url' | 'document' | 'folder' | 'notebook' | 'excel';

interface FilterBarProps {
  selectedTypes: ResourceType[];
  onTypesChange: (types: ResourceType[]) => void;
  sortBy: 'updated_at' | 'created_at' | 'title';
  onSortByChange: (sortBy: 'updated_at' | 'created_at' | 'title') => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onCreateFolder?: () => void;
}

const RESOURCE_TYPES: { type: ResourceType; label: string; icon: React.ReactNode }[] = [
  { type: 'note', label: 'Notes', icon: <FileText size={14} /> },
  { type: 'notebook', label: 'Notebooks', icon: <Notebook size={14} /> },
  { type: 'image', label: 'Images', icon: <ImageIcon size={14} /> },
  { type: 'video', label: 'Videos', icon: <Video size={14} /> },
  { type: 'audio', label: 'Audio', icon: <Music size={14} /> },
  { type: 'pdf', label: 'PDFs', icon: <File size={14} /> },
  { type: 'url', label: 'Links', icon: <Link2 size={14} /> },
  { type: 'document', label: 'Docs', icon: <File size={14} /> },
  { type: 'excel', label: 'Excel', icon: <File size={14} /> },
];

export function FilterBar({
  selectedTypes,
  onTypesChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  onCreateFolder,
}: FilterBarProps) {
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

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
          <label htmlFor="filter-sort-select" className="sr-only">Ordenar por</label>
          <select
            id="filter-sort-select"
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as any)}
            className="sort-select"
            aria-label="Ordenar por"
          >
            <option value="updated_at">Recently Updated</option>
            <option value="created_at">Date Created</option>
            <option value="title">Alphabetical</option>
          </select>
        </div>

        {/* Filter button */}
        <div className="filter-dropdown-container">
          <button
            className={`filter-btn min-h-[44px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${activeFilterCount > 0 ? 'active' : ''}`}
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            aria-label="Filtrar por tipo"
          >
            <Filter size={16} />
            <span>Filter</span>
            {activeFilterCount > 0 ? (
              <span className="filter-count">{activeFilterCount}</span>
            ) : null}
          </button>

          {showFilterDropdown && (
            <div className="filter-dropdown">
              <div className="filter-dropdown-header">
                <span>Filter by Type</span>
                {activeFilterCount > 0 ? (
                  <button className="clear-btn cursor-pointer" onClick={clearFilters} aria-label="Clear all filters">
                    Clear all
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
          <button className="create-folder-btn min-h-[44px] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" onClick={onCreateFolder} aria-label="Create new folder">
            <FolderOpen size={16} />
            <span>New folder</span>
          </button>
        )}

        {/* View mode toggle */}
        <div className="view-mode-toggle">
          <button
            className={`view-btn min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            className={`view-btn min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => onViewModeChange('list')}
            aria-label="List view"
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
