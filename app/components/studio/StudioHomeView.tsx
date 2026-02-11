'use client';

import { useState, useCallback } from 'react';
import {
  Trash2,
  Eye,
  Loader2,
  Brain,
  BookOpen,
  HelpCircle,
  MessageCircleQuestion,
  CalendarRange,
  Table2,
  Headphones,
  WalletCards,
  FileText,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { useStudioGenerate } from '@/lib/hooks/useStudioGenerate';
import { useStudioOutputs } from '@/lib/hooks/useStudioOutputs';
import { STUDIO_TILES, STUDIO_TYPE_ICONS } from '@/lib/studio/constants';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import type { StudioOutputType, StudioOutput } from '@/types';
import { formatShortDistance } from '@/lib/utils';

export default function StudioHomeView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const selectedSourceIds = useAppStore((s) => s.selectedSourceIds);
  const studioOutputs = useAppStore((s) => s.studioOutputs);
  const setStudioOutputs = useAppStore((s) => s.setStudioOutputs);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const removeStudioOutput = useAppStore((s) => s.removeStudioOutput);

  const effectiveProjectId = currentProject?.id ?? 'default';

  const { generate, isGenerating } = useStudioGenerate({
    projectId: effectiveProjectId,
    selectedSourceIds,
  });

  const { isLoading: loadingOutputs } = useStudioOutputs(effectiveProjectId);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeOutput, setActiveOutput] = useState<StudioOutput | null>(null);

  const handleTileClick = useCallback(
    async (type: string) => {
      await generate(type as StudioOutputType);
    },
    [generate],
  );

  const handleViewOutput = useCallback((output: StudioOutput) => {
    setActiveStudioOutput(output);
    setActiveOutput(output);
  }, [setActiveStudioOutput]);

  const handleDeleteOutput = useCallback(async (id: string) => {
    if (typeof window === 'undefined' || !window.electron) return;

    try {
      setDeletingId(id);
      const result = await window.electron.db.studio.delete(id);
      if (result.success) {
        removeStudioOutput(id);
        if (activeOutput?.id === id) {
          setActiveOutput(null);
          setActiveStudioOutput(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete studio output:', err);
    } finally {
      setDeletingId(null);
    }
  }, [removeStudioOutput, activeOutput, setActiveStudioOutput]);

  const handleCloseViewer = useCallback(() => {
    setActiveOutput(null);
    setActiveStudioOutput(null);
  }, [setActiveStudioOutput]);

  const formatDate = (timestamp: number): string => formatShortDistance(timestamp);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* Studio Output Viewer Overlay */}
      {activeOutput && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
          <StudioOutputViewer output={activeOutput} onClose={handleCloseViewer} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {/* Tiles grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {STUDIO_TILES.map((tile) => (
              <button
                key={tile.type}
                onClick={() => {
                  if (!tile.comingSoon && !isGenerating) {
                    handleTileClick(tile.type);
                  }
                }}
                className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all duration-150 relative"
                style={{
                  background: 'var(--dome-surface)',
                  border: '1px solid var(--dome-border)',
                  cursor: tile.comingSoon || isGenerating ? 'default' : 'pointer',
                  opacity: tile.comingSoon ? 0.6 : isGenerating ? 0.8 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!tile.comingSoon) {
                    e.currentTarget.style.borderColor = 'var(--dome-accent)';
                    e.currentTarget.style.background = 'var(--dome-accent-bg)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--dome-border)';
                  e.currentTarget.style.background = 'var(--dome-surface)';
                }}
                disabled={tile.comingSoon || isGenerating}
                title={tile.criteria ?? `Generate ${tile.title}`}
              >
                {tile.comingSoon && (
                  <span
                    className="absolute top-2 right-2 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--dome-bg)',
                      color: 'var(--dome-text-muted)',
                    }}
                  >
                    Soon
                  </span>
                )}
                <span className="leading-none shrink-0" style={{ color: 'var(--dome-accent)' }}>
                  {tile.icon}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                  {tile.title}
                </span>
                <span className="text-xs" style={{ color: 'var(--dome-text-secondary)' }}>
                  {tile.description}
                </span>
              </button>
            ))}
          </div>

          {/* Outputs list */}
          <section>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--dome-text)' }}>
              Materiales generados
            </h3>
            {loadingOutputs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dome-accent)' }} />
                <span className="text-sm ml-2" style={{ color: 'var(--dome-text-secondary)' }}>
                  Cargando...
                </span>
              </div>
            ) : studioOutputs.length === 0 ? (
              <div
                className="rounded-xl p-8 text-center"
                style={{
                  background: 'var(--dome-surface)',
                  border: '1px dashed var(--dome-border)',
                }}
              >
                <p className="text-sm" style={{ color: 'var(--dome-text-secondary)' }}>
                  Haz clic en un tile arriba para generar materiales de estudio desde tus recursos.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {studioOutputs.map((output) => (
                  <div
                    key={output.id}
                    className="flex items-center gap-3 p-3 rounded-lg group transition-all"
                    style={{
                      background: 'var(--dome-surface)',
                      border: '1px solid var(--dome-border)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--dome-accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--dome-border)';
                    }}
                  >
                    <span className="shrink-0" style={{ color: 'var(--dome-text-secondary)' }}>
                      {STUDIO_TYPE_ICONS[output.type] || <FileText size={16} />}
                    </span>
                    <button
                      onClick={() => handleViewOutput(output)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                        {output.title}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                        {formatDate(output.created_at)}
                        {output.type === 'flashcards' && output.deck_card_count != null && (
                          <> · {output.deck_card_count} tarjetas</>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleViewOutput(output)}
                        className="btn btn-ghost p-1.5"
                        title="Ver"
                      >
                        <Eye size={14} style={{ color: 'var(--dome-text-secondary)' }} />
                      </button>
                      <button
                        onClick={() => handleDeleteOutput(output.id)}
                        className="btn btn-ghost p-1.5"
                        title="Eliminar"
                        disabled={deletingId === output.id}
                      >
                        {deletingId === output.id ? (
                          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                        ) : (
                          <Trash2 size={14} style={{ color: 'var(--error)' }} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
