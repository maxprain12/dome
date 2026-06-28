import { useMemo, useCallback, useState, useRef, useEffect, Fragment } from 'react';
import { Menu, ScrollArea, Stack, UnstyledButton, Text } from '@mantine/core';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import {
  ChevronRight, ChevronLeft, Upload, FolderPlus, Link2, FileText, Search, X, Plus, MoreHorizontal, Palette, LayoutGrid, List, Folder,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useResources, type Resource } from '@/lib/hooks/useResources';
import { useTabStore, FOLDER_TAB_PREFIX } from '@/lib/store/useTabStore';
import { useFolderNavigationHistory } from '@/lib/hooks/useFolderNavigationHistory';
import { useAppStore } from '@/lib/store/useAppStore';
import { lazyRef } from '@/lib/utils/lazyRef';
import MoveToProjectModal, { filterMoveProjectRoots } from '@/components/workspace/MoveToProjectModal';
import SelectionActionBar from '@/components/home/SelectionActionBar';
import '@/styles/folder-view.css';

import { getFolderColor, resolveFolderTabView, FOLDER_COLOR_DEFAULT } from './folder-tab/folderTabShared';
import ColorPickerPopover from './folder-tab/ColorPickerPopover';
import FolderListRow from './folder-tab/FolderListRow';
import FolderCard from './folder-tab/FolderCard';
import NewFolderInline from './folder-tab/NewFolderInline';

type FolderViewMode = 'grid' | 'list';
const FOLDER_VIEW_MODE_KEY = 'dome:folder-view-mode';
const FOLDER_VIEW_MODE_DEFAULT: FolderViewMode = 'grid';

function readFolderViewMode(): FolderViewMode {
  if (typeof window === 'undefined') return FOLDER_VIEW_MODE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(FOLDER_VIEW_MODE_KEY);
    return raw === 'list' || raw === 'grid' ? raw : FOLDER_VIEW_MODE_DEFAULT;
  } catch {
    return FOLDER_VIEW_MODE_DEFAULT;
  }
}

interface FolderTabViewProps {
  folderId: string;
  folderTitle: string;
}

