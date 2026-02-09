
import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  File,
  Video,
  Music,
  Image,
  Link2,
  Plus,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { type Resource } from '@/types';

interface SourcesPanelProps {
  resourceId: string;
  projectId: string;
}

function getTypeIcon(type: string, size = 14) {
  const props = { size, className: 'shrink-0' };
  switch (type) {
    case 'note':
      return <FileText {...props} />;
    case 'pdf':
      return <File {...props} />;
    case 'video':
      return <Video {...props} />;
    case 'audio':
      return <Music {...props} />;
    case 'image':
      return <Image {...props} />;
    case 'url':
      return <Link2 {...props} />;
    case 'document':
      return <File {...props} />;
    default:
      return <File {...props} />;
  }
}

export default function SourcesPanel({ resourceId, projectId }: SourcesPanelProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const selectedSourceIds = useAppStore((s) => s.selectedSourceIds);
  const toggleSourceId = useAppStore((s) => s.toggleSourceId);
  const selectAllSources = useAppStore((s) => s.selectAllSources);
  const deselectAllSources = useAppStore((s) => s.deselectAllSources);

  // Fetch resources for this project
  useEffect(() => {
    async function fetchResources() {
      if (!projectId || typeof window === 'undefined' || !window.electron) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const result = await window.electron.db.resources.getByProject(projectId);
        if (result.success && result.data) {
          // Filter out folders
          const filtered = result.data.filter((r: Resource) => r.type !== 'folder');
          setResources(filtered);
        }
      } catch (err) {
        console.error('Error fetching project resources:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchResources();
  }, [projectId]);

  const allSelected = resources.length > 0 && selectedSourceIds.length === resources.length;
  const someSelected = selectedSourceIds.length > 0 && selectedSourceIds.length < resources.length;

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      deselectAllSources();
    } else {
      selectAllSources(resources.map((r) => r.id));
    }
  }, [allSelected, resources, selectAllSources, deselectAllSources]);

  const handleAddSource = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;
    try {
      const filePaths = await window.electron.selectFiles();
      if (filePaths && filePaths.length > 0) {
        const result = await window.electron.resource.importMultiple(filePaths, projectId);
        if (result.success && result.data) {
          // Re-fetch resources after import
          const refreshed = await window.electron.db.resources.getByProject(projectId);
          if (refreshed.success && refreshed.data) {
            const filtered = refreshed.data.filter((r: Resource) => r.type !== 'folder');
            setResources(filtered);
          }
        }
      }
    } catch (err) {
      console.error('Error adding source:', err);
    }
  }, [projectId]);

  return (
    <div
      className="flex flex-col border-r shrink-0 transition-all duration-300 ease-out"
      style={{
        width: 'min(18vw, 260px)',
        minWidth: '200px',
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--secondary-text)' }}
        >
          Sources
        </h3>
        <button
          onClick={handleToggleAll}
          className="flex items-center justify-center w-6 h-6 rounded transition-colors duration-150"
          style={{ color: 'var(--secondary-text)' }}
          title={allSelected ? 'Deselect all' : 'Select all'}
          aria-label={allSelected ? 'Deselect all sources' : 'Select all sources'}
        >
          {allSelected ? (
            <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
          ) : someSelected ? (
            <MinusSquare size={14} style={{ color: 'var(--accent)' }} />
          ) : (
            <Square size={14} />
          )}
        </button>
      </div>

      {/* Resource list */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
              Loading...
            </p>
          </div>
        ) : resources.length === 0 ? (
          <div className="flex items-center justify-center py-8 px-3">
            <p className="text-xs text-center" style={{ color: 'var(--tertiary-text)' }}>
              No sources in this project yet.
            </p>
          </div>
        ) : (
          resources.map((res) => {
            const isSelected = selectedSourceIds.includes(res.id);
            const isCurrent = res.id === resourceId;

            return (
              <div
                key={res.id}
                className="flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors duration-150"
                style={{
                  background: isCurrent
                    ? 'var(--bg-hover)'
                    : 'transparent',
                }}
                onClick={() => toggleSourceId(res.id)}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {/* Checkbox */}
                <div className="shrink-0" style={{ color: isSelected ? 'var(--accent)' : 'var(--tertiary-text)' }}>
                  {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                </div>

                {/* Type icon */}
                <div style={{ color: 'var(--secondary-text)' }}>
                  {getTypeIcon(res.type)}
                </div>

                {/* Title */}
                <span
                  className="text-xs truncate flex-1"
                  style={{
                    color: isCurrent ? 'var(--primary-text)' : 'var(--secondary-text)',
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                  title={res.title}
                >
                  {res.title}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Add source button */}
      <div
        className="border-t px-3 py-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={handleAddSource}
          className="flex items-center gap-2 w-full px-2 py-2 rounded-md text-xs font-medium transition-colors duration-150"
          style={{
            color: 'var(--accent)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-tertiary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Plus size={14} />
          Add source
        </button>
      </div>
    </div>
  );
}
