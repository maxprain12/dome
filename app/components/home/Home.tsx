
import { useState, useCallback } from 'react';
import { FolderOpen, FolderInput, Plus, Loader2, CheckCircle2, AlertCircle, Upload, ChevronRight, Home as HomeIcon, X, Clock, Tags as TagsIcon, FolderOpen as ProjectIcon, MessageCircle, Search, Bell, Settings, SlidersHorizontal, Filter, Grid3X3, List, Link2, FileText, File, Video, Music, Image as ImageIcon } from 'lucide-react';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import UserMenu from '@/components/user/UserMenu';
import { CommandCenter } from '@/components/CommandCenter';
import FilterBar from './FilterBar';
import ResourceCard from './ResourceCard';
import HomeLayout from './HomeLayout';
import { FlashcardDeckList } from '@/components/flashcards';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useResources, type ResourceType, type Resource } from '@/lib/hooks/useResources';

function parseJsonField<T = Record<string, unknown>>(val: unknown): T {
  if (val == null) return {} as T;
  if (typeof val === 'object') return val as T;
  try {
    return (typeof val === 'string' ? JSON.parse(val || '{}') : {}) as T;
  } catch {
    return {} as T;
  }
}

function getSearchSnippetForResource(
  resourceId: string,
  interactions: { resource_id?: string; content?: string; metadata?: unknown; position_data?: unknown }[]
): string | undefined {
  for (const i of interactions) {
    if (i.resource_id !== resourceId) continue;
    const metadata = parseJsonField<{ type?: string }>(i.metadata);
    const positionData = parseJsonField<{ selectedText?: string }>(i.position_data);
    const snippet = (metadata?.type === 'highlight' ? (positionData?.selectedText || null) : null) || i.content || '';
    const t = snippet.trim();
    if (t) return t.length > 80 ? t.slice(0, 80) + '...' : t;
  }
  return undefined;
}