export default function FolderTabView({ folderId, folderTitle }: FolderTabViewProps) {
  const { t } = useTranslation();

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [moveProjectIds, setMoveProjectIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [folderPickOpen, setFolderPickOpen] = useState(false);
  // When set, the folder picker moves just these ids (single-card "Move to
  // folder"); when null it falls back to the current multi-selection.
  const [folderMoveIds, setFolderMoveIds] = useState<string[] | null>(null);
  const [viewMode, setViewMode] = useState<FolderViewMode>(() => readFolderViewMode());
  const showSelectionChrome = selectedIds.size > 0;

  const setFolderViewMode = useCallback((next: FolderViewMode) => {
    setViewMode(next);
    try { window.localStorage.setItem(FOLDER_VIEW_MODE_KEY, next); } catch { /* ignore */ }
  }, []);

  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const folderMenuBtnRef = useRef<HTMLButtonElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocusIndex, setSearchFocusIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement> | null>(null);
  const rowRefMap = lazyRef(rowRefs, () => new Map());

  const searchModHint =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘F' : 'Ctrl+F';

  const {
    resources: allResources,
    isLoading,
    createResource,
    deleteResource,
    updateResource,
    getFolderById,
    getBreadcrumbPath,
    refetch,
    allFolders,
    moveToFolder,
  } = useResources({
    sortBy: 'updated_at',
    sortOrder: 'desc',
  });

  const setCurrentFolderId = useAppStore((s) => s.setCurrentFolderId);
  const currentProject = useAppStore((s) => s.currentProject);

  const folderResource = getFolderById(folderId);
  const viewCtx = useMemo(
    () => resolveFolderTabView(folderId, folderResource),
    [folderId, folderResource],
  );

  const { subfolders, files } = useMemo(() => {
    let list = allResources;
    if (viewCtx.isProjectRoot) {
      list = list.filter((r) => r.project_id === viewCtx.projectId && !r.folder_id);
    } else {
      list = list.filter((r) => r.folder_id === folderId);
      if (viewCtx.projectId) {
        list = list.filter((r) => r.project_id === viewCtx.projectId);
      }
    }
    return {
      subfolders: list.filter((r) => r.type === 'folder'),
      files: list.filter((r) => r.type !== 'folder'),
    };
  }, [allResources, viewCtx, folderId]);

  const currentFolder = viewCtx.isProjectRoot ? undefined : folderResource;
  const displayTitle = currentFolder?.title ?? folderTitle;
  // Breadcrumb root = the project (vault root), never "Home".
  const projectRootLabel = currentProject?.name || 'Library';
  const effectiveProjectId = viewCtx.isProjectRoot
    ? viewCtx.projectId
    : (currentFolder?.project_id ?? currentProject?.id ?? 'default');
  const listFolderId = viewCtx.listFolderId;

  const resourceMapForSelection = useMemo(() => {
    const m = new Map<string, Resource>();
    for (const f of subfolders) m.set(f.id, f);
    for (const f of files) m.set(f.id, f);
    if (!viewCtx.isProjectRoot) {
      for (const p of getBreadcrumbPath(folderId)) m.set(p.id, p);
      const cur = getFolderById(folderId);
      if (cur) m.set(cur.id, cur);
    }
    return m;
  }, [subfolders, files, folderId, getBreadcrumbPath, getFolderById, viewCtx.isProjectRoot]);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const handleBulkMoveToFolder = useCallback(
    async (targetFolderId: string | null) => {
      // Single-card move targets `folderMoveIds`; otherwise move the selection.
      const roots = folderMoveIds ?? filterMoveProjectRoots(selectedIds, resourceMapForSelection);
      for (const rid of roots) {
        const ok = await moveToFolder(rid, targetFolderId);
        if (!ok) break;
      }
      if (!folderMoveIds) setSelectedIds(new Set());
      setFolderMoveIds(null);
      setFolderPickOpen(false);
      await refetch();
    },
    [folderMoveIds, selectedIds, resourceMapForSelection, moveToFolder, refetch],
  );

  // Open the folder picker for a single resource (per-card menu action).
  const openFolderPickerFor = useCallback((id: string) => {
    setFolderMoveIds([id]);
    setFolderPickOpen(true);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const n = selectedIds.size;
    if (!window.confirm(t('selection.bulk_delete_confirm', { count: n }))) return;
    const res = await window.electron?.db?.resources?.bulkDelete([...selectedIds]);
    if (res?.success) {
      setSelectedIds(new Set());
      await refetch();
    }
  }, [selectedIds, refetch, t]);

  const { openResourceTab, navigateFolderTab, updateTab } = useTabStore(
    useShallow((s) => ({
      openResourceTab: s.openResourceTab,
      navigateFolderTab: s.navigateFolderTab,
      updateTab: s.updateTab,
    })),
  );

  const tabId = `${FOLDER_TAB_PREFIX}${folderId}`;
  const navLocation = useMemo(
    () => ({ id: folderId, title: folderTitle }),
    [folderId, folderTitle],
  );
  const navigateFolderTabWithProject = useCallback(
    (fromId: string, loc: { id: string; title: string; color?: string }) =>
      navigateFolderTab(fromId, loc, effectiveProjectId),
    [navigateFolderTab, effectiveProjectId],
  );

  const { canGoBack, canGoForward, navigate: navigateToFolder, goBack, goForward } =
    useFolderNavigationHistory(tabId, navLocation, navigateFolderTabWithProject);

  const handleNavigateToFolder = useCallback(
    (id: string, title: string, color?: string) => {
      navigateToFolder({ id, title, color });
    },
    [navigateToFolder],
  );

  const handleNavigateToProjectRoot = useCallback(() => {
    if (!effectiveProjectId) return;
    handleNavigateToFolder(effectiveProjectId, projectRootLabel, 'var(--dome-accent)');
  }, [effectiveProjectId, projectRootLabel, handleNavigateToFolder]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goBack, goForward]);

  const prevListFolderIdRef = useRef<string | null | undefined>(listFolderId);
  if (prevListFolderIdRef.current !== listFolderId) {
    prevListFolderIdRef.current = listFolderId;
    setCurrentFolderId(listFolderId);
  }

  useEffect(() => () => { setCurrentFolderId(null); }, [setCurrentFolderId]);

  // Folders available as move targets, flattened into a depth-indented tree so
  // the picker mirrors the real folder hierarchy instead of a flat list.
  const moveFolderRows = useMemo(() => {
    const moving = new Set(folderMoveIds ?? [...selectedIds]);
    const projectFolders = allFolders.filter((f) => f.project_id === effectiveProjectId);
    const byId = new Map(projectFolders.map((f) => [f.id, f] as const));

    // Exclude the folders being moved and their descendants (a folder can't move
    // into its own subtree) plus the current folder (the items already live here).
    const excluded = new Set<string>();
    const markSubtree = (id: string) => {
      if (excluded.has(id)) return;
      excluded.add(id);
      for (const f of projectFolders) if (f.folder_id === id) markSubtree(f.id);
    };
    for (const id of moving) markSubtree(id);
    if (folderId) excluded.add(folderId);

    const childrenOf = new Map<string | null, typeof projectFolders>();
    for (const f of projectFolders) {
      if (excluded.has(f.id)) continue;
      const parentId =
        f.folder_id && byId.has(f.folder_id) && !excluded.has(f.folder_id) ? f.folder_id : null;
      const arr = childrenOf.get(parentId) ?? [];
      arr.push(f);
      childrenOf.set(parentId, arr);
    }
    for (const arr of childrenOf.values()) {
      arr.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    }

    const rows: Array<{ folder: (typeof projectFolders)[number]; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const f of childrenOf.get(parentId) ?? []) {
        rows.push({ folder: f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  }, [allFolders, effectiveProjectId, folderId, folderMoveIds, selectedIds]);

  const breadcrumb = useMemo(
    () => (viewCtx.isProjectRoot ? [] : getBreadcrumbPath(folderId).filter((f) => f.id !== folderId)),
    [folderId, getBreadcrumbPath, viewCtx.isProjectRoot],
  );

  const folderColor = currentFolder ? getFolderColor(currentFolder) : 'var(--dome-accent)';
  const folderColorHex = folderColor.startsWith('#') ? folderColor : null;

  const tabColorKey =
    folderColorHex && !viewCtx.isProjectRoot ? `${folderId}:${folderColorHex}` : '';
  const prevTabColorKeyRef = useRef('');
  if (tabColorKey && tabColorKey !== prevTabColorKeyRef.current) {
    prevTabColorKeyRef.current = tabColorKey;
    updateTab(`folder:${folderId}`, { color: folderColorHex! });
  }

  const handleCurrentFolderColor = async (color: string) => {
    if (!currentFolder) return;
    const currentMeta = (currentFolder.metadata as Record<string, unknown>) ?? {};
    await updateResource(folderId, { metadata: { ...currentMeta, color } });
    updateTab(`folder:${folderId}`, { color });
    setColorPickerPos(null);
  };

  const handleCreateFolder = useCallback(async (name: string) => {
    await createResource({
      type: 'folder',
      title: name,
      project_id: effectiveProjectId,
      content: '',
      folder_id: listFolderId,
    });
    setCreatingFolder(false);
  }, [createResource, effectiveProjectId, listFolderId]);

  const handleNewNote = useCallback(async () => {
    if (!window.electron?.db?.resources?.create) return;
    const now = Date.now();
    const res = {
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'note' as const,
      title: t('dashboard.untitled_note', 'Nota sin título'),
      content: '',
      project_id: effectiveProjectId,
      folder_id: listFolderId,
      created_at: now,
      updated_at: now,
    };
    const result = await window.electron.db.resources.create(res);
    if (result.success && result.data) {
      openResourceTab(result.data.id, 'note', result.data.title, effectiveProjectId);
    }
  }, [effectiveProjectId, listFolderId, t, openResourceTab]);

  const handleUpload = useCallback(async () => {
    if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
    const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (!paths?.length) return;
    const result = await window.electron.resource.importMultiple(paths, effectiveProjectId);
    if (listFolderId && result?.data?.length) {
      const moves: Promise<unknown>[] = [];
      for (const entry of result.data) {
        if (!entry.success || !entry.data?.id) continue;
        moves.push(window.electron?.db?.resources?.moveToFolder(entry.data.id, listFolderId));
      }
      await Promise.all(moves);
    }
    await refetch();
  }, [effectiveProjectId, listFolderId, refetch]);

  const handleAddUrl = useCallback(() => {
    const url = prompt(t('command.please_enter_url', 'Introduce una URL'));
    if (url && window.electron?.db?.resources?.create) {
      const now = Date.now();
      void window.electron.db.resources.create({
        id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'url',
        title: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
        project_id: effectiveProjectId,
        folder_id: listFolderId,
        content: url,
        created_at: now,
        updated_at: now,
      });
    }
  }, [effectiveProjectId, listFolderId, t]);

  const handleDeleteFile = useCallback(async (id: string) => {
    if (!window.confirm(t('folder.confirmDelete'))) return;
    await deleteResource(id);
  }, [deleteResource, t]);

  const handleRenameFile = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
  }, [updateResource]);

  const handleSubfolderRename = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
    updateTab(`folder:${id}`, { title: newTitle });
  }, [updateResource, updateTab]);

  const handleSubfolderDelete = useCallback(async (id: string) => {
    if (!window.confirm(t('folder.confirmDeleteFolder', '¿Eliminar esta carpeta y todo su contenido?'))) return;
    await deleteResource(id);
  }, [deleteResource, t]);

  const handleSubfolderColor = useCallback(async (id: string, color: string, folder: Resource) => {
    const currentMeta = (folder.metadata as Record<string, unknown>) ?? {};
    await updateResource(id, { metadata: { ...currentMeta, color } });
    updateTab(`folder:${id}`, { color });
  }, [updateResource, updateTab]);

  const listItems = useMemo(() => {
    const folders = subfolders.map((f) => ({ item: f, isFolder: true as const }));
    const docs = files.map((f) => ({ item: f, isFolder: false as const }));
    return [...folders, ...docs];
  }, [subfolders, files]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isFiltering = normalizedSearchQuery.length > 0;

  const filteredListItems = useMemo(() => {
    if (!isFiltering) return listItems;
    return listItems.filter(({ item }) =>
      (item.title ?? t('folder.untitled')).toLowerCase().includes(normalizedSearchQuery),
    );
  }, [listItems, isFiltering, normalizedSearchQuery, t]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchFocusIndex(0);
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const openListItem = useCallback(
    ({ item, isFolder }: { item: Resource; isFolder: boolean }) => {
      if (isFolder) handleNavigateToFolder(item.id, item.title, getFolderColor(item));
      else openResourceTab(item.id, item.type, item.title ?? t('folder.untitled'), effectiveProjectId);
    },
    [handleNavigateToFolder, openResourceTab, t, effectiveProjectId],
  );

  const prevFolderIdRef = useRef(folderId);
  if (folderId !== prevFolderIdRef.current) {
    prevFolderIdRef.current = folderId;
    closeSearch();
  }

  useEffect(() => {
    setSearchFocusIndex(0);
  }, [normalizedSearchQuery]);

  useEffect(() => {
    if (!isFiltering || filteredListItems.length === 0) return;
    const focused = filteredListItems[Math.min(searchFocusIndex, filteredListItems.length - 1)];
    if (!focused) return;
    rowRefMap.get(focused.item.id)?.scrollIntoView({ block: 'nearest' });
  }, [searchFocusIndex, filteredListItems, isFiltering, rowRefMap]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        if (searchOpen) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          openSearch();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, openSearch]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
        return;
      }
      if (filteredListItems.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchFocusIndex((i) => Math.min(i + 1, filteredListItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchFocusIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = filteredListItems[searchFocusIndex] ?? filteredListItems[0];
        if (target) openListItem(target);
      }
    },
    [closeSearch, filteredListItems, openListItem, searchFocusIndex],
  );

  const openFolderColorPicker = useCallback(() => {
    if (!folderMenuBtnRef.current) return;
    const rect = folderMenuBtnRef.current.getBoundingClientRect();
    const popoverWidth = 196;
    const left = Math.min(
      Math.max(8, rect.right - popoverWidth),
      window.innerWidth - popoverWidth - 8,
    );
    const top = Math.min(rect.bottom + 6, window.innerHeight - 100);
    setColorPickerPos({ top, left });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
        <div className="size-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--dome-border)', borderTopColor: 'var(--dome-accent)' }} />
      </div>
    );
  }

  const itemCount = subfolders.length + files.length;
  const visibleCount = isFiltering ? filteredListItems.length : itemCount;
  const isEmpty = itemCount === 0 && !creatingFolder;
  const showNoResults = isFiltering && filteredListItems.length === 0;
  const rowsToRender = isFiltering ? filteredListItems : listItems;

  const statusLabel = isFiltering
    ? t('folder.searchResultCount', { count: visibleCount, total: itemCount })
    : t('folder.itemCount', { count: itemCount });

  return (
    <div className="dome-folder-view">
      <div className="dome-folder-view__toolbar">
        <div className="dome-folder-view__nav-controls">
          <button
            type="button"
            className="dome-folder-view__nav-btn"
            onClick={goBack}
            disabled={!canGoBack}
            aria-label={t('folder.navBack', 'Atrás')}
            title={t('folder.navBack', 'Atrás')}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className="dome-folder-view__nav-btn"
            onClick={goForward}
            disabled={!canGoForward}
            aria-label={t('folder.navForward', 'Adelante')}
            title={t('folder.navForward', 'Adelante')}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <nav className="dome-folder-view__breadcrumb" aria-label={t('folder.breadcrumb', 'Ruta')}>
          {viewCtx.isProjectRoot ? (
            <span
              className="dome-folder-view__breadcrumb-current"
              title={projectRootLabel}
              aria-current="page"
            >
              {projectRootLabel}
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={handleNavigateToProjectRoot}
                className="shrink-0"
                title={projectRootLabel}
              >
                {projectRootLabel}
              </button>
              {breadcrumb.map((folder) => (
                <Fragment key={folder.id}>
                  <ChevronRight className="size-3 shrink-0 opacity-50" />
                  <button
                    type="button"
                    onClick={() => handleNavigateToFolder(folder.id, folder.title, getFolderColor(folder))}
                    title={folder.title}
                  >
                    {folder.title}
                  </button>
                </Fragment>
              ))}
              {breadcrumb.length > 0 && <ChevronRight className="size-3 shrink-0 opacity-50" />}
              <span className="dome-folder-view__breadcrumb-current" title={displayTitle} aria-current="page">
                {displayTitle}
              </span>
            </>
          )}
        </nav>

        <div className="dome-folder-view__toolbar-end">
          <fieldset
            className="dome-folder-view__view-toggle border-0 p-0 m-0 min-w-0"
            aria-label={t('folder.viewMode', 'Modo de vista')}
          >
            <button
              type="button"
              className={`dome-folder-view__view-toggle-btn${viewMode === 'grid' ? ' dome-folder-view__view-toggle-btn--active' : ''}`}
              onClick={() => setFolderViewMode('grid')}
              aria-label={t('folder.gridView', 'Vista de cuadrícula')}
              aria-pressed={viewMode === 'grid'}
              title={t('folder.gridView', 'Vista de cuadrícula')}
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              type="button"
              className={`dome-folder-view__view-toggle-btn${viewMode === 'list' ? ' dome-folder-view__view-toggle-btn--active' : ''}`}
              onClick={() => setFolderViewMode('list')}
              aria-label={t('folder.listView', 'Vista de lista')}
              aria-pressed={viewMode === 'list'}
              title={t('folder.listView', 'Vista de lista')}
            >
              <List className="size-3.5" />
            </button>
          </fieldset>

          {searchOpen ? (
            <div className="dome-folder-view__search">
              <Search className="dome-folder-view__search-icon size-3.5" aria-hidden />
              <input
                ref={searchInputRef}
                type="search"
                className="dome-folder-view__search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('folder.searchPlaceholder', { shortcut: searchModHint })}
                aria-label={t('folder.searchAria', { shortcut: searchModHint })}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="dome-folder-view__search-clear"
                onClick={() => {
                  if (searchQuery) {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  } else {
                    closeSearch();
                  }
                }}
                aria-label={t('folder.searchClear', 'Clear search')}
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="dome-folder-view__icon-btn"
              onClick={openSearch}
              aria-label={t('folder.searchAria', { shortcut: searchModHint })}
              title={t('folder.searchPlaceholder', { shortcut: searchModHint })}
            >
              <Search className="size-3.5" />
            </button>
          )}

          {!viewCtx.isProjectRoot && currentFolder ? (
            <Menu
              withinPortal
              position="bottom-end"
              offset={4}
              shadow="md"
              classNames={{
                dropdown: 'dome-folder-view__menu-dropdown',
                item: 'dome-folder-view__menu-item',
              }}
            >
              <Menu.Target>
                <button
                  ref={folderMenuBtnRef}
                  type="button"
                  className="dome-folder-view__icon-btn"
                  aria-label={t('folder.folderMenu', 'Opciones de carpeta')}
                  title={t('folder.folderMenu', 'Opciones de carpeta')}
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Palette className="size-3.5" style={{ color: folderColor }} />}
                  onClick={openFolderColorPicker}
                >
                  {t('folder.changeColor', 'Cambiar color')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : null}

          <Menu
            withinPortal
            position="bottom-end"
            offset={4}
            shadow="md"
            classNames={{
              dropdown: 'dome-folder-view__menu-dropdown',
              item: 'dome-folder-view__menu-item',
            }}
          >
            <Menu.Target>
              <button
                type="button"
                className="dome-folder-view__add-btn"
                aria-label={t('folder.addBtn', 'Añadir')}
                title={t('folder.addBtn', 'Añadir')}
              >
                <Plus className="size-4" strokeWidth={2.25} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<FolderPlus className="size-3.5" />} onClick={() => setCreatingFolder(true)}>
                {t('folder.newFolderBtn')}
              </Menu.Item>
              <Menu.Item leftSection={<FileText className="size-3.5" />} onClick={handleNewNote}>
                {t('toolbar.note', 'Nota')}
              </Menu.Item>
              <Menu.Item leftSection={<Upload className="size-3.5" />} onClick={handleUpload}>
                {t('toolbar.import', 'Importar')}
              </Menu.Item>
              <Menu.Item leftSection={<Link2 className="size-3.5" />} onClick={handleAddUrl}>
                {t('toolbar.link', 'URL')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>

      <SelectionActionBar
        count={selectedIds.size}
        onMoveToFolder={() => { setFolderMoveIds(null); setFolderPickOpen(true); }}
        onMoveToProject={() =>
          setMoveProjectIds([...filterMoveProjectRoots(selectedIds, resourceMapForSelection)])
        }
        onDelete={() => void handleBulkDelete()}
        onDeselect={() => setSelectedIds(new Set())}
      />

      {colorPickerPos ? (
        <ColorPickerPopover
          pos={colorPickerPos}
          currentColor={folderColorHex ?? FOLDER_COLOR_DEFAULT}
          onSave={handleCurrentFolderColor}
          onClose={() => setColorPickerPos(null)}
        />
      ) : null}

      <div
        className={`dome-folder-view__list dome-folder-view__list--${viewMode}`}
        data-view-mode={viewMode}
      >
        {showNoResults ? (
          <p className="dome-folder-view__empty dome-folder-view__empty--search">
            {t('folder.searchNoResults', { query: searchQuery.trim() })}
          </p>
        ) : !isEmpty ? (
          viewMode === 'list' ? (
            <>
              <div className="dome-folder-view__list-header">
                <span className="dome-folder-view__list-header-name">
                  {t('folder.colName', 'Nombre')}
                  <span className="dome-folder-view__list-header-count">{statusLabel}</span>
                </span>
                <span className="dome-folder-view__col-modified">{t('folder.colModified', 'Modificado')}</span>
                <span aria-hidden />
              </div>

              {rowsToRender.map(({ item, isFolder }, idx) => (
                <FolderListRow
                  key={item.id}
                  item={item}
                  isFolder={isFolder}
                  isLast={idx === rowsToRender.length - 1 && !creatingFolder}
                  rowRef={(el) => {
                    if (el) rowRefMap.set(item.id, el);
                    else rowRefMap.delete(item.id);
                  }}
                  onOpen={() => {
                    if (isFolder) handleNavigateToFolder(item.id, item.title, getFolderColor(item));
                    else openResourceTab(item.id, item.type, item.title ?? t('folder.untitled'), effectiveProjectId);
                  }}
                  onDelete={() => void (isFolder ? handleSubfolderDelete(item.id) : handleDeleteFile(item.id))}
                  onRename={(newTitle) => void (isFolder ? handleSubfolderRename(item.id, newTitle) : handleRenameFile(item.id, newTitle))}
                  onChangeColor={isFolder ? (color) => void handleSubfolderColor(item.id, color, item) : undefined}
                  onMoveToProject={() => setMoveProjectIds([item.id])}
                  onMoveToFolder={isFolder ? undefined : () => openFolderPickerFor(item.id)}
                  selected={selectedIds.has(item.id)}
                  showSelectionChrome={showSelectionChrome}
                  onToggleSelect={(e) => {
                    e.stopPropagation();
                    toggleSelectId(item.id);
                  }}
                  searchQuery={isFiltering ? normalizedSearchQuery : undefined}
                  searchFocused={isFiltering && idx === searchFocusIndex}
                />
              ))}

              {creatingFolder ? (
                <div className="dome-folder-view__inline-create">
                  <NewFolderInline onConfirm={handleCreateFolder} onCancel={() => setCreatingFolder(false)} />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="dome-folder-view__grid-header">
                <span className="dome-folder-view__list-header-count">{statusLabel}</span>
              </div>
              <div className="dome-folder-view__grid">
                {rowsToRender.map(({ item, isFolder }, idx) => (
                  <FolderCard
                    key={item.id}
                    item={item}
                    isFolder={isFolder}
                    isLast={idx === rowsToRender.length - 1 && !creatingFolder}
                    cardRef={(el) => {
                      if (el) rowRefMap.set(item.id, el as unknown as HTMLDivElement);
                      else rowRefMap.delete(item.id);
                    }}
                    onOpen={() => {
                      if (isFolder) handleNavigateToFolder(item.id, item.title, getFolderColor(item));
                      else openResourceTab(item.id, item.type, item.title ?? t('folder.untitled'), effectiveProjectId);
                    }}
                    onDelete={() => void (isFolder ? handleSubfolderDelete(item.id) : handleDeleteFile(item.id))}
                    onRename={(newTitle) => void (isFolder ? handleSubfolderRename(item.id, newTitle) : handleRenameFile(item.id, newTitle))}
                    onChangeColor={isFolder ? (color) => void handleSubfolderColor(item.id, color, item) : undefined}
                    onMoveToProject={() => setMoveProjectIds([item.id])}
                    onMoveToFolder={isFolder ? undefined : () => openFolderPickerFor(item.id)}
                    selected={selectedIds.has(item.id)}
                    showSelectionChrome={showSelectionChrome}
                    onToggleSelect={(e) => {
                      e.stopPropagation();
                      toggleSelectId(item.id);
                    }}
                    searchQuery={isFiltering ? normalizedSearchQuery : undefined}
                    searchFocused={isFiltering && idx === searchFocusIndex}
                  />
                ))}
              </div>

              {creatingFolder ? (
                <div className="dome-folder-view__inline-create">
                  <NewFolderInline onConfirm={handleCreateFolder} onCancel={() => setCreatingFolder(false)} />
                </div>
              ) : null}
            </>
          )
        ) : creatingFolder ? (
          <div className="px-4 py-3">
            <NewFolderInline onConfirm={handleCreateFolder} onCancel={() => setCreatingFolder(false)} />
          </div>
        ) : (
          <p className="dome-folder-view__empty">{t('folder.emptyFolderShort', 'Carpeta vacía')}</p>
        )}
      </div>

      <DomeModal
        open={folderPickOpen}
        onClose={() => { setFolderPickOpen(false); setFolderMoveIds(null); }}
        title={t('selection.move_to_folder')}
        size="sm"
        footer={
          <DomeButton variant="secondary" onClick={() => { setFolderPickOpen(false); setFolderMoveIds(null); }}>
            {t('common.cancel')}
          </DomeButton>
        }
      >
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {t('selection.items_selected_other', { count: folderMoveIds?.length ?? selectedIds.size })}
          </Text>
          <ScrollArea.Autosize mah={280}>
            <Stack gap={4}>
              <UnstyledButton
                type="button"
                onClick={() => void handleBulkMoveToFolder(null)}
                p="sm"
                style={{
                  borderRadius: 8,
                  border: '1px solid var(--dome-border)',
                  textAlign: 'left',
                  background: 'var(--dome-surface)',
                }}
              >
                <Text size="sm" fw={500}>
                  {t('selection.move_to_root')}
                </Text>
              </UnstyledButton>
              {moveFolderRows.map(({ folder: f, depth }) => (
                <UnstyledButton
                  key={f.id}
                  type="button"
                  onClick={() => void handleBulkMoveToFolder(f.id)}
                  p="sm"
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--dome-border)',
                    textAlign: 'left',
                    background: 'var(--dome-surface)',
                  }}
                >
                  {/* Indent via marginLeft on the content (Mantine `p` would
                      otherwise override an inline paddingLeft). */}
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                      marginLeft: depth * 20,
                    }}
                  >
                    {depth > 0 ? (
                      <ChevronRight
                        className="size-3 shrink-0"
                        style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}
                        aria-hidden
                      />
                    ) : null}
                    <Folder
                      className="size-4 shrink-0"
                      style={{ color: getFolderColor(f) ?? 'var(--dome-accent)' }}
                      strokeWidth={1.75}
                    />
                    <Text size="sm" fw={500} truncate>
                      {f.title}
                    </Text>
                  </span>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </DomeModal>

      <MoveToProjectModal
        opened={moveProjectIds.length > 0}
        onClose={() => setMoveProjectIds([])}
        resourceIds={moveProjectIds}
        resourcesById={resourceMapForSelection}
        onCompleted={() => void refetch()}
      />
    </div>
  );
}
