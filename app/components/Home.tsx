'use client';

import { useState, useCallback } from 'react';
import { FolderOpen, FolderInput, Plus, Loader2, CheckCircle2, AlertCircle, Upload, ChevronRight, Home as HomeIcon, X } from 'lucide-react';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import UserMenu from './user/UserMenu';
import { CommandCenter } from './CommandCenter';
import FilterBar from './FilterBar';
import ResourceCard from './ResourceCard';
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
    if (t) return t.length > 80 ? t.slice(0, 80) + '…' : t;
  }
  return undefined;
}

export default function Home() {
  const { name } = useUserStore();
  const searchQuery = useAppStore((s) => s.searchQuery);
  const searchResults = useAppStore((s) => s.searchResults);

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
    moveToFolder,
    getFolderById
  } = useResources({
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
    folderId: currentFolderId, // Filter by current folder
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
      // NO refetch - el listener se encargará de actualizar
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [createResource]);

  const handleUpload = useCallback((files: File[]) => {
    console.log('Upload files:', files);
    // File objects from drag-drop - would need to extract paths
    // For Electron, we handle file paths directly via handleImportFiles
  }, []);

  const handleImportFiles = useCallback(async (filePaths: string[]) => {
    console.log('Importing files:', filePaths, 'into folder:', currentFolderId);
    // Pass currentFolderId so files are imported directly into the current folder
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
      // Always create as 'url' type for consistency
      const resourceType = 'url';

      const result = await createResource({
        type: resourceType as ResourceType,
        title: type === 'youtube' ? 'YouTube Video' : 'Web Article', // Will be updated after processing
        project_id: 'default',
        content: url,
        folder_id: currentFolderId,
        metadata: {
          url: url,
          url_type: type,
          processing_status: 'pending',
        }
      });

      // Start processing in background
      if (result?.id && window.electron?.web?.process) {
        // Process asynchronously without blocking
        window.electron.web.process(result.id).catch((error) => {
          console.error('Error processing URL resource:', error);
        });
      }

      // NO refetch - el listener se encargará de actualizar
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
        folder_id: currentFolderId, // Create inside current folder if any
      });
      setNewFolderName('');
      setShowNewFolderModal(false);
      // NO refetch - el listener se encargará de actualizar
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

  const handleDeleteResource = useCallback(async (resource: Resource) => {
    if (confirm(`Are you sure you want to delete "${resource.title}"?`)) {
      await deleteResource(resource.id);
    }
  }, [deleteResource]);

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-display font-semibold tracking-tight" style={{ color: 'var(--primary-text)' }}>
            Welcome back, {name || 'User'}
          </h1>
          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost px-3 py-1.5 text-sm rounded-lg transition-all duration-200"
              style={{
                color: 'var(--secondary-text)',
                background: 'var(--bg-secondary)'
              }}
            >
              View Updates
            </button>
            <UserMenu />
          </div>
        </header>

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

        {/* Import Progress Indicator */}
        {importProgress.status !== 'idle' && (
          <div
            className="fixed bottom-6 right-6 p-4 rounded-xl shadow-lg z-50 min-w-[300px]"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="flex items-center gap-3">
              {importProgress.status === 'importing' && (
                <>
                  <div className="relative">
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                      Importing files ({importProgress.current}/{importProgress.total})
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--secondary-text)' }}>
                      {importProgress.currentFile}
                    </div>
                  </div>
                </>
              )}
              {importProgress.status === 'complete' && (
                <>
                  <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--success)' }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                      Import complete!
                    </div>
                    <div className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                      {importProgress.total} file(s) imported successfully
                    </div>
                  </div>
                </>
              )}
              {importProgress.status === 'error' && (
                <>
                  <AlertCircle className="w-5 h-5" style={{ color: 'var(--warning)' }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                      Import completed with errors
                    </div>
                    <div className="text-xs" style={{ color: 'var(--secondary-text)' }}>
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
                    background: 'var(--accent)',
                  }}
                />
              </div>
            ) : null}
          </div>
        )}

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
          <nav className="mb-6 flex items-center gap-2" style={{ color: 'var(--secondary-text)' }} aria-label="Breadcrumb">
            <button
              onClick={handleNavigateToRoot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--accent)' }}
            >
              <HomeIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Home</span>
            </button>
            <ChevronRight className="w-4 h-4 opacity-70" />
            <span className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
              {currentFolder?.title ?? 'Unknown Folder'}
            </span>
          </nav>
        ) : null}

        {/* Folders Section - Only show subfolders or root folders */}
        {folders.length > 0 ? (
          <section className="mb-10" aria-label="Folders">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--secondary-text)' }}>
              {currentFolderId ? 'Subfolders' : 'Folders'}
            </h2>
            <div className="grid grid-cols-8 gap-4">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleFolderClick(folder)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 hover:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center shadow-md transition-transform duration-200 group-hover:scale-105"
                    style={{ backgroundColor: folder.metadata?.color ?? 'var(--accent)' }}
                  >
                    <FolderOpen className="w-7 h-7 text-white opacity-90" />
                  </div>
                  <span className="text-xs text-center truncate w-full leading-tight font-medium" style={{ color: 'var(--primary-text)' }}>
                    {folder.title}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* Resources Grid/List */}
        <section className="mb-6" aria-label="Resources">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--secondary-text)' }}>
            {isSearchMode
              ? `Coincidencias para "${searchQuery}"`
              : currentFolderId
                ? 'Contents'
                : 'Recent Resources'}
          </h2>
        </section>

        {!isSearchMode && isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : null}

        {!isSearchMode && error ? (
          <div className="text-center py-20">
            <p className="mb-2" style={{ color: 'var(--error)' }}>Failed to load resources</p>
            <button
              onClick={refetch}
              className="btn btn-secondary text-sm"
              style={{ color: 'var(--accent)' }}
            >
              Try again
            </button>
          </div>
        ) : null}

        {isSearchMode && resourcesToShow.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
              No hay coincidencias para &quot;{searchQuery}&quot;
            </p>
          </div>
        )}

        {!isSearchMode && !isLoading && !error && nonFolderResources.length === 0 && folders.length === 0 && (
          <div className="text-center py-20">
            <FolderOpen className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--tertiary-text)' }} />
            <p className="text-lg font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
              {currentFolderId ? 'This folder is empty' : 'No resources yet'}
            </p>
            <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
              {currentFolderId
                ? 'Drag files here or move resources into this folder'
                : 'Drop files or use the command center to add your first resource'}
            </p>
          </div>
        )}

        {((isSearchMode && resourcesToShow.length > 0) || (!isSearchMode && !isLoading && !error && nonFolderResources.length > 0)) ? (
          <div
            className={viewMode === 'grid'
              ? 'grid grid-cols-4 gap-4'
              : 'flex flex-col gap-2'
            }
            style={{ contentVisibility: 'auto' }}
          >
            {resourcesToShow.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                viewMode={viewMode}
                onClick={() => handleResourceSelect(resource)}
                onMoveToFolder={() => handleMoveToFolderRequest(resource)}
                onDelete={() => handleDeleteResource(resource)}
                searchSnippet={isSearchMode && searchResults?.interactions
                  ? getSearchSnippetForResource(resource.id, searchResults.interactions)
                  : undefined}
              />
            ))}
          </div>
        ) : null}

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
                <h3 id="new-folder-title" className="text-lg font-semibold font-display" style={{ color: 'var(--primary-text)' }}>
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
                <h3 id="move-resource-title" className="text-lg font-semibold font-display" style={{ color: 'var(--primary-text)' }}>
                  Move &quot;{resourceToMove.title}&quot;
                </h3>
                <button
                  onClick={() => { setShowMoveModal(false); setResourceToMove(null); }}
                  className="btn btn-ghost p-1.5 rounded-md"
                  aria-label="Close"
                >
                  <X size={20} style={{ color: 'var(--secondary-text)' }} />
                </button>
              </div>

              <div className="modal-body max-h-80 overflow-y-auto">
                {resourceToMove.folder_id ? (
                  <button
                    onClick={() => handleMoveToFolder(null)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg transition-colors mb-2 hover:bg-[var(--bg-secondary)]"
                  >
                    <HomeIcon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                      Move to Root
                    </span>
                  </button>
                ) : null}

                {allFolders.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--secondary-text)' }}>
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
                          className="w-full flex items-center gap-3 p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)]"
                        >
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                            style={{ backgroundColor: folder.metadata?.color ?? 'var(--accent)' }}
                          >
                            <FolderOpen className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-sm" style={{ color: 'var(--primary-text)' }}>
                            {folder.title}
                          </span>
                          {folder.id === resourceToMove.folder_id ? (
                            <span className="ml-auto text-xs" style={{ color: 'var(--secondary-text)' }}>
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
      </div>
    </div>
  );
}

