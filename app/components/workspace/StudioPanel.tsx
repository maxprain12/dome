
import { useState, useEffect, useCallback } from 'react';
import { Trash2, Eye, Loader2 } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import type { StudioOutputType, StudioOutput } from '@/types';

interface StudioTile {
  type: StudioOutputType | 'flashcards';
  icon: string;
  title: string;
  description: string;
  comingSoon?: boolean;
}

const STUDIO_TILES: StudioTile[] = [
  {
    type: 'mindmap',
    icon: '\uD83E\uDDE0',
    title: 'Mind Map',
    description: 'Visual knowledge map',
  },
  {
    type: 'flashcards',
    icon: '\uD83C\uDCCF',
    title: 'Flashcards',
    description: 'Spaced repetition',
  },
  {
    type: 'quiz',
    icon: '\u2753',
    title: 'Quiz',
    description: 'Test your knowledge',
  },
  {
    type: 'guide',
    icon: '\uD83D\uDCD6',
    title: 'Study Guide',
    description: 'Structured summary',
  },
  {
    type: 'faq',
    icon: '\uD83D\uDCAC',
    title: 'FAQ',
    description: 'Q&A from sources',
  },
  {
    type: 'timeline',
    icon: '\uD83D\uDCC5',
    title: 'Timeline',
    description: 'Chronological events',
  },
  {
    type: 'table',
    icon: '\uD83D\uDCCA',
    title: 'Data Table',
    description: 'Structured data',
  },
  {
    type: 'audio',
    icon: '\uD83C\uDF99\uFE0F',
    title: 'Audio Overview',
    description: 'Listen to a summary',
    comingSoon: true,
  },
];

const TYPE_ICONS: Record<string, string> = {
  mindmap: '\uD83E\uDDE0',
  quiz: '\u2753',
  guide: '\uD83D\uDCD6',
  faq: '\uD83D\uDCAC',
  timeline: '\uD83D\uDCC5',
  table: '\uD83D\uDCCA',
  flashcards: '\uD83C\uDCCF',
  audio: '\uD83C\uDF99\uFE0F',
};

export default function StudioPanel() {
  const currentProject = useAppStore((s) => s.currentProject);
  const studioOutputs = useAppStore((s) => s.studioOutputs);
  const setStudioOutputs = useAppStore((s) => s.setStudioOutputs);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const removeStudioOutput = useAppStore((s) => s.removeStudioOutput);

  const [loadingOutputs, setLoadingOutputs] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load saved studio outputs for the current project
  useEffect(() => {
    async function loadOutputs() {
      if (!currentProject?.id || typeof window === 'undefined' || !window.electron) return;

      try {
        setLoadingOutputs(true);
        const result = await window.electron.db.studio.getByProject(currentProject.id);
        if (result.success && result.data) {
          setStudioOutputs(result.data);
        }
      } catch (err) {
        console.error('Failed to load studio outputs:', err);
      } finally {
        setLoadingOutputs(false);
      }
    }

    loadOutputs();
  }, [currentProject?.id, setStudioOutputs]);

  const handleTileClick = useCallback((type: string) => {
    if (type === 'flashcards') {
      // Flashcards are handled separately via the sidebar
      const setSection = useAppStore.getState().setHomeSidebarSection;
      setSection('flashcards');
      return;
    }

    // For studio output types, send a message to the AI chat to generate the output.
    // The AI chat system will handle creation and call addStudioOutput when done.
    // For now, we trigger a custom event that the chat panel can listen for.
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('studio:generate', {
        detail: {
          type,
          projectId: currentProject?.id,
        },
      });
      window.dispatchEvent(event);
    }
  }, [currentProject?.id]);

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

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className="flex flex-col border-l shrink-0"
      style={{
        width: '300px',
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--secondary-text)' }}
        >
          Studio
        </h3>
      </div>

      {/* Tiles grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {STUDIO_TILES.map((tile) => (
            <button
              key={tile.type}
              onClick={() => {
                if (!tile.comingSoon) {
                  handleTileClick(tile.type);
                }
              }}
              className="flex flex-col items-start gap-1.5 p-3 rounded-lg text-left transition-all duration-150 relative"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                cursor: tile.comingSoon ? 'default' : 'pointer',
                opacity: tile.comingSoon ? 0.6 : 1,
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
              disabled={tile.comingSoon}
              title={tile.comingSoon ? 'Coming soon' : `Generate ${tile.title}`}
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
              <span className="text-xl leading-none">{tile.icon}</span>

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

        {/* Saved Outputs */}
        {studioOutputs.length > 0 && (
          <div className="mt-4">
            <h4
              className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Generated outputs
            </h4>
            <div className="flex flex-col gap-1.5">
              {studioOutputs.map((output) => (
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
                  <span className="text-base leading-none shrink-0">
                    {TYPE_ICONS[output.type] || '\uD83D\uDCC4'}
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
        {!loadingOutputs && studioOutputs.length === 0 && (
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
