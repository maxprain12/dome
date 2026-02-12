'use client';

import { useState, useCallback, useMemo } from 'react';
import { Trash2, Eye, Loader2, X, FileText } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { useStudioGenerate } from '@/lib/hooks/useStudioGenerate';
import { useStudioOutputs } from '@/lib/hooks/useStudioOutputs';
import { STUDIO_TILES, STUDIO_TYPE_ICONS } from '@/lib/studio/constants';
import type { StudioOutputType, StudioOutput } from '@/types';
import { formatShortDistance } from '@/lib/utils';

interface StudioPanelProps {
  projectId?: string | null;
  resourceId?: string | null;
}

export default function StudioPanel({ projectId: projectIdProp, resourceId }: StudioPanelProps = {}) {
  const currentProject = useAppStore((s) => s.currentProject);
  const selectedSourceIds = useAppStore((s) => s.selectedSourceIds);
  const studioOutputs = useAppStore((s) => s.studioOutputs);
  const setStudioOutputs = useAppStore((s) => s.setStudioOutputs);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const removeStudioOutput = useAppStore((s) => s.removeStudioOutput);

  const effectiveProjectId = projectIdProp ?? currentProject?.id;

  const { generate, isGenerating } = useStudioGenerate({
    projectId: effectiveProjectId,
    resourceId,
    selectedSourceIds: selectedSourceIds.length > 0 ? selectedSourceIds : (resourceId ? [resourceId] : undefined),
  });

  // Filter outputs to show only those associated with this resource (resource_id or source_ids)
  const filteredOutputs = useMemo(() => {
    if (!resourceId) return studioOutputs;
    return studioOutputs.filter((output) => {
      if (output.resource_id === resourceId) return true;
      const sourceIds = output.source_ids
        ? (typeof output.source_ids === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(output.source_ids);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : [])
        : [];
      return sourceIds.includes(resourceId);
    });
  }, [studioOutputs, resourceId]);

  const { isLoading: loadingOutputs } = useStudioOutputs(effectiveProjectId);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleTileClick = useCallback(
    async (type: string) => {
      await generate(type as StudioOutputType);
    },
    [generate],
  );

  const handleViewOutput = useCallback((output: StudioOutput) => {
    setActiveStudioOutput(output);
  }, [setActiveStudioOutput]);

  const handleDeleteOutput = useCallback(async (id: string) => {
    if (typeof window === 'undefined' || !window.electron) return;

    try {
      setDeletingId(id);
      const result = await window.electron.db.studio.delete(id);
      if (result.success) {
        removeStudioOutput(id);
      }
    } catch (err) {
      console.error('Failed to delete studio output:', err);
    } finally {
      setDeletingId(null);
    }
  }, [removeStudioOutput]);

  const formatDate = (timestamp: number): string => formatShortDistance(timestamp);

  return (
    <div
      className="flex flex-col border-l shrink-0 transition-all duration-300 ease-out"
      style={{
        width: 'min(25vw, 320px)',
        minWidth: '260px',
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--secondary-text)' }}
        >
          Studio
        </h3>
        <button
          onClick={() => useAppStore.getState().toggleStudioPanel()}
          className="p-1.5 rounded-lg transition-all duration-200 hover:bg-[var(--bg-hover)] opacity-70 hover:opacity-100"
          style={{ color: 'var(--secondary-text)' }}
          aria-label="Close studio panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tiles grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {STUDIO_TILES.map((tile) => (
            <button
              key={tile.type}
              onClick={() => {
                if (!tile.comingSoon && !isGenerating) {
                  handleTileClick(tile.type);
                }
              }}
              className="flex flex-col items-start gap-1.5 p-3 rounded-lg text-left transition-all duration-150 relative"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                cursor: tile.comingSoon || isGenerating ? 'default' : 'pointer',
                opacity: tile.comingSoon ? 0.6 : isGenerating ? 0.8 : 1,
              }}
              onMouseEnter={(e) => {
                if (!tile.comingSoon) {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.background = 'var(--bg)';
              }}
              disabled={tile.comingSoon || isGenerating}
              title={
                tile.comingSoon
                  ? 'Coming soon'
                  : isGenerating
                    ? 'Generating...'
                    : tile.criteria ?? `Generate ${tile.title}`
              }
            >
              {/* Coming soon badge */}
              {tile.comingSoon && (
                <span
                  className="absolute top-1.5 right-1.5 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                  style={{
                    background: 'var(--bg-hover)',
                    color: 'var(--tertiary-text)',
                  }}
                >
                  Soon
                </span>
              )}

              {/* Icon */}
              <span className="leading-none shrink-0" style={{ color: 'var(--secondary-text)' }}>
                {tile.icon}
              </span>

              {/* Title */}
              <span
                className="text-xs font-medium leading-tight"
                style={{ color: 'var(--primary-text)' }}
              >
                {tile.title}
              </span>

              {/* Description */}
              <span
                className="text-[10px] leading-tight"
                style={{ color: 'var(--tertiary-text)' }}
              >
                {tile.description}
              </span>
            </button>
          ))}
        </div>

        {/* Saved Outputs - filtered by resource when in workspace */}
        {filteredOutputs.length > 0 && (
          <div className="mt-4">
            <h4
              className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1"
              style={{ color: 'var(--tertiary-text)' }}
            >
              {resourceId ? 'Outputs de este recurso' : 'Generated outputs'}
            </h4>
            <div className="flex flex-col gap-1.5">
              {filteredOutputs.map((output) => (
                <div
                  key={output.id}
                  className="flex items-center gap-2 p-2 rounded-lg group transition-all duration-150"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  {/* Type icon */}
                  <span
                    className="leading-none shrink-0 flex items-center"
                    style={{ color: 'var(--secondary-text)' }}
                  >
                    {STUDIO_TYPE_ICONS[output.type] || <FileText size={16} />}
                  </span>

                  {/* Title and date */}
                  <button
                    onClick={() => handleViewOutput(output)}
                    className="flex-1 min-w-0 text-left"
                    title={`View ${output.title}`}
                  >
                    <div
                      className="text-xs font-medium truncate"
                      style={{ color: 'var(--primary-text)' }}
                    >
                      {output.title}
                    </div>
                    <div
                      className="text-[10px]"
                      style={{ color: 'var(--tertiary-text)' }}
                    >
                      {formatDate(output.created_at)}
                    </div>
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleViewOutput(output)}
                      className="btn btn-ghost p-1"
                      title="View"
                    >
                      <Eye size={13} style={{ color: 'var(--secondary-text)' }} />
                    </button>
                    <button
                      onClick={() => handleDeleteOutput(output.id)}
                      className="btn btn-ghost p-1"
                      title="Delete"
                      disabled={deletingId === output.id}
                    >
                      {deletingId === output.id ? (
                        <Loader2
                          size={13}
                          className="animate-spin"
                          style={{ color: 'var(--tertiary-text)' }}
                        />
                      ) : (
                        <Trash2 size={13} style={{ color: 'var(--error)' }} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state for outputs */}
        {loadingOutputs && (
          <div className="flex items-center justify-center py-4">
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: 'var(--tertiary-text)' }}
            />
            <span
              className="text-xs ml-2"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Loading outputs...
            </span>
          </div>
        )}

        {/* Empty state */}
        {!loadingOutputs && filteredOutputs.length === 0 && (
          <div className="mt-4 px-2">
            <p
              className="text-[10px] text-center"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Click a tile above to generate study materials from your sources.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
