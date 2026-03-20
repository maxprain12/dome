import { useState, useEffect, useRef, useCallback } from 'react';
import { Link2, MessageSquare, Search, X, FolderOpen, ChevronDown, FileText, History, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import WorkspaceFilesPanel from './WorkspaceFilesPanel';
import PDFTab from './PDFTab';
import { type Resource } from '@/types';
import { useManyStore } from '@/lib/store/useManyStore';

type TabType = 'references' | 'backlinks' | 'search' | 'workspace' | 'pdf' | 'history';

interface SidePanelProps {
  resourceId: string;
  resource: Resource & { _source?: 'notes' | 'resources' };
  isOpen: boolean;
  onClose: () => void;
  /** For notebooks: workspace folder path and change handler */
  notebookWorkspacePath?: string;
  onNotebookWorkspacePathChange?: (path: string) => Promise<void>;
  /** For notebooks: Python venv path and change handler */
  notebookVenvPath?: string;
  onNotebookVenvPathChange?: (path: string) => Promise<void>;
}

const TAB_CONFIG: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'references', label: 'References', icon: <Link2 size={14} /> },
  { id: 'backlinks', label: 'Backlinks', icon: <MessageSquare size={14} /> },
  { id: 'history', label: 'History', icon: <History size={14} /> },
  { id: 'search', label: 'Search', icon: <Search size={14} /> },
  { id: 'workspace', label: 'Workspace', icon: <FolderOpen size={14} /> },
  { id: 'pdf', label: 'PDF', icon: <FileText size={14} /> },
];

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
    resource?.type === 'notebook' ? 'workspace' : 'references'
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { setContext } = useManyStore();

  const isNotebook = resource?.type === 'notebook';
  const isPdf =
    resource?.type === 'pdf' ||
    (resource?.type === 'document' &&
      ((resource?.original_filename || resource?.title || '').toLowerCase().endsWith('.pdf') ||
        resource?.file_mime_type === 'application/pdf'));
  const isNote = resource?.type === 'note';
  const isNoteFromNewDomain = isNote && resource?._source === 'notes';
  const tabs = TAB_CONFIG.filter((t) => {
    if (t.id === 'workspace') return isNotebook;
    if (t.id === 'pdf') return isPdf;
    if (t.id === 'history') return isNoteFromNewDomain;
    return true;
  });

  // When switching to PDF resource, select PDF tab if current tab is no longer available
  useEffect(() => {
    if (isPdf && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab('pdf');
    }
  }, [isPdf, activeTab, tabs]);

  // When opening panel for a notebook, default to Workspace tab
  useEffect(() => {
    if (isOpen && isNotebook && tabs.some((t) => t.id === 'workspace')) {
      setActiveTab('workspace');
    }
  }, [isOpen, isNotebook, tabs]);

  // Actualizar el contexto de Many cuando se abre un recurso
  useEffect(() => {
    if (resource) {
      setContext(resourceId, resource.title);
    }
    return () => {
      setContext(null, null);
    };
  }, [resourceId, resource, setContext]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const activeTabConfig = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div
      className="flex flex-col h-full border-l transition-all duration-300 ease-out shrink-0"
      style={{
        width: 'min(30vw, 380px)',
        minWidth: '280px',
        background: 'var(--bg)',
        borderColor: 'var(--border)',
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <div ref={dropdownRef} className="flex-1 min-w-0 relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--primary-text)',
            }}
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
          >
            <span className="flex items-center gap-2 truncate">
              {activeTabConfig?.icon}
              {activeTabConfig?.label}
            </span>
            <ChevronDown
              size={16}
              className="shrink-0 transition-transform duration-200"
              style={{
                color: 'var(--secondary-text)',
                transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
              }}
            />
          </button>

          {dropdownOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-1 py-1 rounded-lg z-dropdown shadow-lg"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors"
                  style={{
                    color: activeTab === tab.id ? 'var(--primary-text)' : 'var(--secondary-text)',
                    background: activeTab === tab.id ? 'var(--translucent)' : 'transparent',
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg shrink-0 transition-all duration-200 hover:bg-[var(--bg-secondary)] opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{ color: 'var(--secondary-text)' }}
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'references' && (
          <ReferencesTab resourceId={resourceId} />
        )}
        {activeTab === 'backlinks' && (
          <BacklinksTab resourceId={resourceId} resource={resource} />
        )}
        {activeTab === 'search' && (
          <SearchTab resourceId={resourceId} resource={resource} />
        )}
        {activeTab === 'history' && isNoteFromNewDomain && (
          <HistoryTab noteId={resourceId} />
        )}
        {activeTab === 'workspace' && isNotebook && onNotebookWorkspacePathChange && (
          <WorkspaceFilesPanel
            workspacePath={notebookWorkspacePath}
            onWorkspacePathChange={onNotebookWorkspacePathChange}
            venvPath={notebookVenvPath}
            onVenvPathChange={onNotebookVenvPathChange}
          />
        )}
        {activeTab === 'pdf' && isPdf && <PDFTab />}
      </div>
    </div>
  );
}

