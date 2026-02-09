import { useState } from 'react';
import { Search, SlidersHorizontal, Layout, Download, X } from 'lucide-react';
import type { GraphLayoutType, GraphFilterOptions } from '@/types';

interface GraphToolbarProps {
  layout: GraphLayoutType;
  onLayoutChange: (layout: GraphLayoutType) => void;
  filters: GraphFilterOptions;
  onFiltersChange: (filters: GraphFilterOptions) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  nodeCount: number;
  edgeCount: number;
  onExportPNG?: () => void;
  onExportJSON?: () => void;
}

export default function GraphToolbar({
  layout,
  onLayoutChange,
  filters,
  onFiltersChange,
  depth,
  onDepthChange,
  nodeCount,
  edgeCount,
  onExportPNG,
  onExportJSON,
}: GraphToolbarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [searchQuery, setSearchQuery] = useState(filters.searchQuery || '');

  const layouts: Array<{ value: GraphLayoutType; label: string }> = [
    { value: 'force', label: 'Force' },
    { value: 'hierarchical', label: 'Hierarchical' },
    { value: 'circular', label: 'Circular' },
    { value: 'radial', label: 'Radial' },
  ];

  const relationTypes = [
    { value: 'mentions', label: 'Mentions' },
    { value: 'references', label: 'References' },
    { value: 'similar', label: 'Similar' },
    { value: 'related', label: 'Related' },
    { value: 'shared_tags', label: 'Shared Tags' },
  ];

  const nodeTypes = [
    { value: 'resource', label: 'Resources' },
    { value: 'concept', label: 'Concepts' },
    { value: 'person', label: 'People' },
    { value: 'location', label: 'Locations' },
    { value: 'event', label: 'Events' },
  ];

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onFiltersChange({ ...filters, searchQuery: value || undefined });
  };

  const handleRelationToggle = (relationType: string) => {
    const current = filters.relationTypes || [];
    const updated = current.includes(relationType)
      ? current.filter(t => t !== relationType)
      : [...current, relationType];

    onFiltersChange({
      ...filters,
      relationTypes: updated.length > 0 ? updated : undefined,
    });
  };

  const handleNodeTypeToggle = (nodeType: string) => {
    const current = filters.nodeTypes || [];
    const updated = current.includes(nodeType as any)
      ? current.filter(t => t !== nodeType)
      : [...current, nodeType as any];

    onFiltersChange({
      ...filters,
      nodeTypes: updated.length > 0 ? updated as any : undefined,
    });
  };

  const handleWeightChange = (value: number) => {
    onFiltersChange({
      ...filters,
      minWeight: value,
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    onFiltersChange({});
  };

  const hasActiveFilters = !!(
    filters.searchQuery ||
    (filters.relationTypes && filters.relationTypes.length > 0) ||
    (filters.nodeTypes && filters.nodeTypes.length > 0) ||
    (filters.minWeight && filters.minWeight > 0.3)
  );

  return (
    <div className="border-b border-[var(--border)]" style={{ background: 'var(--bg-secondary)' }}>
      {/* Main toolbar */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--tertiary-text)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-[var(--border)] outline-none focus:border-[var(--accent)]"
            style={{
              background: 'var(--bg)',
              color: 'var(--primary-text)',
            }}
          />
        </div>

        {/* Layout selector */}
        <select
          value={layout}
          onChange={(e) => onLayoutChange(e.target.value as GraphLayoutType)}
          className="px-3 py-1.5 text-xs rounded-md border border-[var(--border)] outline-none cursor-pointer"
          style={{
            background: 'var(--bg)',
            color: 'var(--primary-text)',
          }}
        >
          {layouts.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>

        {/* Depth slider */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-md border border-[var(--border)]" style={{ background: 'var(--bg)' }}>
          <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>
            Depth:
          </span>
          <input
            type="range"
            min="1"
            max="3"
            value={depth}
            onChange={(e) => onDepthChange(parseInt(e.target.value))}
            className="w-16"
          />
          <span className="text-xs font-medium w-3" style={{ color: 'var(--primary-text)' }}>
            {depth}
          </span>
        </div>

        {/* Filters button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] transition-colors hover:bg-[var(--bg-hover)]"
          style={{
            background: showFilters ? 'var(--bg-hover)' : 'var(--bg)',
            color: hasActiveFilters ? 'var(--accent)' : 'var(--secondary-text)',
          }}
        >
          <SlidersHorizontal size={14} />
          Filters
          {hasActiveFilters && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
          )}
        </button>

        {/* Export button */}
        <div className="relative">
          <button
            onClick={() => setShowExport(!showExport)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              background: showExport ? 'var(--bg-hover)' : 'var(--bg)',
              color: 'var(--secondary-text)',
            }}
          >
            <Download size={14} />
            Export
          </button>

          {showExport && (
            <div
              className="absolute right-0 top-full mt-1 w-32 rounded-lg border border-[var(--border)] shadow-lg z-50"
              style={{ background: 'var(--bg)' }}
            >
              <button
                onClick={() => {
                  onExportPNG?.();
                  setShowExport(false);
                }}
                className="w-full px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--bg-hover)] rounded-t-lg"
                style={{ color: 'var(--primary-text)' }}
              >
                Export as PNG
              </button>
              <button
                onClick={() => {
                  onExportJSON?.();
                  setShowExport(false);
                }}
                className="w-full px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--bg-hover)] rounded-b-lg"
                style={{ color: 'var(--primary-text)' }}
              >
                Export as JSON
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="text-xs px-3 py-1.5" style={{ color: 'var(--tertiary-text)' }}>
          {nodeCount} nodes, {edgeCount} edges
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="px-4 py-3 border-t border-[var(--border)]">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
              Filter Graph
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs flex items-center gap-1 transition-colors"
                style={{ color: 'var(--accent)' }}
              >
                <X size={12} />
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Relation types */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--secondary-text)' }}>
                Relation Types
              </label>
              <div className="space-y-1.5">
                {relationTypes.map((type) => (
                  <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.relationTypes?.includes(type.value) || false}
                      onChange={() => handleRelationToggle(type.value)}
                      className="w-3 h-3 rounded border-[var(--border)]"
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--primary-text)' }}>
                      {type.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Node types */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--secondary-text)' }}>
                Node Types
              </label>
              <div className="space-y-1.5">
                {nodeTypes.map((type) => (
                  <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.nodeTypes?.includes(type.value as any) || false}
                      onChange={() => handleNodeTypeToggle(type.value)}
                      className="w-3 h-3 rounded border-[var(--border)]"
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--primary-text)' }}>
                      {type.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Weight slider */}
          <div className="mt-4">
            <label className="text-xs font-medium mb-2 flex items-center justify-between" style={{ color: 'var(--secondary-text)' }}>
              <span>Minimum Weight</span>
              <span style={{ color: 'var(--primary-text)' }}>
                {(filters.minWeight || 0.3).toFixed(1)}
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={filters.minWeight || 0.3}
              onChange={(e) => handleWeightChange(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--tertiary-text)' }}>
              <span>Weak</span>
              <span>Strong</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
