'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, FileText, Search, MoreVertical, X, Link2 } from 'lucide-react';
import NotionEditor from '@/components/editor/NotionEditor';
import { generateId } from '@/lib/utils';

interface NoteWorkspaceClientProps {
  resourceId: string;
}

interface Resource {
  id: string;
  title: string;
  type: string;
  content?: string;
  file_path?: string;
  created_at: number;
  updated_at: number;
}

interface ResourceLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  created_at: number;
  target?: Resource;
}

type TabType = 'references' | 'backlinks' | 'search';

export default function NoteWorkspaceClient({ resourceId }: NoteWorkspaceClientProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('references');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [references, setReferences] = useState<ResourceLink[]>([]);
  const [backlinks, setBacklinks] = useState<ResourceLink[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Resource[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');

  // Load resource
  useEffect(() => {
    async function loadResource() {
      if (!window.electron?.db?.resources) {
        setError('Database not available');
        setLoading(false);
        return;
      }

      try {
        const result = await window.electron.db.resources.getById(resourceId);
        if (result?.success && result.data) {
          setResource(result.data);
          setTitle(result.data.title || '');
          setContent(result.data.content || '');
          lastSavedContentRef.current = result.data.content || '';
        } else {
          setError('Note not found');
        }
      } catch (err) {
        console.error('Error loading note:', err);
        setError('Failed to load note');
      } finally {
        setLoading(false);
      }
    }

    loadResource();
  }, [resourceId]);

  // Load references
  useEffect(() => {
    async function loadReferences() {
      if (!window.electron?.db?.links) return;

      try {
        const result = await window.electron.db.links.getBySource(resourceId);
        if (!result?.success || !result.data) return;

        const links = result.data;
        // Load target resources for each link
        const linksWithTargets = await Promise.all(
          links.map(async (link: ResourceLink) => {
            const targetResult = await window.electron.db.resources.getById(link.target_id);
            return { ...link, target: targetResult?.data };
          })
        );
        setReferences(linksWithTargets.filter((l: ResourceLink) => l.target));
      } catch (err) {
        console.error('Error loading references:', err);
      }
    }

    loadReferences();
  }, [resourceId]);

  // Load backlinks
  useEffect(() => {
    async function loadBacklinks() {
      if (!window.electron?.db?.resources) return;

      try {
        const result = await window.electron.db.resources.getBacklinks(resourceId);
        if (!result?.success || !result.data) return;

        const links = result.data;
        // Load source resources for each link
        const linksWithSources = await Promise.all(
          links.map(async (link: any) => {
            const sourceResult = await window.electron.db.resources.getById(link.source_id);
            return { ...link, source: sourceResult?.data };
          })
        );
        setBacklinks(linksWithSources.filter((l: any) => l.source));
      } catch (err) {
        console.error('Error loading backlinks:', err);
      }
    }

    loadBacklinks();
  }, [resourceId]);

  // Auto-save content
  const saveContent = useCallback(async (newContent: string) => {
    if (!window.electron?.db?.resources || !resource) return;
    if (newContent === lastSavedContentRef.current) return;

    setIsSaving(true);
    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title: resource.title,
        content: newContent,
        metadata: null,
        updated_at: new Date().toISOString(),
      });
      lastSavedContentRef.current = newContent;
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setIsSaving(false);
    }
  }, [resourceId, resource]);

  // Debounced save on content change
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  }, [saveContent]);

  // Save title
  const handleTitleBlur = useCallback(async () => {
    if (!window.electron?.db?.resources || !resource) return;
    if (title === resource.title) return;

    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        content: resource.content || null,
        metadata: null,
        updated_at: new Date().toISOString(),
      });
      setResource({ ...resource, title });
    } catch (err) {
      console.error('Error saving title:', err);
    }
  }, [resourceId, resource, title]);

  // Search resources
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !window.electron?.db?.resources) return;

    setIsSearching(true);
    try {
      const result = await window.electron.db.resources.search(searchQuery);
      if (result?.success && result.data) {
        // Filter out current note
        setSearchResults(result.data.filter((r: Resource) => r.id !== resourceId));
      }
    } catch (err) {
      console.error('Error searching:', err);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, resourceId]);

  // Add reference
  const handleAddReference = useCallback(async (targetResource: Resource) => {
    if (!window.electron?.db?.links) return;

    try {
      const link = {
        id: generateId(),
        source_id: resourceId,
        target_id: targetResource.id,
        link_type: 'reference',
        created_at: Date.now(),
      };

      await window.electron.db.links.create(link);
      setReferences([...references, { ...link, target: targetResource }]);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      console.error('Error adding reference:', err);
    }
  }, [resourceId, references]);

  // Remove reference
  const handleRemoveReference = useCallback(async (linkId: string) => {
    if (!window.electron?.db?.links) return;

    try {
      await window.electron.db.links.delete(linkId);
      setReferences(references.filter(r => r.id !== linkId));
    } catch (err) {
      console.error('Error removing reference:', err);
    }
  }, [references]);

  // Close window
  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.close();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="animate-pulse" style={{ color: 'var(--secondary-text)' }}>Loading note...</div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--error)' }}>{error || 'Note not found'}</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 rounded-md"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--primary-text)' }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'pdf': return '📄';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'image': return '🖼️';
      case 'note': return '📝';
      default: return '📁';
    }
  };

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 h-14 border-b shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 rounded-md hover:bg-opacity-80 transition-colors"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <ArrowLeft size={18} style={{ color: 'var(--primary-text)' }} />
          </button>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="text-lg font-semibold bg-transparent border-none outline-none"
            style={{ color: 'var(--primary-text)' }}
            placeholder="Untitled Note"
          />
          {isSaving && (
            <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>Saving...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className="p-2 rounded-md transition-colors"
            style={{
              backgroundColor: isPanelOpen ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: isPanelOpen ? 'white' : 'var(--primary-text)',
            }}
          >
            <FileText size={18} />
          </button>
          <button
            className="p-2 rounded-md hover:bg-opacity-80 transition-colors"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <MoreVertical size={18} style={{ color: 'var(--primary-text)' }} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor area */}
        <div className="flex-1 overflow-auto p-6">
          <div className="w-full">
            <NotionEditor
              content={content}
              onChange={handleContentChange}
              placeholder="Escribe '/' para comandos..."
            />
          </div>
        </div>

        {/* Side Panel */}
        {isPanelOpen && (
          <aside
            className="w-80 border-l flex flex-col shrink-0"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
          >
            {/* Panel tabs */}
            <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
              {[
                { id: 'references' as TabType, label: 'References', icon: Link2 },
                { id: 'backlinks' as TabType, label: 'Backlinks', icon: Link2 },
                { id: 'search' as TabType, label: 'Search', icon: Search },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 py-3 px-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                  style={{
                    color: activeTab === tab.id ? 'var(--accent)' : 'var(--secondary-text)',
                    borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'references' && (
                  <div className="p-4">
                    <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
                      Linked Resources
                    </h3>
                    {references.length === 0 ? (
                      <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                        No references yet. Use the Search tab to find and link resources.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {references.map((ref) => (
                          <div
                            key={ref.id}
                            className="flex items-center gap-2 p-2 rounded-md group"
                            style={{ backgroundColor: 'var(--bg-tertiary)' }}
                          >
                            <span>{getResourceIcon(ref.target?.type || '')}</span>
                            <span
                              className="flex-1 text-sm truncate"
                              style={{ color: 'var(--primary-text)' }}
                            >
                              {ref.target?.title || 'Unknown'}
                            </span>
                            <button
                              onClick={() => handleRemoveReference(ref.id)}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: 'var(--secondary-text)' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'backlinks' && (
                  <div className="p-4">
                    <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--primary-text)' }}>
                      Backlinks
                    </h3>
                    {backlinks.length === 0 ? (
                      <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
                        No other resources link to this note yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {backlinks.map((link: any) => (
                          <div
                            key={link.id}
                            className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-opacity-80"
                            style={{ backgroundColor: 'var(--bg-tertiary)' }}
                            onClick={() => {
                              // TODO: Open source resource
                              console.log('Open resource:', link.source_id);
                            }}
                          >
                            <span>{getResourceIcon(link.source?.type || '')}</span>
                            <span
                              className="flex-1 text-sm truncate"
                              style={{ color: 'var(--primary-text)' }}
                            >
                              {link.source?.title || link.source_title || 'Unknown'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'search' && (
                  <div className="p-4">
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search resources..."
                        className="flex-1 px-3 py-2 rounded-md text-sm"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--primary-text)',
                          border: '1px solid var(--border)',
                        }}
                      />
                      <button
                        onClick={handleSearch}
                        disabled={isSearching}
                        className="px-3 py-2 rounded-md text-sm font-medium"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'white',
                          opacity: isSearching ? 0.5 : 1,
                        }}
                      >
                        {isSearching ? '...' : 'Search'}
                      </button>
                    </div>

                    {searchResults.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium uppercase" style={{ color: 'var(--secondary-text)' }}>
                          Results
                        </h4>
                        {searchResults.map((result) => (
                          <div
                            key={result.id}
                            className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-opacity-80"
                            style={{ backgroundColor: 'var(--bg-tertiary)' }}
                            onClick={() => handleAddReference(result)}
                          >
                            <span>{getResourceIcon(result.type)}</span>
                            <span
                              className="flex-1 text-sm truncate"
                              style={{ color: 'var(--primary-text)' }}
                            >
                              {result.title}
                            </span>
                            <Link2 size={14} style={{ color: 'var(--secondary-text)' }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
          </aside>
        )}
      </div>
    </div>
  );
}
