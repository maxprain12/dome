import { HugeiconsIcon } from '@hugeicons/react';
import {
  Link02Icon,
  Comment01Icon,
  Cancel01Icon,
  FolderOpenIcon,
  File02Icon,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WorkspaceFilesPanel from './WorkspaceFilesPanel';
import PDFTab from './PDFTab';
import RelationsTab from './RelationsTab';
import { type Resource } from '@/types';
import { useManyStore } from '@/lib/store/useManyStore';
import { RESOURCE_RELATIONS_CHANGED } from '@/lib/utils/content-resources';

export type SidePanelTab = 'relations' | 'backlinks' | 'workspace' | 'pdf';

type TabType = SidePanelTab;

const TAB_ORDER: TabType[] = ['relations', 'backlinks', 'workspace', 'pdf'];

function tabIcon(id: TabType): React.ReactNode {
  switch (id) {
    case 'relations':
      return <HugeiconsIcon icon={Link02Icon} size={14} />;
    case 'backlinks':
      return <HugeiconsIcon icon={Comment01Icon} size={14} />;
    case 'workspace':
      return <HugeiconsIcon icon={FolderOpenIcon} size={14} />;
    case 'pdf':
      return <HugeiconsIcon icon={File02Icon} size={14} />;
    default:
      return null;
  }
}

interface SidePanelProps {
  resourceId: string;
  resource: Resource;
  isOpen: boolean;
  onClose: () => void;
  /** Al abrir o al cambiar mientras está abierto, enfoca esta pestaña (p. ej. backlinks). */
  preferredTab?: TabType | null;
  onPreferredTabApplied?: () => void;
  /** For notebooks: workspace folder path and change handler */
  notebookWorkspacePath?: string;
  onNotebookWorkspacePathChange?: (path: string) => Promise<void>;
  /** For notebooks: Python venv path and change handler */
  notebookVenvPath?: string;
  onNotebookVenvPathChange?: (path: string) => Promise<void>;
  embedded?: boolean;
}

export default function SidePanel({
  resourceId,
  resource,
  isOpen,
  onClose,
  preferredTab,
  onPreferredTabApplied,
  notebookWorkspacePath,
  onNotebookWorkspacePathChange,
  notebookVenvPath,
  onNotebookVenvPathChange,
  embedded = false,
}: SidePanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>(() =>
    resource?.type === 'notebook' ? 'workspace' : 'relations',
  );
  const { setContext } = useManyStore();

  const isNotebook = resource?.type === 'notebook';
  const isPdf = resource?.type === 'pdf';

  const tabLabel = (id: TabType) => {
    const keys: Record<TabType, string> = {
      relations: 'workspace.side_panel_tab_relations',
      backlinks: 'workspace.side_panel_tab_backlinks',
      workspace: 'workspace.side_panel_tab_workspace',
      pdf: 'workspace.side_panel_tab_pdf',
    };
    return t(keys[id]);
  };

  const tabs = useMemo(
    () =>
      TAB_ORDER.filter((id) => {
        if (id === 'workspace') return isNotebook;
        if (id === 'pdf') return isPdf;
        return true;
      }),
    [isNotebook, isPdf],
  );

  const tabsKey = `${resourceId}:${tabs.join(',')}`;
  const [prevTabsKey, setPrevTabsKey] = useState(tabsKey);
  if (tabsKey !== prevTabsKey) {
    setPrevTabsKey(tabsKey);
    setActiveTab((prev) => (tabs.includes(prev) ? prev : isPdf ? 'pdf' : 'relations'));
  }

  const appliedPreferredRef = useRef<string | null>(null);
  const preferredKey = preferredTab ?? '';
  if (isOpen && preferredTab != null && tabs.includes(preferredTab) && appliedPreferredRef.current !== preferredKey) {
    appliedPreferredRef.current = preferredKey;
    setActiveTab(preferredTab);
    queueMicrotask(() => onPreferredTabApplied?.());
  } else if (!isOpen && appliedPreferredRef.current !== null) {
    appliedPreferredRef.current = null;
  }

  useEffect(() => {
    return () => {
      setContext(null, null);
    };
  }, [setContext]);

  const contextKey = `${resourceId}:${resource.title}`;
  const prevContextKeyRef = useRef<string | null>(null);
  if (contextKey !== prevContextKeyRef.current) {
    prevContextKeyRef.current = contextKey;
    setContext(resourceId, resource.title);
  }

  if (!isOpen) return null;

  const effectiveTab: TabType = (tabs.includes(activeTab) ? activeTab : tabs[0]) ?? 'relations';

  return (
    <div
      className={embedded ? 'flex h-full min-w-0 flex-col' : 'flex h-full shrink-0 flex-col border-l'}
      style={embedded ? undefined : {
        width: 'min(30vw, 380px)',
        minWidth: '280px',
        background: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      <div
        className="flex flex-col gap-2 p-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex rounded-lg p-0.5 gap-0.5 flex-1 min-w-0 overflow-x-auto"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            role="tablist"
            aria-label={t('workspace.side_panel_tabs_aria')}
          >
            {tabs.map((tabId) => {
              const active = effectiveTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tabId)}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                    color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {tabIcon(tabId)}
                  <span className="truncate max-w-[7rem]">{tabLabel(tabId)}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg shrink-0 transition-all duration-200 hover:bg-accent opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 text-muted-foreground"
            aria-label={t('workspace.side_panel_close')}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
        {effectiveTab === 'relations' && <RelationsTab resourceId={resourceId} />}
        {effectiveTab === 'backlinks' && <BacklinksTab resourceId={resourceId} />}
        {effectiveTab === 'workspace' && isNotebook && onNotebookWorkspacePathChange && (
          <WorkspaceFilesPanel
            workspacePath={notebookWorkspacePath}
            onWorkspacePathChange={onNotebookWorkspacePathChange}
            venvPath={notebookVenvPath}
            onVenvPathChange={onNotebookVenvPathChange}
          />
        )}
        {effectiveTab === 'pdf' && isPdf && <PDFTab />}
      </div>
    </div>
  );
}

function BacklinksTab({ resourceId }: { resourceId: string }) {
  const { t } = useTranslation();
  const [backlinks, setBacklinks] = useState<ResourceSemanticBacklink[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadBacklinks = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electron.db.resources.getBacklinks(resourceId);
      if (result?.success && result.data) {
        setBacklinks(result.data);
      }
    } catch (error) {
      console.error('Error loading backlinks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    void loadBacklinks();
  }, [loadBacklinks]);

  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceId?: string; targetIds?: string[] }>).detail;
      if (
        detail?.sourceId === resourceId ||
        detail?.targetIds?.includes(resourceId)
      ) {
        void loadBacklinks();
      }
    };
    window.addEventListener(RESOURCE_RELATIONS_CHANGED, onChanged);
    return () => window.removeEventListener(RESOURCE_RELATIONS_CHANGED, onChanged);
  }, [resourceId, loadBacklinks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div
          className="animate-spin size-5 border-2 border-current border-t-transparent rounded-full text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      <h3 className="text-sm font-medium mb-3 text-foreground">
        {t('workspace.backlinks_heading')}
      </h3>
      {backlinks.length === 0 ? (
        <div className="text-center py-8">
          <HugeiconsIcon icon={Comment01Icon} size={32} className="mx-auto mb-3 opacity-30 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('workspace.backlinks_empty')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {backlinks.map((link) => (
            <button
              type="button"
              key={link.id}
              className="p-3 rounded-lg transition-colors cursor-pointer hover:bg-accent w-full text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              onClick={() => {
                window.electron.workspace.open(link.source_id, link.source_type);
              }}
              aria-label={`Open ${link.source_title || 'Untitled'}`}
            >
              <p className="text-sm font-medium text-foreground">
                {link.source_title || 'Untitled'}
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {link.source_type}
                </span>
                {typeof link.similarity === 'number' ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium tabular-nums"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    {t('workspace.backlink_similarity', { pct: Math.round(link.similarity * 100) })}
                  </span>
                ) : null}
                {link.label ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {t(`workspace.backlink_relation_${link.label}`, { defaultValue: link.label.replace(/_/g, ' ') })}
                  </span>
                ) : link.link_type === 'manual' ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {t('workspace.backlink_relation_manual')}
                  </span>
                ) : link.link_type === 'confirmed' ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {t('workspace.backlink_relation_confirmed')}
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