// Referencias - Recursos enlazados desde este recurso
function ReferencesTab({ resourceId }: { resourceId: string }) {
  const [links, setLinks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadLinks() {
      try {
        const result = await window.electron.db.links.getBySource(resourceId);
        if (result.success) {
          setLinks(result.data || []);
        }
      } catch (error) {
        console.error('Error loading links:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadLinks();
  }, [resourceId]);

  const handleDelete = async (linkId: string) => {
    setDeletingId(linkId);
    try {
      await window.electron.db.links.delete(linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err) {
      console.error('Error deleting link:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full" style={{ color: 'var(--secondary-text)' }} />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
          Linked Resources
        </h3>
        <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
          {links.length} link{links.length !== 1 ? 's' : ''}
        </span>
      </div>
      {links.length === 0 ? (
        <div className="text-center py-8">
          <Link2 size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--secondary-text)' }} />
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            No references yet.
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--tertiary-text)' }}>
            Use the Search tab to find and link resources.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="group flex items-center gap-2 p-3 rounded-lg"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <button
                type="button"
                className="flex-1 text-left min-w-0 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded"
                onClick={() => {
                  window.electron.workspace.open(link.target_id, link.target_type || link.type || 'note');
                }}
                aria-label={`Open ${link.target_title || 'Untitled'}`}
              >
                <p className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                  {link.target_title || 'Untitled'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--accent)', color: 'white', opacity: 0.85 }}
                  >
                    {link.link_type || 'related'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(link.id)}
                disabled={deletingId === link.id}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-[var(--bg-hover)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ color: 'var(--error, #ef4444)' }}
                aria-label="Remove link"
                title="Remove link"
              >
                {deletingId === link.id
                  ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                  : <Trash2 size={14} />
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Backlinks - Recursos/notas que enlazan a este recurso
function BacklinksTab({ resourceId, resource }: { resourceId: string; resource?: Resource & { _source?: 'notes' | 'resources' } }) {
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBacklinks() {
      try {
        const fromNotes = resource?._source === 'notes' && window.electron?.db?.notes;
        const result = fromNotes
          ? await window.electron.db.notes.getBacklinks(resourceId)
          : await window.electron.db.resources.getBacklinks(resourceId);
        if (result?.success) {
          const data = result.data || [];
          setBacklinks(fromNotes ? data.map((l: { id: string; source_id: string; source_title: string }) => ({ id: l.id, source_id: l.source_id, source_title: l.source_title, source_type: 'note' })) : data);
        }
      } catch (error) {
        console.error('Error loading backlinks:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadBacklinks();
  }, [resourceId, resource?._source]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full" style={{ color: 'var(--secondary-text)' }} />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
        Resources Linking Here
      </h3>
      {backlinks.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--secondary-text)' }} />
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            No backlinks yet. Other resources that reference this one will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {backlinks.map((link) => (
            <button
              type="button"
              key={link.id}
              className="p-3 rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-hover)] w-full text-left focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              onClick={() => {
                window.electron.workspace.open(link.source_id, link.source_type || 'note');
              }}
              aria-label={`Open ${link.source_title || 'Untitled'}`}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                {link.source_title || 'Untitled'}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--secondary-text)',
                  }}
                >
                  {link.source_type}
                </span>
                {link.link_type && link.link_type !== 'related' ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'var(--accent)',
                      color: 'white',
                      opacity: 0.8,
                    }}
                  >
                    {link.link_type}
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

// History - Snapshots de la nota (solo dominio notes)
function HistoryTab({ noteId }: { noteId: string }) {
  const [history, setHistory] = useState<{ id: string; title: string; created_at: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const result = await window.electron.db.notes.getHistory(noteId, 50);
        if (result?.success) {
          setHistory((result.data || []).map((h: { id: string; title: string; created_at: number }) => ({ id: h.id, title: h.title, created_at: h.created_at })));
        }
      } catch (error) {
        console.error('Error loading note history:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadHistory();
  }, [noteId]);

  const handleRestore = async (historyId: string) => {
    setRestoring(historyId);
    try {
      const result = await window.electron.db.notes.restoreFromHistory(historyId);
      if (result?.success) {
        setHistory((prev) => prev.filter((h) => h.id !== historyId));
      }
    } catch (error) {
      console.error('Error restoring from history:', error);
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday ? d.toLocaleTimeString() : d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full" style={{ color: 'var(--secondary-text)' }} />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
        Version History
      </h3>
      {history.length === 0 ? (
        <div className="text-center py-8">
          <History size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--secondary-text)' }} />
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            No history yet. Edits will create snapshots.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-2 p-3 rounded-lg"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                  {h.title || 'Untitled'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--tertiary-text)' }}>
                  {formatDate(h.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(h.id)}
                disabled={restoring === h.id}
                className="px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
                aria-label={`Restore version from ${formatDate(h.created_at)}`}
              >
                {restoring === h.id ? '...' : 'Restore'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Link types for knowledge graph
const LINK_TYPES = [
  { value: 'related', label: 'Related To', description: 'General relationship' },
  { value: 'cites', label: 'Cites', description: 'This cites the target' },
  { value: 'cited_by', label: 'Cited By', description: 'This is cited by target' },
  { value: 'authored_by', label: 'Authored By', description: 'Created by this author' },
  { value: 'depends_on', label: 'Depends On', description: 'Requires understanding target first' },
  { value: 'expands', label: 'Expands', description: 'Elaborates on target idea' },
  { value: 'contradicts', label: 'Contradicts', description: 'Disagrees with target' },
  { value: 'mentions', label: 'Mentions', description: 'References target' },
];

// Búsqueda de recursos para enlazar - with live debounced search
function SearchTab({ resourceId }: { resourceId: string; resource: Resource }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLinkType, setSelectedLinkType] = useState('related');
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const result = await window.electron.db.resources.searchForMention(q);
      if (result.success) {
        setResults((result.data || []).filter((r: any) => r.id !== resourceId));
      }
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsSearching(false);
    }
  }, [resourceId]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 280);
  };

  const handleLink = async (targetId: string, targetTitle: string) => {
    if (linkedIds.has(targetId)) return;
    setLinkingId(targetId);
    try {
      const linkId = `link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await window.electron.db.links.create({
        id: linkId,
        source_id: resourceId,
        target_id: targetId,
        link_type: selectedLinkType,
        weight: 1.0,
        created_at: Date.now(),
      });
      setLinkedIds((prev) => new Set([...prev, targetId]));
    } catch (error) {
      console.error('Error creating link:', error);
    } finally {
      setLinkingId(null);
    }
  };

  const LINK_TYPE_COLORS: Record<string, string> = {
    related: '#7b76d0',
    cites: '#3b82f6',
    cited_by: '#6366f1',
    authored_by: '#f59e0b',
    depends_on: '#f59e0b',
    expands: '#0ea5e9',
    contradicts: '#ef4444',
    mentions: '#10b981',
  };

  return (
    <div className="p-4 h-full overflow-y-auto flex flex-col gap-3">
      <h3 className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
        Link to Resource
      </h3>

      {/* Link Type pills */}
      <div>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--secondary-text)' }}>
          Relation type
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LINK_TYPES.map((type) => {
            const isActive = selectedLinkType === type.value;
            const color = LINK_TYPE_COLORS[type.value] ?? 'var(--accent)';
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => setSelectedLinkType(type.value)}
                title={type.description}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all border cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{
                  background: isActive ? color : 'var(--bg-tertiary)',
                  color: isActive ? 'white' : 'var(--secondary-text)',
                  borderColor: isActive ? color : 'transparent',
                }}
              >
                {type.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Search Input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--tertiary-text)' }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={t('sidePanel.searchPlaceholder')}
          autoFocus
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--primary-text)',
          }}
          aria-label="Search resources to link"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--secondary-text)' }} />
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {results.map((result) => {
            const isLinked = linkedIds.has(result.id);
            const isLinking = linkingId === result.id;
            return (
              <div
                key={result.id}
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${isLinked ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: isLinked ? 0.75 : 1,
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                    {result.title || 'Untitled'}
                  </p>
                  <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--tertiary-text)' }}>
                    {result.type}
                  </p>
                </div>
                <button
                  onClick={() => handleLink(result.id, result.title)}
                  disabled={isLinked || isLinking}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] shrink-0"
                  style={{
                    background: isLinked ? 'var(--success, #10b981)' : 'var(--accent)',
                    color: 'white',
                    opacity: isLinking ? 0.7 : 1,
                  }}
                  aria-label={isLinked ? 'Already linked' : `Link to ${result.title || 'Untitled'}`}
                >
                  {isLinking ? '...' : isLinked ? '✓ Linked' : 'Link'}
                </button>
              </div>
            );
          })}
        </div>
      ) : query && !isSearching ? (
        <div className="text-center py-6">
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>{t('sidePanel.noResourcesFound')}</p>
        </div>
      ) : !query ? (
        <div className="text-center py-6">
          <Link2 size={28} className="mx-auto mb-2 opacity-25" style={{ color: 'var(--secondary-text)' }} />
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            Search to find and link resources
          </p>
        </div>
      ) : null}
    </div>
  );
}