export default function Home() {
  const { name } = useUserStore();
  const searchQuery = useAppStore((s) => s.searchQuery);
  const searchResults = useAppStore((s) => s.searchResults);
  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);

  // Resource fetching and filtering
  const [selectedTypes, setSelectedTypes] = useState<ResourceType[]>([]);
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'title'>('updated_at');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Move to folder modal state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [resourceToMove, setResourceToMove] = useState<Resource | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);

  const {
    folders,
    nonFolderResources,
    allFolders,
    isLoading,
    error,
    importProgress,
    refetch,
    createResource,
    importFiles,
    deleteResource,
    updateResource,
    moveToFolder,
    getFolderById
  } = useResources({
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
    folderId: currentFolderId,
    sortBy,
    sortOrder: 'desc'
  });

  // Get current folder for breadcrumbs
  const currentFolder = currentFolderId ? getFolderById(currentFolderId) : null;

  // Search mode: when there is a query and we have results (or explicit empty) from CommandCenter
  const isSearchMode = Boolean(searchQuery && searchResults !== null);
  const resourcesToShow = isSearchMode ? (searchResults?.resources ?? []) : nonFolderResources;

  // Command Center handlers
  const handleResourceSelect = useCallback(async (resource: any) => {
    console.log('Selected resource:', resource);

    // Handle URL resources - open in browser
    if (resource.type === 'url' && resource.metadata?.url) {
      if (typeof window !== 'undefined' && window.electron) {
        window.electron.invoke('open-external-url', resource.metadata.url);
      } else {
        window.open(resource.metadata.url, '_blank');
      }
      return;
    }

    // Handle folder resources - navigate into the folder
    if (resource.type === 'folder') {
      setCurrentFolderId(resource.id);
      return;
    }

    // For all other resources (pdf, video, audio, image, document, note)
    // Open in a workspace window
    if (typeof window !== 'undefined' && window.electron?.workspace) {
      try {
        const result = await window.electron.workspace.open(resource.id, resource.type);
        if (!result.success) {
          console.error('Failed to open workspace:', result.error);
        }
      } catch (err) {
        console.error('Failed to open workspace:', err);
      }
    }
  }, []);

  const handleCreateNote = useCallback(async () => {
    try {
      await createResource({
        type: 'note',
        title: 'Untitled Note',
        project_id: 'default',
        content: '',
      });
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [createResource]);

  const handleUpload = useCallback((files: File[]) => {
    console.log('Upload files:', files);
  }, []);

  const handleImportFiles = useCallback(async (filePaths: string[]) => {
    console.log('Importing files:', filePaths, 'into folder:', currentFolderId);
    const result = await importFiles(filePaths, 'default', currentFolderId);
    if (result.success) {
      console.log(`Successfully imported ${result.imported} files`);
    } else {
      console.error(`Import completed with ${result.failed} failures:`, result.errors);
    }
  }, [importFiles, currentFolderId]);

  const handleAddUrl = useCallback(async (url: string, type: 'youtube' | 'article') => {
    console.log('Adding URL resource:', url, 'Type:', type);
    try {
      const resourceType = 'url';

      const result = await createResource({
        type: resourceType as ResourceType,
        title: type === 'youtube' ? 'YouTube Video' : 'Web Article',
        project_id: 'default',
        content: url,
        folder_id: currentFolderId,
        metadata: {
          url: url,
          url_type: type,
          processing_status: 'pending',
        }
      });

      if (result?.id && window.electron?.web?.process) {
        window.electron.web.process(result.id).catch((error: unknown) => {
          console.error('Error processing URL resource:', error);
        });
      }
    } catch (err) {
      console.error('Failed to add URL resource:', err);
    }
  }, [createResource, currentFolderId]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    try {
      await createResource({
        type: 'folder' as ResourceType,
        title: newFolderName,
        project_id: 'default',
        folder_id: currentFolderId,
      });
      setNewFolderName('');
      setShowNewFolderModal(false);
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, [newFolderName, createResource, currentFolderId]);

  const handleFolderClick = useCallback((folder: Resource) => {
    setCurrentFolderId(folder.id);
  }, []);

  const handleNavigateToRoot = useCallback(() => {
    setCurrentFolderId(null);
  }, []);

  const handleMoveToFolderRequest = useCallback((resource: Resource) => {
    setResourceToMove(resource);
    setShowMoveModal(true);
  }, []);

  const handleMoveToFolder = useCallback(async (targetFolderId: string | null) => {
    if (!resourceToMove) return;

    const success = await moveToFolder(resourceToMove.id, targetFolderId);
    if (success) {
      console.log(`Moved ${resourceToMove.title} to folder`);
    } else {
      console.error('Failed to move resource');
    }

    setShowMoveModal(false);
    setResourceToMove(null);
  }, [resourceToMove, moveToFolder]);

  const handleDeleteResource = useCallback((resource: Resource) => {
    setDeleteTarget(resource);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (deleteTarget) {
      await deleteResource(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteResource]);

  // Render content based on active section
  const renderSectionContent = () => {
    switch (homeSidebarSection) {
      case 'flashcards':
        return <FlashcardDeckList />;

      case 'chat':
        return (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ background: 'rgba(123, 118, 208, 0.08)' }}
            >
              <MessageCircle className="w-10 h-10" style={{ color: 'var(--dome-accent)' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--dome-text)' }}>
              Martin Chat
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--dome-text-secondary)' }}>
              Abre un recurso para chatear con Martin sobre su contenido.
            </p>
          </div>
        );

      case 'projects':
        return (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ background: 'rgba(123, 118, 208, 0.08)' }}
            >
              <ProjectIcon className="w-10 h-10" style={{ color: 'var(--dome-accent)' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--dome-text)' }}>
              Proyectos
            </h3>
            <p className="text-sm" style={{ color: 'var(--dome-text-secondary)' }}>
              Organiza tus recursos por proyecto. Proximamente.
            </p>
          </div>
        );

      case 'recent':
        return renderLibraryContent();

      case 'tags':
        return (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ background: 'rgba(123, 118, 208, 0.08)' }}
            >
              <TagsIcon className="w-10 h-10" style={{ color: 'var(--dome-accent)' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--dome-text)' }}>
              Etiquetas
            </h3>
            <p className="text-sm" style={{ color: 'var(--dome-text-secondary)' }}>
              Navega tus recursos por etiquetas. Proximamente.
            </p>
          </div>
        );

      case 'library':
      default:
        return renderLibraryContent();
    }
  };

  const renderLibraryContent = () => (
    <>
      {/* Command Center - AI-powered search (primary focus) */}
      <div className="mb-10">
        <CommandCenter
          onResourceSelect={handleResourceSelect}
          onCreateNote={handleCreateNote}
          onUpload={handleUpload}
          onImportFiles={handleImportFiles}
          onAddUrl={handleAddUrl}
        />
      </div>

      {/* Filter Bar */}
      <FilterBar
        selectedTypes={selectedTypes}
        onTypesChange={setSelectedTypes}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCreateFolder={() => setShowNewFolderModal(true)}
      />

      {/* Breadcrumb Navigation */}
      {currentFolderId ? (
        <nav className="mb-6 flex items-center gap-2" style={{ color: 'var(--dome-text-secondary)' }} aria-label="Breadcrumb">
          <button
            onClick={handleNavigateToRoot}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-[var(--dome-accent-bg)] hover:text-[var(--dome-text)]"
            style={{ color: 'var(--dome-text-secondary)' }}
          >
            <HomeIcon className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />
            <span className="text-sm font-medium">Home</span>
          </button>
          <ChevronRight className="w-4 h-4 opacity-70" />
          <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
            {currentFolder?.title ?? 'Unknown Folder'}
          </span>
        </nav>
      ) : null}

      {/* Folders Section */}
      {folders.length > 0 ? (
        <section className="mb-10" aria-label="Folders">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--dome-text-secondary)' }}>
            {currentFolderId ? 'Subfolders' : 'Folders'}
          </h2>
          <div className="grid grid-cols-8 gap-4">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => handleFolderClick(folder)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 hover:bg-[var(--dome-accent-bg)] focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2"
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center shadow-md transition-transform duration-200 group-hover:scale-105"
                  style={{ backgroundColor: folder.metadata?.color ?? 'var(--dome-accent)' }}
                >
                  <FolderOpen className="w-7 h-7 text-white opacity-90" />
                </div>
                <span className="text-xs text-center truncate w-full leading-tight font-medium" style={{ color: 'var(--dome-text)' }}>
                  {folder.title}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Resources Grid/List */}
      <section className="mb-6" aria-label="Resources">
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--dome-text-secondary)' }}>
          {isSearchMode
            ? `Coincidencias para "${searchQuery}"`
            : currentFolderId
              ? 'Contents'
              : homeSidebarSection === 'recent' ? 'Recientes' : 'Recent Resources'}
        </h2>
      </section>

      {!isSearchMode && isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dome-accent)' }} />
        </div>
      ) : null}

      {!isSearchMode && error ? (
        <div className="text-center py-20">
          <p className="mb-2" style={{ color: 'var(--error)' }}>Failed to load resources</p>
          <button
            onClick={refetch}
            className="btn btn-secondary text-sm"
            style={{ color: 'var(--dome-text)' }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {isSearchMode && resourcesToShow.length === 0 && (
        <div className="text-center py-20">
          <p className="text-sm" style={{ color: 'var(--dome-text-secondary)' }}>
            No hay coincidencias para &quot;{searchQuery}&quot;
          </p>
        </div>
      )}

      {!isSearchMode && !isLoading && !error && nonFolderResources.length === 0 && folders.length === 0 && (
        <div className="text-center py-20">
          <FolderOpen className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--dome-text-muted)' }} />
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--dome-text)' }}>
            {currentFolderId ? 'This folder is empty' : 'No resources yet'}
          </p>
          <p className="text-sm" style={{ color: 'var(--dome-text-secondary)' }}>
            {currentFolderId
              ? 'Drag files here or move resources into this folder'
              : 'Drop files or use the command center to add your first resource'}
          </p>
        </div>
      )}

      {((isSearchMode && resourcesToShow.length > 0) || (!isSearchMode && !isLoading && !error && nonFolderResources.length > 0)) ? (
        <div
          className={viewMode === 'grid'
            ? 'gap-5'
            : 'flex flex-col gap-2'
          }
          style={viewMode === 'grid' ? {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            contentVisibility: 'auto',
          } : {
            contentVisibility: 'auto',
          }}
        >
          {resourcesToShow.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              viewMode={viewMode}
              onClick={() => handleResourceSelect(resource)}
              onMoveToFolder={() => handleMoveToFolderRequest(resource)}
              onDelete={() => handleDeleteResource(resource)}
              onRename={(newTitle) => updateResource(resource.id, { title: newTitle })}
              searchSnippet={isSearchMode && searchResults?.interactions
                ? getSearchSnippetForResource(resource.id, searchResults.interactions)
                : undefined}
            />
          ))}
        </div>
      ) : null}
    </>
  );

  return (
    <HomeLayout>
      <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
        {/* Top Bar */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            background: 'var(--dome-surface)',
            borderBottom: '1px solid var(--dome-border)',
            padding: '16px 32px',
          }}
        >
          {/* Search bar */}
          <div className="relative" style={{ width: '400px' }}>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ width: '16px', height: '16px', color: 'var(--dome-text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search resources..."
              className="w-full"
              style={{
                padding: '8px 16px 8px 36px',
                background: 'var(--dome-bg)',
                border: '1px solid var(--dome-border)',
                borderRadius: '8px',
                fontSize: '13px',
                color: 'var(--dome-text)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--dome-accent)';
                e.currentTarget.style.background = 'var(--dome-surface)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--dome-border)';
                e.currentTarget.style.background = 'var(--dome-bg)';
              }}
            />
          </div>

          {/* Top bar actions */}
          <div className="flex gap-2">
            <button
              className="flex items-center justify-center transition-all duration-200"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'transparent',
                border: '1px solid var(--dome-border)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--dome-bg)';
                e.currentTarget.style.borderColor = 'var(--dome-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--dome-border)';
              }}
            >
              <Bell style={{ width: '18px', height: '18px', color: 'var(--dome-text-secondary)' }} />
            </button>
            <button
              className="flex items-center justify-center transition-all duration-200"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'transparent',
                border: '1px solid var(--dome-border)',
                cursor: 'pointer',
              }}
              onClick={() => {
                if (typeof window !== 'undefined' && window.electron?.openSettings) {
                  window.electron.openSettings();
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--dome-bg)';
                e.currentTarget.style.borderColor = 'var(--dome-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--dome-border)';
              }}
            >
              <Settings style={{ width: '18px', height: '18px', color: 'var(--dome-text-secondary)' }} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '32px' }}>
          <div className="max-w-6xl mx-auto">
            {/* Page header */}
            <div style={{ marginBottom: '32px' }}>
              <h1
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  color: 'var(--dome-text)',
                  marginBottom: '8px',
                  letterSpacing: '-0.02em',
                }}
              >
                {homeSidebarSection === 'library'
                  ? 'Recent Resources'
                  : homeSidebarSection === 'flashcards'
                    ? 'Flashcards'
                    : homeSidebarSection === 'recent'
                      ? 'Recent Resources'
                      : homeSidebarSection === 'tags'
                        ? 'Tags'
                        : homeSidebarSection === 'chat'
                          ? 'Martin Chat'
                          : homeSidebarSection === 'projects'
                            ? 'Projects'
                            : 'Recent Resources'}
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--dome-text-secondary)' }}>
                {homeSidebarSection === 'library' || homeSidebarSection === 'recent'
                  ? 'Your recently updated files and links'
                  : homeSidebarSection === 'flashcards'
                    ? 'Review your flashcard decks'
                    : homeSidebarSection === 'tags'
                      ? 'Browse resources by tag'
                      : homeSidebarSection === 'chat'
                        ? 'Chat with Martin about your resources'
                        : homeSidebarSection === 'projects'
                          ? 'Organize resources by project'
                          : 'Your recently updated files and links'}
              </p>
            </div>

            {/* Section Content */}
            {renderSectionContent()}
          </div>
        </div>

        {/* Import Progress Indicator */}
        {importProgress.status !== 'idle' && (
          <div
            className="fixed bottom-6 right-6 p-4 rounded-xl shadow-lg z-50 min-w-[300px]"
            style={{
              background: 'var(--dome-surface)',
              border: '1px solid var(--dome-border)',
            }}
          >
            <div className="flex items-center gap-3">
              {importProgress.status === 'importing' && (
                <>
                  <div className="relative">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dome-accent)' }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      Importing files ({importProgress.current}/{importProgress.total})
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--dome-text-secondary)' }}>
                      {importProgress.currentFile}
                    </div>
                  </div>
                </>
              )}
              {importProgress.status === 'complete' && (
                <>
                  <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--success)' }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      Import complete!
                    </div>
                    <div className="text-xs" style={{ color: 'var(--dome-text-secondary)' }}>
                      {importProgress.total} file(s) imported successfully
                    </div>
                  </div>
                </>
              )}
              {importProgress.status === 'error' && (
                <>
                  <AlertCircle className="w-5 h-5" style={{ color: 'var(--warning)' }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      Import completed with errors
                    </div>
                    <div className="text-xs" style={{ color: 'var(--dome-text-secondary)' }}>
                      {importProgress.error}
                    </div>
                  </div>
                </>
              )}
            </div>
            {importProgress.status === 'importing' ? (
              <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                <div
                  className="h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                    background: 'var(--dome-accent)',
                  }}
                />
              </div>
            ) : null}
          </div>
        )}

        {/* New Folder Modal */}
        {showNewFolderModal ? (
          <div
            className="modal-overlay"
            onClick={() => setShowNewFolderModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-folder-title"
          >
            <div
              className="modal-content max-w-md animate-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3 id="new-folder-title" className="text-lg font-semibold font-display" style={{ color: 'var(--dome-text)' }}>
                  Create New Folder
                </h3>
              </div>
              <div className="modal-body">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name..."
                  className="input mb-4"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') setShowNewFolderModal(false);
                  }}
                />
              </div>
              <div className="modal-footer">
                <button onClick={() => setShowNewFolderModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="btn btn-primary"
                >
                  <Plus size={16} className="inline mr-1" />
                  Create Folder
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Move to Folder Modal */}
        {showMoveModal && resourceToMove ? (
          <div
            className="modal-overlay"
            onClick={() => { setShowMoveModal(false); setResourceToMove(null); }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-resource-title"
          >
            <div
              className="modal-content max-w-md animate-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3 id="move-resource-title" className="text-lg font-semibold font-display" style={{ color: 'var(--dome-text)' }}>
                  Move &quot;{resourceToMove.title}&quot;
                </h3>
                <button
                  onClick={() => { setShowMoveModal(false); setResourceToMove(null); }}
                  className="btn btn-ghost p-1.5 rounded-md"
                  aria-label="Close"
                >
                  <X size={20} style={{ color: 'var(--dome-text-secondary)' }} />
                </button>
              </div>

              <div className="modal-body max-h-80 overflow-y-auto">
                {resourceToMove.folder_id ? (
                  <button
                    onClick={() => handleMoveToFolder(null)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg transition-colors mb-2 hover:bg-[var(--dome-accent-bg)]"
                  >
                    <HomeIcon className="w-5 h-5" style={{ color: 'var(--dome-accent)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      Move to Root
                    </span>
                  </button>
                ) : null}

                {allFolders.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--dome-text-secondary)' }}>
                    No folders yet. Create a folder first.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {allFolders
                      .filter(folder => folder.id !== resourceToMove.id)
                      .map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => handleMoveToFolder(folder.id)}
                          disabled={folder.id === resourceToMove.folder_id}
                          className="w-full flex items-center gap-3 p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--dome-accent-bg)]"
                        >
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                            style={{ backgroundColor: folder.metadata?.color ?? 'var(--dome-accent)' }}
                          >
                            <FolderOpen className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-sm" style={{ color: 'var(--dome-text)' }}>
                            {folder.title}
                          </span>
                          {folder.id === resourceToMove.folder_id ? (
                            <span className="ml-auto text-xs" style={{ color: 'var(--dome-text-secondary)' }}>
                              (current)
                            </span>
                          ) : null}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  onClick={() => { setShowMoveModal(false); setResourceToMove(null); }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={!!deleteTarget}
          title="Delete resource"
          message={`Are you sure you want to delete "${deleteTarget?.title || ''}"? This action cannot be undone.`}
          variant="danger"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </HomeLayout>
  );
}
