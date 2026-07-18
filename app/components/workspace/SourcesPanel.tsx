
import { HugeiconsIcon } from '@hugeicons/react';
import {
  PlusSignIcon,
  CheckmarkSquare02Icon,
  SquareIcon,
  MinusSignSquareIcon,
} from '@hugeicons/core-free-icons';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ResourceIcon from '@/components/shared/ResourceIcon';
import { useAppStore } from '@/lib/store/useAppStore';
import { type Resource } from '@/types';
import { useMountAction } from '@/lib/hooks/useMountAction';

interface SourcesPanelProps {
  resourceId: string;
  projectId: string;
  embedded?: boolean;
}

export default function SourcesPanel({ resourceId, projectId, embedded = false }: SourcesPanelProps) {
  const { t } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const selectedSourceIds = useAppStore((s) => s.selectedSourceIds);
  const toggleSourceId = useAppStore((s) => s.toggleSourceId);
  const selectAllSources = useAppStore((s) => s.selectAllSources);
  const deselectAllSources = useAppStore((s) => s.deselectAllSources);

  const fetchResources = useCallback(async () => {
    if (!projectId || typeof window === 'undefined' || !window.electron) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await window.electron.db.resources.getByProject(projectId);
      if (result.success && result.data) {
        const filtered = result.data.filter((r: Resource) => r.type !== 'folder');
        setResources(filtered);
      }
    } catch (err) {
      console.error('Error fetching project resources:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const mountRef = useMountAction(fetchResources);

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
      ref={mountRef}
      className={embedded ? 'flex h-full min-w-0 flex-col' : 'flex shrink-0 flex-col border-r'}
      style={embedded ? undefined : {
        width: 'min(18vw, 260px)',
        minWidth: '200px',
        background: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 border-b border-border"
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {t('workspace.sources')}
        </h3>
        <button
          type="button"
          onClick={handleToggleAll}
          className="flex items-center justify-center size-6 rounded transition-colors duration-150 text-muted-foreground"
          title={allSelected ? t('common.deselect_all') : t('common.select_all')}
          aria-label={allSelected ? t('common.deselect_all') : t('common.select_all')}
        >
          {allSelected ? (
            <HugeiconsIcon icon={CheckmarkSquare02Icon} size={14} className="text-primary" />
          ) : someSelected ? (
            <HugeiconsIcon icon={MinusSignSquareIcon} size={14} className="text-primary" />
          ) : (
            <HugeiconsIcon icon={SquareIcon} size={14} />
          )}
        </button>
      </div>

      {/* Resource list */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-muted-foreground">
              {t('ui.loading')}
            </p>
          </div>
        ) : resources.length === 0 ? (
          <div className="flex items-center justify-center py-8 px-3">
            <p className="text-xs text-center text-muted-foreground">
              {t('workspace.sources_empty')}
            </p>
          </div>
        ) : (
          resources.map((res) => {
            const isSelected = selectedSourceIds.includes(res.id);
            const isCurrent = res.id === resourceId;

            return (
              <button
                type="button"
                key={res.id}
                className="flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors duration-150 w-full text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                style={{
                  background: isCurrent
                    ? 'var(--accent)'
                    : 'transparent',
                  border: 'none',
                }}
                onClick={() => toggleSourceId(res.id)}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = 'var(--muted)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
                aria-label={
                  isSelected
                    ? t('studio.sources_deselect', { title: res.title })
                    : t('studio.sources_select', { title: res.title })
                }
              >
                {/* Checkbox */}
                <div className="shrink-0" style={{ color: isSelected ? 'var(--primary)' : 'var(--muted-foreground)' }}>
                  {isSelected ? <HugeiconsIcon icon={CheckmarkSquare02Icon} size={14} /> : <HugeiconsIcon icon={SquareIcon} size={14} />}
                </div>

                {/* Type icon */}
                <div className="text-muted-foreground">
                  <ResourceIcon type={res.type} name={res.title} size={14} className="shrink-0" />
                </div>

                {/* Title */}
                <span
                  className="text-xs truncate flex-1"
                  style={{
                    color: isCurrent ? 'var(--foreground)' : 'var(--muted-foreground)',
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                  title={res.title}
                >
                  {res.title}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Add source button */}
      <div
        className="border-t px-3 py-2 border-border"
      >
        <button
          type="button"
          onClick={handleAddSource}
          className="flex items-center gap-2 w-full p-2 rounded-md text-xs font-medium transition-colors duration-150"
          style={{
            color: 'var(--primary)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--muted)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} />
          {t('workspace.add_source')}
        </button>
      </div>
    </div>
  );
}
