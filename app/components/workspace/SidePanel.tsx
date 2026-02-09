
import { useState, useEffect } from 'react';
import { Link2, MessageSquare, Search, X } from 'lucide-react';
import NotesTab from './NotesTab';
import AnnotationsTab from './AnnotationsTab';
import { type Resource } from '@/types';
import { useMartinStore } from '@/lib/store/useMartinStore';

type TabType = 'references' | 'backlinks' | 'search';

interface SidePanelProps {
  resourceId: string;
  resource: Resource;
  isOpen: boolean;
  onClose: () => void;
}

export default function SidePanel({
  resourceId,
  resource,
  isOpen,
  onClose,
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('references');
  const { setContext } = useMartinStore();

  // Actualizar el contexto de Many cuando se abre un recurso
  useEffect(() => {
    if (resource) {
      setContext(resourceId, resource.title);
    }
    return () => {
      setContext(null, null);
    };
  }, [resourceId, resource, setContext]);

  if (!isOpen) return null;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'references', label: 'References', icon: <Link2 size={14} /> },
    { id: 'backlinks', label: 'Backlinks', icon: <MessageSquare size={14} /> },
    { id: 'search', label: 'Search', icon: <Search size={14} /> },
  ];

  return (
    <div
      className="flex flex-col h-full border-l transition-all duration-300 ease-out"
      style={{
        width: '360px',
        minWidth: '300px',
        maxWidth: '440px',
        background: 'var(--bg)',
        borderColor: 'var(--border)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                color: activeTab === tab.id ? 'var(--primary-text)' : 'var(--secondary-text)',
                background: activeTab === tab.id ? 'var(--bg)' : 'transparent',
                boxShadow: activeTab === tab.id ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-all duration-200 hover:bg-[var(--bg-secondary)] opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{ color: 'var(--secondary-text)' }}
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'references' && (
          <ReferencesTab resourceId={resourceId} />
        )}
        {activeTab === 'backlinks' && (
          <BacklinksTab resourceId={resourceId} />
        )}
        {activeTab === 'search' && (
          <SearchTab resourceId={resourceId} resource={resource} />
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
            <div
              key={link.id}
              className="p-3 rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              onClick={() => {
                window.electron.workspace.open(link.target_id, 'note');
              }}
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
                {link.weight && link.weight !== 1.0 && (
                  <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                    Weight: {link.weight}
                  </span>
                )}
              </div>
            </div>
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
            <div
              key={link.id}
              className="p-3 rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-hover)]"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              onClick={() => {
                window.electron.workspace.open(link.source_id, link.source_type);
              }}
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
                {link.link_type && link.link_type !== 'related' && (
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
                )}
              </div>
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
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--secondary-text)' }}>
          Link Type
        </label>
        <select
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
        <input
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
          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
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
                className="ml-2 px-2 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                }}
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
