import { useState, useEffect, useRef } from 'react';
import { Link2, MessageSquare, Search, X, FolderOpen, ChevronDown } from 'lucide-react';
import NotesTab from './NotesTab';
import AnnotationsTab from './AnnotationsTab';
import WorkspaceFilesPanel from './WorkspaceFilesPanel';
import { type Resource } from '@/types';
import { useMartinStore } from '@/lib/store/useMartinStore';

type TabType = 'references' | 'backlinks' | 'search' | 'workspace';

interface SidePanelProps {
  resourceId: string;
  resource: Resource;
  isOpen: boolean;
  onClose: () => void;
  /** For notebooks: workspace folder path and change handler */
  notebookWorkspacePath?: string;
  onNotebookWorkspacePathChange?: (path: string) => Promise<void>;
}

const TAB_CONFIG: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'references', label: 'References', icon: <Link2 size={14} /> },
  { id: 'backlinks', label: 'Backlinks', icon: <MessageSquare size={14} /> },
  { id: 'search', label: 'Search', icon: <Search size={14} /> },
  { id: 'workspace', label: 'Workspace', icon: <FolderOpen size={14} /> },
];

export default function SidePanel({
  resourceId,
  resource,
  isOpen,
  onClose,
  notebookWorkspacePath,
  onNotebookWorkspacePathChange,
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('references');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { setContext } = useMartinStore();

  const isNotebook = resource?.type === 'notebook';
  const tabs = isNotebook ? TAB_CONFIG : TAB_CONFIG.filter((t) => t.id !== 'workspace');

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
              {activeTabConfig.icon}
              {activeTabConfig.label}
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
          <BacklinksTab resourceId={resourceId} />
        )}
        {activeTab === 'search' && (
          <SearchTab resourceId={resourceId} resource={resource} />
        )}
        {activeTab === 'workspace' && isNotebook && onNotebookWorkspacePathChange && (
          <WorkspaceFilesPanel
            workspacePath={notebookWorkspacePath}
            onWorkspacePathChange={onNotebookWorkspacePathChange}
          />
        )}
      </div>
    </div>
  );
}

// Referencias - Recursos enlazados desde este recurso
function ReferencesTab({ resourceId }: { resourceId: string }) {
  const [links, setLinks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        Linked Resources
      </h3>
      {links.length === 0 ? (
        <div className="text-center py-8">
          <Link2 size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--secondary-text)' }} />
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            No references yet. Use the Search tab to find and link resources.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <button
              type="button"
              key={link.id}
              className="p-3 rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-hover)] w-full text-left focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              onClick={() => {
                window.electron.workspace.open(link.target_id, link.target_type || link.type || 'note');
              }}
              aria-label={`Open ${link.target_title || 'Untitled'}`}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                {link.target_title || 'Untitled'}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--secondary-text)',
                  }}
                >
                  {link.link_type || 'related'}
                </span>
                {(link.weight != null && link.weight !== 1.0) ? (
                  <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                    Weight: {link.weight}
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

// Backlinks - Recursos que enlazan a este recurso
function BacklinksTab({ resourceId }: { resourceId: string }) {
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBacklinks() {
      try {
        const result = await window.electron.db.resources.getBacklinks(resourceId);
        if (result.success) {
          setBacklinks(result.data || []);
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
                window.electron.workspace.open(link.source_id, link.source_type);
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

// Búsqueda de recursos para enlazar
function SearchTab({ resourceId, resource }: { resourceId: string; resource: Resource }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLinkType, setSelectedLinkType] = useState('related');

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const result = await window.electron.db.resources.searchForMention(query);
      if (result.success) {
        // Filtrar el recurso actual de los resultados
        setResults((result.data || []).filter((r: any) => r.id !== resourceId));
      }
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLink = async (targetId: string) => {
    try {
      const linkId = `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await window.electron.db.links.create({
        id: linkId,
        source_id: resourceId,
        target_id: targetId,
        link_type: selectedLinkType,
        weight: 1.0,
        created_at: Date.now(),
      });
      // Mostrar feedback
      setResults(results.filter((r) => r.id !== targetId));
    } catch (error) {
      console.error('Error creating link:', error);
    }
  };

  return (
    <div className="p-4 h-full overflow-y-auto">
      <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
        Find Resources to Link
      </h3>

      {/* Link Type Selector */}
      <div className="mb-3">
        <label htmlFor="sidepanel-link-type" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--secondary-text)' }}>
          Link Type
        </label>
        <select
          id="sidepanel-link-type"
          value={selectedLinkType}
          onChange={(e) => setSelectedLinkType(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--primary-text)',
          }}
        >
          {LINK_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label} - {type.description}
            </option>
          ))}
        </select>
      </div>

      {/* Search Input */}
      <div className="flex gap-2 mb-4">
        <label htmlFor="sidepanel-search" className="sr-only">Search resources</label>
        <input
          id="sidepanel-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search resources..."
          className="flex-1 px-3 py-2 text-sm rounded-lg"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--primary-text)',
          }}
        />
        <button
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          aria-label="Search resources"
          style={{
            background: query.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: query.trim() ? 'white' : 'var(--secondary-text)',
          }}
        >
          {isSearching ? '...' : 'Search'}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <div className="space-y-2">
          {results.map((result) => (
            <div
              key={result.id}
              className="p-3 rounded-lg flex items-center justify-between"
              style={{ background: 'var(--bg)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                  {result.title || 'Untitled'}
                </p>
                <p className="text-xs capitalize" style={{ color: 'var(--tertiary)' }}>
                  {result.type}
                </p>
              </div>
              <button
                onClick={() => handleLink(result.id)}
                className="ml-2 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                }}
                aria-label={`Link to ${result.title || 'Untitled'}`}
              >
                Link
              </button>
            </div>
          ))}
        </div>
      ) : query && !isSearching ? (
        <p className="text-center text-sm py-4" style={{ color: 'var(--secondary-text)' }}>
          No results found
        </p>
      ) : (
        <p className="text-center text-sm py-4" style={{ color: 'var(--secondary-text)' }}>
          Search for resources to create links
        </p>
      )}
    </div>
  );
}
