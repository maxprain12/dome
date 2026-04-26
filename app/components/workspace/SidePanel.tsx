import { useState, useEffect, useMemo } from 'react';
import { Link2, MessageSquare, X, FolderOpen, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import WorkspaceFilesPanel from './WorkspaceFilesPanel';
import PDFTab from './PDFTab';
import RelationsTab from './RelationsTab';
import { type Resource } from '@/types';
import { useManyStore } from '@/lib/store/useManyStore';

type TabType = 'relations' | 'backlinks' | 'workspace' | 'pdf';

const TAB_ORDER: TabType[] = ['relations', 'backlinks', 'workspace', 'pdf'];

function tabIcon(id: TabType): React.ReactNode {
  switch (id) {
    case 'relations':
      return <Link2 size={14} />;
    case 'backlinks':
      return <MessageSquare size={14} />;
    case 'workspace':
      return <FolderOpen size={14} />;
    case 'pdf':
      return <FileText size={14} />;
    default:
      return null;
  }
}

interface SidePanelProps {
  resourceId: string;
  resource: Resource;
  isOpen: boolean;
  onClose: () => void;
  /** For notebooks: workspace folder path and change handler */
  notebookWorkspacePath?: string;
  onNotebookWorkspacePathChange?: (path: string) => Promise<void>;
  /** For notebooks: Python venv path and change handler */
  notebookVenvPath?: string;
  onNotebookVenvPathChange?: (path: string) => Promise<void>;
}

export default function SidePanel({
  resourceId,
  resource,
  isOpen,
  onClose,
  notebookWorkspacePath,
  onNotebookWorkspacePathChange,
  notebookVenvPath,
  onNotebookVenvPathChange,
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

  useEffect(() => {
    setActiveTab((prev) => {
      if (tabs.includes(prev)) return prev;
      return isPdf ? 'pdf' : 'relations';
    });
  }, [resourceId, isPdf, tabs]);

  useEffect(() => {
    if (isOpen && isNotebook && tabs.includes('workspace')) {
      setActiveTab('workspace');
    }
  }, [isOpen, isNotebook, tabs]);

  useEffect(() => {
    if (resource) {
      setContext(resourceId, resource.title);
    }
    return () => {
      setContext(null, null);
    };
  }, [resourceId, resource, setContext]);

  if (!isOpen) return null;

  const effectiveTab: TabType = (tabs.includes(activeTab) ? activeTab : tabs[0]) ?? 'relations';

  return (
    <div
      className="flex flex-col h-full border-l transition-all duration-300 ease-out shrink-0"
      style={{
        width: 'min(30vw, 380px)',
        minWidth: '280px',
        background: 'var(--dome-bg)',
        borderColor: 'var(--dome-border)',
      }}
    >
      <div
        className="flex flex-col gap-2 px-3 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex rounded-lg p-0.5 gap-0.5 flex-1 min-w-0 overflow-x-auto"
            style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
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
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2"
                  style={{
                    background: active ? 'var(--dome-accent-bg)' : 'transparent',
                    color: active ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                  }}
                >
                  {tabIcon(tabId)}
                  <span className="truncate max-w-[7rem]">{tabLabel(tabId)}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg shrink-0 transition-all duration-200 hover:bg-[var(--dome-bg-hover)] opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2"
            style={{ color: 'var(--dome-text-muted)' }}
            aria-label={t('workspace.side_panel_close')}
          >
            <X size={16} />
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

  useEffect(() => {
    async function loadBacklinks() {
      try {
        const result = await window.electron.db.resources.getBacklinks(resourceId);
        if (result?.success) {
          setBacklinks((result.data || []) as ResourceSemanticBacklink[]);
        }
      } catch (error) {
        console.error('Error loading backlinks:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadBacklinks();
  }, [resourceId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div
          className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full"
          style={{ color: 'var(--dome-text-muted)' }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--dome-text)' }}>
        {t('workspace.backlinks_heading')}
      </h3>
      {backlinks.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--dome-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
            {t('workspace.backlinks_empty')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {backlinks.map((link) => (
            <button
              type="button"
              key={link.id}
              className="p-3 rounded-lg transition-colors cursor-pointer hover:bg-[var(--dome-bg-hover)] w-full text-left focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
              onClick={() => {
                window.electron.workspace.open(link.source_id, link.source_type);
              }}
              aria-label={`Open ${link.source_title || 'Untitled'}`}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                {link.source_title || 'Untitled'}
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{
                    background: 'var(--dome-bg-hover)',
                    color: 'var(--dome-text-muted)',
                  }}
                >
                  {link.source_type}
                </span>
                {typeof link.similarity === 'number' ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium tabular-nums"
                    style={{
                      background: 'var(--dome-bg-hover)',
                      color: 'var(--dome-text-muted)',
                    }}
                  >
                    {t('workspace.backlink_similarity', { pct: Math.round(link.similarity * 100) })}
                  </span>
                ) : null}
                {link.label ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'var(--dome-accent-bg)',
                      color: 'var(--dome-text)',
                    }}
                  >
                    {t(`workspace.backlink_relation_${link.label}`, { defaultValue: link.label.replace(/_/g, ' ') })}
                  </span>
                ) : link.link_type === 'manual' ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'var(--dome-accent-bg)',
                      color: 'var(--dome-text)',
                    }}
                  >
                    {t('workspace.backlink_relation_manual')}
                  </span>
                ) : link.link_type === 'confirmed' ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'var(--dome-accent-bg)',
                      color: 'var(--dome-text)',
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
