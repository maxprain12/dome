'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  EyeIcon,
  Loading03Icon,
  Cancel01Icon,
  File02Icon,
} from '@hugeicons/core-free-icons';
import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useStudioGenerate } from '@/lib/hooks/useStudioGenerate';
import { useStudioOutputs } from '@/lib/hooks/useStudioOutputs';
import { useSourceTitles } from '@/lib/hooks/useSourceTitles';
import { STUDIO_TILES, STUDIO_TYPE_ICONS } from '@/lib/studio/constants';
import GenerateSourceModal from '@/components/studio/GenerateSourceModal';
import type { StudioOutputType, StudioOutput } from '@/types';
import { formatShortDistance } from '@/lib/utils';

function parseSourceIds(output: StudioOutput): string[] {
  const raw = output.source_ids;
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

interface StudioPanelProps {
  projectId?: string | null;
  resourceId?: string | null;
  embedded?: boolean;
}

function formatStudioDate(timestamp: number): string {
  return formatShortDistance(timestamp);
}

export default function StudioPanel({ projectId: projectIdProp, resourceId, embedded = false }: StudioPanelProps = {}) {
  const { t } = useTranslation();
  const currentProject = useAppStore((s) => s.currentProject);
  const studioOutputs = useAppStore((s) => s.studioOutputs);
  const _setStudioOutputs = useAppStore((s) => s.setStudioOutputs);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const _addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const removeStudioOutput = useAppStore((s) => s.removeStudioOutput);

  const effectiveProjectId = projectIdProp ?? currentProject?.id;

  const { generate, isGenerating, generatingType } = useStudioGenerate({
    projectId: effectiveProjectId,
    resourceId,
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

  const allSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of filteredOutputs) {
      for (const id of parseSourceIds(o)) ids.add(id);
    }
    return Array.from(ids);
  }, [filteredOutputs]);

  const { titles: sourceTitles } = useSourceTitles(allSourceIds);

  const { isLoading: loadingOutputs } = useStudioOutputs(effectiveProjectId);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingGenerateType, setPendingGenerateType] = useState<StudioOutputType | null>(null);

  const handleTileClick = useCallback((type: string) => {
    if (!type) return;
    setPendingGenerateType(type as StudioOutputType);
  }, []);

  const handleModalConfirm = useCallback(
    async (sourceIds: string[]) => {
      if (!pendingGenerateType) return;
      await generate(pendingGenerateType, sourceIds);
      setPendingGenerateType(null);
    },
    [pendingGenerateType, generate]
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

  return (
    <div
      className={embedded ? 'flex h-full min-w-0 flex-col' : 'flex shrink-0 flex-col border-l'}
      style={embedded ? undefined : {
        width: 'min(25vw, 320px)',
        minWidth: '260px',
        background: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border"
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t('studio.title')}
        </h3>
        <button
          type="button"
          onClick={() => useAppStore.getState().toggleStudioPanel()}
          className="p-1.5 rounded-lg transition-all duration-200 hover:bg-accent opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          style={{ color: 'var(--muted-foreground)' }}
          aria-label={t('studio.close_studio_panel')}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </button>
      </div>

      <GenerateSourceModal
        isOpen={pendingGenerateType !== null}
        onClose={() => setPendingGenerateType(null)}
        onConfirm={handleModalConfirm}
        projectId={effectiveProjectId ?? null}
        tileTitle={
          pendingGenerateType
            ? (STUDIO_TILES.find((t) => t.type === pendingGenerateType)?.title ?? pendingGenerateType)
            : ''
        }
        focusResourceId={resourceId ?? null}
      />

      {/* Tiles grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {STUDIO_TILES.map((tile) => (
            <button
              type="button"
              key={tile.type}
              onClick={() => {
                if (!tile.comingSoon && !isGenerating) {
                  handleTileClick(tile.type);
                }
              }}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-lg text-left transition-colors duration-200 relative border border-border focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none ${
                tile.comingSoon || isGenerating
                  ? 'cursor-default'
                  : 'hover:border-primary hover:bg-muted cursor-pointer'
              }`}
              style={{
                background: 'var(--background)',
                opacity: tile.comingSoon ? 0.6 : isGenerating ? 0.8 : 1,
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
                    background: 'var(--accent)',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  Soon
                </span>
              )}

              {/* Icon */}
              <span className="leading-none shrink-0 flex items-center text-muted-foreground">
                {isGenerating && generatingType === tile.type ? (
                  <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                ) : (
                  tile.icon
                )}
              </span>

              {/* Title */}
              <span
                className="text-xs font-medium leading-tight text-foreground"
              >
                {tile.title}
              </span>

              {/* Description */}
              <span
                className="text-[10px] leading-tight text-muted-foreground"
              >
                {isGenerating && generatingType === tile.type
                  ? `Generando ${tile.title}...`
                  : tile.description}
              </span>
            </button>
          ))}
        </div>

        {/* Saved Outputs - filtered by resource when in workspace */}
        {filteredOutputs.length > 0 && (
          <div className="mt-4">
            <h4
              className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1 text-muted-foreground"
            >
              {resourceId ? 'Outputs de este recurso' : 'Generated outputs'}
            </h4>
            <div className="flex flex-col gap-1.5">
              {filteredOutputs.map((output) => (
                <div
                  key={output.id}
                  className="flex items-center gap-2 p-2 rounded-lg group transition-colors duration-200 border border-border hover:border-primary content-visibility-auto bg-background"
                >
                  {/* Type icon */}
                  <span
                    className="leading-none shrink-0 flex items-center text-muted-foreground"
                  >
                    {STUDIO_TYPE_ICONS[output.type] || <HugeiconsIcon icon={File02Icon} size={16} />}
                  </span>

                  {/* Title and date */}
                  <button
                    type="button"
                    onClick={() => handleViewOutput(output)}
                    className="flex-1 min-w-0 text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
                    title={`View ${output.title}`}
                    aria-label={`View ${output.title}`}
                  >
                    <div
                      className="text-xs font-medium truncate text-foreground"
                    >
                      {output.title}
                    </div>
                    <div
                      className="text-[10px] text-muted-foreground"
                    >
                      {formatStudioDate(output.created_at)}
                    </div>
                    {(() => {
                      const ids = parseSourceIds(output);
                      const names = ids.length > 0
                        ? ids.map((id) => sourceTitles.get(id) || id.slice(0, 8) + '…').filter(Boolean)
                        : [];
                      return (
                        <div className="text-[9px] mt-0.5 truncate text-muted-foreground" title={names.join(', ') || undefined}>
                          {names.length > 0 ? `Fuentes: ${names.join(', ')}` : 'Sin fuentes específicas'}
                        </div>
                      );
                    })()}
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      type="button"
                      onClick={() => handleViewOutput(output)}
                      variant="ghost" className="p-2.5 min-h-[44px] min-w-[44px] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      title="View"
                      aria-label={`View ${output.title}`}
                    >
                      <HugeiconsIcon icon={EyeIcon} size={13} className="text-muted-foreground" />
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleDeleteOutput(output.id)}
                      variant="ghost" className="p-2.5 min-h-[44px] min-w-[44px] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      title="Delete"
                      aria-label={`Delete ${output.title}`}
                      disabled={deletingId === output.id}
                    >
                      {deletingId === output.id ? (
                        <HugeiconsIcon icon={Loading03Icon}
                          size={13}
                          className="animate-spin text-muted-foreground"
                        />
                      ) : (
                        <HugeiconsIcon icon={Delete02Icon} size={13} className="text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state for outputs */}
        {loadingOutputs && (
          <div className="flex items-center justify-center py-4">
            <HugeiconsIcon icon={Loading03Icon}
              className="size-4 animate-spin text-muted-foreground"
            />
            <span
              className="text-xs ml-2 text-muted-foreground"
            >
              Loading outputs...
            </span>
          </div>
        )}

        {/* Empty state */}
        {!loadingOutputs && filteredOutputs.length === 0 ? (
          <div className="mt-4 px-2">
            <p
              className="text-[10px] text-center text-muted-foreground"
            >
              Click a tile above to generate study materials from your sources.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
