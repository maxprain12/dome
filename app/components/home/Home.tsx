
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { FolderOpen, Plus, Loader2, CheckCircle2, AlertCircle, ChevronRight, Home as HomeIcon, X, Tags as TagsIcon, FolderOpen as ProjectIcon, MessageCircle, MoreVertical, Pencil, Trash2, ExternalLink, FolderInput } from 'lucide-react';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { CommandCenter } from '@/components/CommandCenter/CommandCenter';
import FilterBar from './FilterBar';
import ResourceCard from './ResourceCard';
import HomeLayout from './HomeLayout';
import InlineFolderNav from './InlineFolderNav';
import DocumentToolbar from './DocumentToolbar';
import SelectionActionBar from './SelectionActionBar';
import ContextMenu from './ContextMenu';
import FlashcardDeckList from '@/components/flashcards/FlashcardDeckList';
import StudioHomeView from '@/components/studio/StudioHomeView';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useResources, type ResourceType, type Resource } from '@/lib/hooks/useResources';
import { serializeNotebookContent } from '@/lib/notebook/default-notebook';

/** Paleta derivada del acento #596037 — tonos verde/oliva + grises neutros */
const FOLDER_COLORS = [
  '#596037',
  '#6d7a42',
  '#7d8b52',
  '#8a9668',
  '#4a5429',
  '#3d4622',
  '#6b7280',
  '#9ca3af',
];

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
  const setCurrentFolderIdInStore = useAppStore((s) => s.setCurrentFolderId);

  // Resource fetching and filtering
  const [selectedTypes, setSelectedTypes] = useState<ResourceType[]>([]);
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'title'>('updated_at');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#596037');

  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Move to folder modal state (ids to move - from single resource or multi-select)
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [resourceToMove, setResourceToMove] = useState<Resource | null>(null);
  const [moveTargetIds, setMoveTargetIds] = useState<string[]>([]);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);

  // Folder menu and rename state
  const [folderMenuOpenId, setFolderMenuOpenId] = useState<string | null>(null);
  const [folderMenuPosition, setFolderMenuPosition] = useState({ top: 0, left: 0 });
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderValue, setRenamingFolderValue] = useState('');
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const folderMenuTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Drag-and-drop state for moving resources to folders
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Multi-select state for resources
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number>(-1);


  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    resource: Resource;
    x: number;
    y: number;
  } | null>(null);

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
    getFolderById,
    getBreadcrumbPath
  } = useResources({
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
    folderId: currentFolderId,
    sortBy,
    sortOrder: 'desc'
  });

  // Sync current folder to store so Martin AI knows the scope when user asks "these documents"
  useEffect(() => {
    setCurrentFolderIdInStore(currentFolderId);
    return () => setCurrentFolderIdInStore(null);
  }, [currentFolderId, setCurrentFolderIdInStore]);

  // Reset drag-over state when drag ends (e.g. user drops outside drop zones)
  useEffect(() => {
    const handleDragEnd = () => setDragOverFolderId(null);
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, []);

  // Escape to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedResourceIds(new Set());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Get current folder and breadcrumb path for navigation
  const currentFolder = currentFolderId ? getFolderById(currentFolderId) : null;
  const breadcrumbPath = useMemo(
    () => (currentFolderId ? getBreadcrumbPath(currentFolderId) : []),
    [currentFolderId, getBreadcrumbPath]
  );

  // Search mode: when there is a query and we have results (or explicit empty) from CommandCenter
  const isSearchMode = Boolean(searchQuery && searchResults !== null);
  const rawSearchResources = searchResults?.resources ?? [];
  const resourcesToShow = isSearchMode
    ? rawSearchResources.filter((r: Resource) => r.type !== 'folder')
    : nonFolderResources;

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

    // In search mode we don't show folders; if one slips through, open as workspace (or no-op)
    if (resource.type === 'folder') {
      if (!isSearchMode) setCurrentFolderId(resource.id);
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
  }, [isSearchMode]);

  const handleResourceClick = useCallback(
    (resource: Resource, event: React.MouseEvent) => {
      const idx = resourcesToShow.findIndex((r) => r.id === resource.id);
      const meta = event.metaKey || event.ctrlKey;
      const shift = event.shiftKey;

      if (meta) {
        setSelectedResourceIds((prev) => {
          const next = new Set(prev);
          if (next.has(resource.id)) next.delete(resource.id);
          else next.add(resource.id);
          return next;
        });
        lastSelectedIndexRef.current = idx;
        return;
      }

      if (shift) {
        const from = lastSelectedIndexRef.current >= 0 ? lastSelectedIndexRef.current : idx;
        const lo = Math.min(from, idx);
        const hi = Math.max(from, idx);
        setSelectedResourceIds(
          new Set(resourcesToShow.slice(lo, hi + 1).filter((r) => r.type !== 'folder').map((r) => r.id))
        );
        lastSelectedIndexRef.current = idx;
        return;
      }

      setSelectedResourceIds(new Set());
      handleResourceSelect(resource);
    },
    [resourcesToShow, handleResourceSelect]
  );

  const handleCreateNote = useCallback(async () => {
    try {
      await createResource({
        type: 'note',
        title: 'Untitled Note',
        project_id: 'default',
        content: '',
        folder_id: currentFolderId,
      });
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [createResource, currentFolderId]);

  const handleCreateNotebook = useCallback(async () => {
    try {
      const nb = await createResource({
        type: 'notebook',
        title: 'Untitled Notebook',
        project_id: 'default',
        content: serializeNotebookContent({
          nbformat: 4,
          nbformat_minor: 1,
          cells: [
            { cell_type: 'markdown', source: '# Python Notebook\n\nEscribe y ejecuta código Python.', metadata: {} },
            { cell_type: 'code', source: 'print("Hello from Python!")', outputs: [], execution_count: null, metadata: {} },
          ],
          metadata: { kernelspec: { display_name: 'Python 3 (Pyodide)', name: 'python3', language: 'python' } },
        }),
        folder_id: currentFolderId,
      });
      if (nb?.id && window.electron?.workspace?.open) {
        await window.electron.workspace.open(nb.id, 'notebook');
      }
    } catch (err) {
      console.error('Failed to create notebook:', err);
    }
  }, [createResource, currentFolderId]);

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
        metadata: { color: newFolderColor },
      });
      setNewFolderName('');
      setNewFolderColor('#596037');
      setShowNewFolderModal(false);
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, [newFolderName, newFolderColor, createResource, currentFolderId]);

  const handleFolderClick = useCallback((folder: Resource) => {
    setCurrentFolderId(folder.id);
  }, []);

  const handleNavigateToRoot = useCallback(() => {
    setCurrentFolderId(null);
  }, []);

  const handleNavigateToFolder = useCallback((folderId: string) => {
    setCurrentFolderId(folderId);
  }, []);

  const handleMoveToFolderRequest = useCallback((resource: Resource) => {
    setResourceToMove(resource);
    setMoveTargetIds([resource.id]);
    setShowMoveModal(true);
  }, []);

  const handleMoveMultipleRequest = useCallback(() => {
    const ids = Array.from(selectedResourceIds);
    if (ids.length === 0) return;
    const first = resourcesToShow.find((r) => r.id === ids[0]);
    setResourceToMove(first ?? null);
    setMoveTargetIds(ids);
    setShowMoveModal(true);
  }, [selectedResourceIds, resourcesToShow]);

  const handleMoveToFolder = useCallback(
    async (targetFolderId: string | null) => {
      const ids = moveTargetIds.length > 0 ? moveTargetIds : resourceToMove ? [resourceToMove.id] : [];
      if (ids.length === 0) return;

      let moved = 0;
      for (const id of ids) {
        const success = await moveToFolder(id, targetFolderId);
        if (success) moved++;
      }

      setShowMoveModal(false);
      setResourceToMove(null);
      setMoveTargetIds([]);
      setSelectedResourceIds(new Set());
      if (moved > 0) refetch();
    },
    [resourceToMove, moveTargetIds, moveToFolder, refetch]
  );

  const getDroppedResourceIds = useCallback((e: React.DragEvent): string[] => {
    const multi = e.dataTransfer.getData('application/x-dome-resource-ids');
    if (multi) {
      try {
        const ids = JSON.parse(multi) as string[];
        return Array.isArray(ids) ? ids : [];
      } catch {
        return [];
      }
    }
    const single = e.dataTransfer.getData('application/x-dome-resource-id');
    return single ? [single] : [];
  }, []);

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    const hasDome =
      e.dataTransfer.types.includes('application/x-dome-resource-id') ||
      e.dataTransfer.types.includes('application/x-dome-resource-ids');
    if (!hasDome) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  }, []);

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    const current = e.currentTarget;
    if (related && current.contains(related)) return;
    setDragOverFolderId(null);
  }, []);

  const handleFolderDrop = useCallback(
    async (e: React.DragEvent, folderId: string) => {
      e.preventDefault();
      setDragOverFolderId(null);
      const ids = getDroppedResourceIds(e);
      if (ids.length === 0) return;
      let moved = 0;
      for (const resourceId of ids) {
        const success = await moveToFolder(resourceId, folderId);
        if (success) moved++;
      }
      if (moved > 0) {
        setSelectedResourceIds(new Set());
        refetch();
      }
    },
    [moveToFolder, refetch, getDroppedResourceIds]
  );

  const handleDeleteResource = useCallback((resource: Resource) => {
    setDeleteTarget(resource);
  }, []);

  const handleResourceContextMenu = useCallback((e: React.MouseEvent, resource: Resource) => {
    setContextMenu({ resource, x: e.clientX, y: e.clientY });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedResourceIds);
    if (ids.length === 0) return;
    const first = resourcesToShow.find((r) => r.id === ids[0]);
    setDeleteTarget(first ?? null);
    setBulkDeleteIds(ids);
  }, [selectedResourceIds, resourcesToShow]);

  const handleFolderColorChange = useCallback(
    async (folder: Resource, color: string) => {
      await updateResource(folder.id, { metadata: { ...folder.metadata, color } });
      setFolderMenuOpenId(null);
    },
    [updateResource]
  );

  const handleFolderRenameStart = useCallback((folder: Resource) => {
    setFolderMenuOpenId(null);
    setRenamingFolderId(folder.id);
    setRenamingFolderValue(folder.title);
  }, []);

  const handleFolderRenameSave = useCallback(
    async (folderId: string) => {
      if (renamingFolderValue.trim()) {
        await updateResource(folderId, { title: renamingFolderValue.trim() });
      }
      setRenamingFolderId(null);
      setRenamingFolderValue('');
    },
    [renamingFolderValue, updateResource]
  );

  const handleFolderMenuToggle = useCallback((e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    const trigger = folderMenuTriggerRefs.current.get(folderId);
    if (trigger && folderMenuOpenId !== folderId) {
      const rect = trigger.getBoundingClientRect();
      setFolderMenuPosition({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - 220),
      });
    }
    setFolderMenuOpenId((prev) => (prev === folderId ? null : folderId));
  }, [folderMenuOpenId]);

  // Close folder menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!folderMenuOpenId) return;
      if (folderMenuRef.current?.contains(target)) return;
      if ((target as Element).closest?.('.folder-menu-trigger')) return;
      setFolderMenuOpenId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [folderMenuOpenId]);

  const confirmDelete = useCallback(async () => {
    const idsToDelete = bulkDeleteIds.length > 0 ? bulkDeleteIds : deleteTarget ? [deleteTarget.id] : [];
    if (idsToDelete.length === 0) return;

    for (const id of idsToDelete) {
      const wasCurrentFolder = id === currentFolderId;
      await deleteResource(id);
      if (wasCurrentFolder) setCurrentFolderId(null);
    }
    setSelectedResourceIds(new Set());
    setDeleteTarget(null);
    setBulkDeleteIds([]);
  }, [deleteTarget, bulkDeleteIds, deleteResource, currentFolderId]);

  // Render content based on active section
  const renderSectionContent = () => {
    switch (homeSidebarSection) {
      case 'studio':
        return <StudioHomeView />;

      case 'flashcards':
        return <FlashcardDeckList />;

      case 'chat':
        return (
          <div className="dashboard-empty-state">
            <div className="dashboard-icon-wrapper">
              <MessageCircle className="dashboard-icon" />
            </div>
            <h3 className="dashboard-title">
              Martin Chat
            </h3>
            <p className="dashboard-description">
              Abre un recurso para chatear con Martin sobre su contenido.
            </p>
          </div>
        );

      case 'projects':
        return (
          <div className="dashboard-empty-state">
            <div className="dashboard-icon-wrapper">
              <ProjectIcon className="dashboard-icon" />
            </div>
            <h3 className="dashboard-title">
              Proyectos
            </h3>
            <p className="dashboard-description">
              Organiza tus recursos por proyecto. Proximamente.
            </p>
          </div>
        );

      case 'recent':
        return renderLibraryContent();

      case 'tags':
        return (
          <div className="dashboard-empty-state">
            <div className="dashboard-icon-wrapper">
              <TagsIcon className="dashboard-icon" />
            </div>
            <h3 className="dashboard-title">
              Etiquetas
            </h3>
            <p className="dashboard-description">
              Navega tus recursos por etiquetas. Proximamente.
            </p>
          </div>
        );

      case 'library':
      default:
        return renderLibraryContent();
    }
  };

  const setCommandCenterOpen = useAppStore((s) => s.setCommandCenterOpen);
  const setCommandCenterUrlModeRequest = useAppStore((s) => s.setCommandCenterUrlModeRequest);

  const showInlineFolderNav = !isSearchMode && (homeSidebarSection === 'library' || homeSidebarSection === 'recent');

  const renderLibraryContent = () => (
    <>
      <div
        className={showInlineFolderNav ? 'flex w-full min-w-0' : 'w-full'}
        style={{ alignItems: 'stretch', overflow: 'hidden' }}
      >
        {showInlineFolderNav && (
          <div
            className="flex-shrink-0 flex flex-col min-h-0 pt-[140px]"
            style={{
              width: 200,
              // Subtle border or no border depending on preference. 
              // Using a very subtle border for separation without heaviness
              borderRight: '1px solid var(--dome-border-subtle, rgba(0,0,0,0.03))',
            }}
          >
            {/* Breadcrumb — only visible when inside a folder */}
            {currentFolderId && breadcrumbPath.length > 0 ? (
              <nav
                className="flex items-center gap-1.5 px-4 py-3 shrink-0 text-xs"
                aria-label="Current path"
              >
                <button
                  type="button"
                  onClick={handleNavigateToRoot}
                  className="flex items-center gap-1 text-[var(--dome-text-secondary)] hover:text-[var(--dome-text)] transition-colors"
                  aria-label="All documents"
                >
                  <HomeIcon size={12} strokeWidth={1.5} />
                  <span>All</span>
                </button>
                {breadcrumbPath.map((folder, index) => {
                  const isLast = index === breadcrumbPath.length - 1;
                  return (
                    <span
                      key={folder.id}
                      className="flex items-center gap-1.5 min-w-0"
                    >
                      <ChevronRight size={10} strokeWidth={1.5} className="text-[var(--dome-text-muted)] shrink-0" />
                      {isLast ? (
                        <span
                          className="font-medium truncate max-w-[100px]"
                          style={{ color: 'var(--dome-text)' }}
                        >
                          {folder.title}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleNavigateToFolder(folder.id)}
                          className="text-[var(--dome-text-secondary)] hover:text-[var(--dome-text)] truncate max-w-[80px] transition-colors"
                        >
                          {folder.title}
                        </button>
                      )}
                    </span>
                  );
                })}
              </nav>
            ) : <div className="h-4" />} {/* Spacer when no breadcrumb */}

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <InlineFolderNav
                allFolders={allFolders}
                currentFolderId={currentFolderId}
                onFolderSelect={setCurrentFolderId}
                moveToFolder={moveToFolder}
                refetch={refetch}
                onContextMenu={(e, resource) => {
                  e.preventDefault();
                  setContextMenu({ resource, x: e.clientX, y: e.clientY });
                }}
              />
            </div>
          </div>
        )}
        <div
          className={showInlineFolderNav ? 'flex-1 min-w-0 overflow-hidden' : 'w-full'}
          style={showInlineFolderNav ? { paddingLeft: 32 } : undefined}
        >
          {/* Document Toolbar - path bar + quick actions */}
          {!isSearchMode && (
            <DocumentToolbar
              breadcrumbPath={breadcrumbPath}
              onNavigateToRoot={handleNavigateToRoot}
              onNavigateToFolder={handleNavigateToFolder}
              onCreateNote={handleCreateNote}
              onCreateNotebook={handleCreateNotebook}
              onImportFiles={handleImportFiles}
              onAddUrl={() => {
                setCommandCenterOpen(true);
                setCommandCenterUrlModeRequest(true);
              }}
              onCreateFolder={() => setShowNewFolderModal(true)}
              hidePath={showInlineFolderNav}
            />
          )}

          {/* Command Center - AI-powered search (primary focus) */}
          <div className="mb-10">
            <CommandCenter
              onResourceSelect={handleResourceSelect}
              onCreateNote={handleCreateNote}
              onCreateNotebook={handleCreateNotebook}
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
          />

          {/* Selection Action Bar — when items selected */}
          {!isSearchMode && (
            <SelectionActionBar
              count={selectedResourceIds.size}
              onMove={handleMoveMultipleRequest}
              onDelete={handleDeleteSelected}
              onDeselect={() => setSelectedResourceIds(new Set())}
            />
          )}

          {/* Folders Section — hidden in search mode to avoid fake "contents inside folder" */}
          {!isSearchMode && folders.length > 0 ? (
            <section className="mb-10" aria-label="Folders">
              <h2 className="section-header">
                {currentFolderId ? 'Subfolders' : 'Folders'}
              </h2>
              <div className="folder-grid">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={`folder-item-wrapper group relative ${dragOverFolderId === folder.id ? 'drag-over' : ''}`}
                    onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                    onDragLeave={handleFolderDragLeave}
                    onDrop={(e) => handleFolderDrop(e, folder.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ resource: folder, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <button
                      onClick={() => handleFolderClick(folder)}
                      className="folder-item"
                    >
                      <div
                        className="folder-icon-wrapper"
                        style={{ backgroundColor: folder.metadata?.color ?? 'var(--accent)' }}
                      >
                        <FolderOpen className="w-7 h-7 text-white opacity-90" />
                      </div>
                      {renamingFolderId === folder.id ? (
                        <input
                          type="text"
                          value={renamingFolderValue}
                          onChange={(e) => setRenamingFolderValue(e.target.value)}
                          onBlur={() => handleFolderRenameSave(folder.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFolderRenameSave(folder.id);
                            if (e.key === 'Escape') {
                              setRenamingFolderId(null);
                              setRenamingFolderValue('');
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="folder-rename-input"
                          autoFocus
                        />
                      ) : (
                        <span className="folder-title">{folder.title}</span>
                      )}
                    </button>
                    <button
                      ref={(el) => {
                        if (el) folderMenuTriggerRefs.current.set(folder.id, el);
                      }}
                      type="button"
                      className="folder-menu-trigger folder-item-menu-btn"
                      onClick={(e) => handleFolderMenuToggle(e, folder.id)}
                      aria-label="Folder options"
                      aria-expanded={folderMenuOpenId === folder.id}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {folderMenuOpenId === folder.id ? (
                      <div
                        ref={folderMenuRef}
                        className="dropdown-menu"
                        style={{
                          top: folderMenuPosition.top,
                          left: folderMenuPosition.left,
                        }}
                      >
                        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                          <span className="text-xs font-medium" style={{ color: 'var(--secondary-text)' }}>
                            Folder color
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {FOLDER_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => handleFolderColorChange(folder, color)}
                                className="w-6 h-6 rounded border-2 transition-all focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)]"
                                style={{
                                  backgroundColor: color,
                                  borderColor: (folder.metadata?.color ?? 'var(--accent)') === color ? 'var(--dome-accent)' : 'var(--border)',
                                }}
                                aria-label={`Color ${color}`}
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="dropdown-item"
                          onClick={() => handleFolderRenameStart(folder)}
                        >
                          <Pencil size={16} />
                          Rename
                        </button>
                        <button
                          type="button"
                          className="dropdown-item danger"
                          onClick={() => {
                            setFolderMenuOpenId(null);
                            handleDeleteResource(folder);
                          }}
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Resources Grid/List */}
          <section className="mb-6" aria-label="Resources">
            <h2 className="section-header">
              {isSearchMode
                ? `Coincidencias para "${searchQuery}"`
                : currentFolderId
                  ? 'Contents'
                  : homeSidebarSection === 'recent' ? 'Recientes' : 'Recent Resources'}
            </h2>
          </section>

          {!isSearchMode && isLoading ? (
            <div className={viewMode === 'grid' ? 'resources-grid' : 'resources-list'}>
              {Array.from({ length: viewMode === 'grid' ? 8 : 6 }).map((_, i) => (
                <div
                  key={i}
                  className={viewMode === 'grid' ? 'resource-card-skeleton' : 'resource-card-list-skeleton'}
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : null}

          {!isSearchMode && error ? (
            <div className="error-container">
              <p className="error-message">Error al cargar los recursos</p>
              <button
                onClick={refetch}
                className="btn btn-secondary text-sm try-again-btn"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {isSearchMode && resourcesToShow.length === 0 ? (
            <div className="no-matches-container">
              <p className="no-matches-text">
                No hay coincidencias para &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : null}

          {!isSearchMode && !isLoading && !error && nonFolderResources.length === 0 && folders.length === 0 ? (
            <div className="empty-folder-state">
              <FolderOpen className="empty-folder-icon" aria-hidden="true" />
              <p className="empty-folder-title">
                {currentFolderId ? 'Esta carpeta está vacía' : 'Aún no hay recursos'}
              </p>
              <p className="empty-folder-description">
                {currentFolderId
                  ? 'Arrastra aquí o usa el toolbar para añadir'
                  : 'Arrastra archivos o usa el toolbar para añadir tu primer recurso'}
              </p>
            </div>
          ) : null}

          {((isSearchMode && resourcesToShow.length > 0) || (!isSearchMode && !isLoading && !error && nonFolderResources.length > 0)) ? (
            <div
              className={viewMode === 'list' ? 'resources-list-wrapper' : undefined}
              onClick={(e) => {
                if (!(e.target as Element).closest('.resource-card-grid, .resource-card-list')) {
                  setSelectedResourceIds(new Set());
                }
              }}
              role="presentation"
            >
              {viewMode === 'list' && (
                <div
                  className="resources-list-header"
                  role="row"
                  aria-label="Column headers for resource list"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 130px 90px 44px',
                    gap: 12,
                    padding: '8px 16px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--secondary-text)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span role="columnheader">
                    <button
                      type="button"
                      className="list-header-btn"
                      onClick={() => setSortBy('title')}
                      aria-label="Sort by name"
                    >
                      Name {sortBy === 'title' ? '▾' : ''}
                    </button>
                  </span>
                  <span role="columnheader">Type</span>
                  <span role="columnheader">
                    <button
                      type="button"
                      className="list-header-btn"
                      onClick={() => setSortBy('updated_at')}
                      aria-label="Sort by modified date"
                    >
                      Modified {sortBy === 'updated_at' ? '▾' : ''}
                    </button>
                  </span>
                  <span role="columnheader">Size</span>
                  <span role="columnheader" aria-hidden="true" />
                </div>
              )}
              <div className={viewMode === 'grid' ? 'resources-grid' : 'resources-list'} role={viewMode === 'list' ? 'grid' : undefined} aria-label={viewMode === 'list' ? 'Resources' : undefined}>
                {resourcesToShow.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    viewMode={viewMode}
                    onClick={(e) => handleResourceClick(resource, e)}
                    onDelete={() => handleDeleteResource(resource)}
                    onContextMenu={handleResourceContextMenu}
                    isSelected={selectedResourceIds.has(resource.id)}
                    selectedResourceIds={selectedResourceIds}
                    searchSnippet={isSearchMode && searchResults?.interactions
                      ? getSearchSnippetForResource(resource.id, searchResults.interactions)
                      : undefined}
                    searchOrigin={isSearchMode && resource.folder_id
                      ? (getBreadcrumbPath(resource.folder_id).map((f) => f.title).join(' / ') || undefined)
                      : undefined}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <HomeLayout>
      <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
        {/* Content Area */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '32px' }}>
          <div className="max-w-6xl mx-auto">
            {/* Page header */}
            <div className="page-header">
              <h1 className="page-title">
                {homeSidebarSection === 'library'
                  ? 'Recent Resources'
                  : homeSidebarSection === 'studio'
                    ? 'Studio'
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
              <p className="page-subtitle">
                {homeSidebarSection === 'library' || homeSidebarSection === 'recent'
                  ? 'Your recently updated files and links'
                  : homeSidebarSection === 'studio'
                    ? 'Genera materiales de estudio con IA desde tus recursos'
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
        {importProgress.status !== 'idle' ? (
          <div className="import-progress-card">
            <div className="flex items-center gap-3">
              {importProgress.status === 'importing' ? (
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
              ) : null}
              {importProgress.status === 'complete' ? (
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
              ) : null}
              {importProgress.status === 'error' ? (
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
              ) : null}
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
                <h3 id="new-folder-title" className="text-lg font-semibold font-display" style={{ color: 'var(--dome-text)' }}>
                  Create New Folder
                </h3>
              </div>
              <div className="modal-body">
                <label htmlFor="new-folder-name" className="sr-only">Folder name</label>
                <input
                  id="new-folder-name"
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
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dome-text-secondary)' }}>
                    Folder color
                  </label>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Select folder color"
                  >
                    {FOLDER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewFolderColor(color)}
                        className="w-8 h-8 rounded-lg border-2 transition-all focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2"
                        style={{
                          backgroundColor: color,
                          borderColor: newFolderColor === color ? 'var(--dome-accent)' : 'var(--border)',
                          transform: newFolderColor === color ? 'scale(1.1)' : 'scale(1)',
                        }}
                        aria-label={`Select color ${color}`}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
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
        {showMoveModal && (resourceToMove || moveTargetIds.length > 0) ? (
          <div
            className="modal-overlay"
            onClick={() => { setShowMoveModal(false); setResourceToMove(null); setMoveTargetIds([]); }}
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
                  {moveTargetIds.length > 1
                    ? `Move ${moveTargetIds.length} items`
                    : `Move "${resourceToMove?.title ?? 'item'}"`}
                </h3>
                <button
                  onClick={() => { setShowMoveModal(false); setResourceToMove(null); setMoveTargetIds([]); }}
                  className="btn btn-ghost p-1.5 rounded-md"
                  aria-label="Close"
                >
                  <X size={20} style={{ color: 'var(--dome-text-secondary)' }} />
                </button>
              </div>

              <div className="modal-body max-h-80 overflow-y-auto">
                {moveTargetIds.length > 0 && (
                  <button
                    onClick={() => handleMoveToFolder(null)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg transition-colors mb-2 hover:bg-[var(--dome-accent-bg)]"
                  >
                    <HomeIcon className="w-5 h-5" style={{ color: 'var(--dome-accent)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      Move to Root
                    </span>
                  </button>
                )}


                {allFolders.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--dome-text-secondary)' }}>
                    No folders yet. Create a folder first.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {allFolders
                      .filter(folder => !moveTargetIds.includes(folder.id))
                      .map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => handleMoveToFolder(folder.id)}
                          disabled={moveTargetIds.length === 1 && folder.id === resourceToMove?.folder_id}
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
                          {moveTargetIds.length === 1 && folder.id === resourceToMove?.folder_id ? (
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
                  onClick={() => { setShowMoveModal(false); setResourceToMove(null); setMoveTargetIds([]); }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={[
              {
                id: 'open',
                label: 'Open',
                icon: <ExternalLink size={14} />,
                onClick: () => handleResourceSelect(contextMenu.resource),
              },
              ...(contextMenu.resource.type === 'folder'
                ? [
                  {
                    id: 'rename',
                    label: 'Rename',
                    icon: <Pencil size={14} />,
                    onClick: () => handleFolderRenameStart(contextMenu.resource),
                  },
                ]
                : []),
              {
                id: 'move',
                label: 'Move to folder',
                icon: <FolderInput size={14} />,
                onClick: () => handleMoveToFolderRequest(contextMenu.resource),
              },
              {
                id: 'delete',
                label: 'Delete',
                icon: <Trash2 size={14} />,
                onClick: () => handleDeleteResource(contextMenu.resource),
                danger: true,
              },
            ]}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={!!deleteTarget || bulkDeleteIds.length > 0}
          title="Delete resource"
          message={
            bulkDeleteIds.length > 1
              ? `Are you sure you want to delete ${bulkDeleteIds.length} items? This action cannot be undone.`
              : `Are you sure you want to delete "${deleteTarget?.title || ''}"? This action cannot be undone.`
          }
          variant="danger"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setBulkDeleteIds([]);
          }}
        />
      </div>
    </HomeLayout>
  );
}
