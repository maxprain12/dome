
import { HugeiconsIcon } from '@hugeicons/react';
import {
  FilterIcon,
  Grid3X3Icon,
  LeftToRightListBulletIcon,
  Image01Icon,
  Video01Icon,
  MusicNote01Icon,
  Link02Icon,
  File01Icon,
  FolderOpenIcon,
  NotebookIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ResourceType } from '@/types';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ReactNode } from 'react';
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
    { type: 'notebook', label: t('filter.types.notebooks'), icon: <HugeiconsIcon icon={NotebookIcon} size={14} /> },
    { type: 'image', label: t('filter.types.images'), icon: <HugeiconsIcon icon={Image01Icon} size={14} /> },
    { type: 'video', label: t('filter.types.videos'), icon: <HugeiconsIcon icon={Video01Icon} size={14} /> },
    { type: 'audio', label: t('filter.types.audio'), icon: <HugeiconsIcon icon={MusicNote01Icon} size={14} /> },
    { type: 'pdf', label: t('filter.types.pdfs'), icon: <HugeiconsIcon icon={File01Icon} size={14} /> },
    { type: 'url', label: t('filter.types.links'), icon: <HugeiconsIcon icon={Link02Icon} size={14} /> },
    { type: 'excel', label: t('filter.types.excel'), icon: <HugeiconsIcon icon={File01Icon} size={14} /> },
    { type: 'ppt', label: t('filter.types.presentations'), icon: <HugeiconsIcon icon={File01Icon} size={14} /> },
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
          <Select value={sortBy ?? null} onValueChange={(next) => { if (next != null) (onSortByChange)(next); }} items={[
              { value: 'updated_at', label: t('filter.sort.recently_updated') },
              { value: 'created_at', label: t('filter.sort.date_created') },
              { value: 'title', label: t('filter.sort.alphabetical') },
            ]}><SelectTrigger className="w-fit" aria-label={t('filter.sort_by')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectGroup>{([
              { value: 'updated_at', label: t('filter.sort.recently_updated') },
              { value: 'created_at', label: t('filter.sort.date_created') },
              { value: 'title', label: t('filter.sort.alphabetical') },
            ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select>
        </div>

        {/* Filter button */}
        <Popover open={showFilterDropdown} onOpenChange={setShowFilterDropdown}>
          <PopoverTrigger render={<button
            type="button"
            className={`filter-btn min-h-[44px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${activeFilterCount > 0 ? 'active' : ''}`}
            aria-label={t('filter.filter_by_type')}
          />}>
            <HugeiconsIcon icon={FilterIcon} size={16} />
            <span>{t('filter.filter')}</span>
            {activeFilterCount > 0 ? (
              <span className="filter-count">{activeFilterCount}</span>
            ) : null}
          </PopoverTrigger>

          <PopoverContent align="start" className="filter-dropdown w-auto gap-0 p-0">
              <div className="filter-dropdown-header">
                <span>{t('filter.filter_by_type')}</span>
                {activeFilterCount > 0 ? (
                  <button type="button" className="clear-btn cursor-pointer" onClick={clearFilters} aria-label={t('filter.clear_all')}>
                    {t('filter.clear_all')}
                  </button>
                ) : null}
              </div>
              <div className="filter-options">
                {RESOURCE_TYPES.map(({ type, label, icon }) => (
                  <button
                    type="button"
                    key={type}
                    className={`filter-option cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${selectedTypes.includes(type) ? 'selected' : ''}`}
                    onClick={() => toggleType(type)}
                    aria-label={`Filter by ${label}`}
                    aria-pressed={selectedTypes.includes(type)}
                  >
                    {icon}
                    <span>{label}</span>
                    {selectedTypes.includes(type) && <HugeiconsIcon icon={Cancel01Icon} size={12} className="remove-icon" />}
                  </button>
                ))}
              </div>
          </PopoverContent>
        </Popover>

        {/* Active filter chips */}
        {activeFilterCount > 0 ? (
          <div className="active-filters">
            {selectedTypes.map((type) => {
              const typeInfo = RESOURCE_TYPES.find((t) => t.type === type);
              return (
                <button
                  type="button"
                  key={type}
                  className="filter-chip cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  onClick={() => toggleType(type)}
                  aria-label={`Remove ${typeInfo?.label ?? type} filter`}
                >
                  {typeInfo?.icon}
                  <span>{typeInfo?.label}</span>
                  <HugeiconsIcon icon={Cancel01Icon} size={12} />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="filter-bar-right">
        {/* Create Folder button */}
        {onCreateFolder && (
          <Button type="button" size="sm" className="min-h-[44px]" onClick={onCreateFolder} aria-label={t('filter.new_folder')}>
            <HugeiconsIcon icon={FolderOpenIcon} size={16} />
            {t('filter.new_folder')}
          </Button>
        )}

        {/* View mode toggle */}
        <ToggleGroup
          value={[viewMode]}
          onValueChange={(values) => { const next = values[0] as 'grid' | 'list' | undefined; if (next) onViewModeChange(next); }}
        >
          <ToggleGroupItem value="grid" className="min-w-[44px] min-h-[44px]" aria-label={t('filter.grid_view')}>
            <HugeiconsIcon icon={Grid3X3Icon} size={16} />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" className="min-w-[44px] min-h-[44px]" aria-label={t('filter.list_view')}>
            <HugeiconsIcon icon={LeftToRightListBulletIcon} size={16} />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

    </div>
  );
}

export default FilterBar;
