import { useMemo, useCallback, useState, useRef, useEffect, Fragment } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowRight01Icon,
  ArrowLeft01Icon,
  Upload04Icon,
  FolderAddIcon,
  FolderExportIcon,
  LinkSquare01Icon,
  FileEditIcon,
  Search01Icon,
  Cancel01Icon,
  Add01Icon,
  MoreHorizontalIcon,
  PaintBoardIcon,
  LayoutGridIcon,
  Menu01Icon,
  Tag01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useResources, type Resource } from '@/lib/hooks/useResources';
import { useTabStore, FOLDER_TAB_PREFIX } from '@/lib/store/useTabStore';
import { useFolderNavigationHistory } from '@/lib/hooks/useFolderNavigationHistory';
import { useAppStore } from '@/lib/store/useAppStore';
import { lazyRef } from '@/lib/utils/lazyRef';
import MoveToProjectModal from '@/components/workspace/MoveToProjectModal';
import MoveFolderModal from '@/components/workspace/MoveFolderModal';
import {
  BulkDeleteConfirmModal,
  DeleteConfirmModal,
  UrlInputModal,
} from '@/components/workspace/sidebar/SidebarModals';
import { filterMoveProjectRoots } from '@/lib/workspace/filterMoveProjectRoots';
import SelectionActionBar from '@/components/home/SelectionActionBar';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import '@/styles/folder-view.css';

import { getFolderColor, resolveFolderTabView, FOLDER_COLOR_DEFAULT } from './folder-tab/folderTabShared';
import ColorPickerPopover from './folder-tab/ColorPickerPopover';
import FolderListRow from './folder-tab/FolderListRow';
import FolderCard from './folder-tab/FolderCard';
import NewFolderInline from './folder-tab/NewFolderInline';

type FolderViewMode = 'grid' | 'list';
const FOLDER_VIEW_MODE_KEY = 'dome:folder-view-mode';
const FOLDER_VIEW_MODE_DEFAULT: FolderViewMode = 'grid';

type ProjectTag = {
  id: string;
  name: string;
  color?: string | null;
  resource_count: number;
};

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
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [moveProjectIds, setMoveProjectIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [folderPickOpen, setFolderPickOpen] = useState(false);
  // When set, the folder picker moves just these ids (single-card "Move to
  // folder"); when null it falls back to the current multi-selection.
  const [folderMoveIds, setFolderMoveIds] = useState<string[] | null>(null);
  const [viewMode, setViewMode] = useState<FolderViewMode>(() => readFolderViewMode());
  const showSelectionChrome = selectedIds.size > 0;

  // Dome-UI dialogs (never native confirm/prompt).
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);

  const setFolderViewMode = useCallback((next: FolderViewMode) => {
    setViewMode(next);
    try { window.localStorage.setItem(FOLDER_VIEW_MODE_KEY, next); } catch { /* ignore */ }
  }, []);

  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const folderMenuBtnRef = useRef<HTMLButtonElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocusIndex, setSearchFocusIndex] = useState(0);
  const [tagFilterId, setTagFilterId] = useState<string | null>(null);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [taggedResourceIds, setTaggedResourceIds] = useState<Set<string>>(() => new Set());
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
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const res = await window.electron?.db?.resources?.bulkDelete([...selectedIds]);
      if (res?.success) {
        setSelectedIds(new Set());
        await refetch();
      }
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  }, [selectedIds, refetch]);

  const { openResourceTab, openResourceInSplit, navigateFolderTab, updateTab, activeTabId, tabs } = useTabStore(
    useShallow((s) => ({
      openResourceTab: s.openResourceTab,
      openResourceInSplit: s.openResourceInSplit,
      navigateFolderTab: s.navigateFolderTab,
      updateTab: s.updateTab,
      activeTabId: s.activeTabId,
      tabs: s.tabs,
    })),
  );

  const canOpenInSplit = activeTabId !== null && activeTabId !== 'home' &&
    Boolean(tabs.find((tb) => tb.id === activeTabId)?.resourceId);

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
      // Only persist real hex colors on the tab; uncolored folders stay neutral.
      const tabColor = color?.startsWith('#') ? color : undefined;
      navigateToFolder({ id, title, color: tabColor });
    },
    [navigateToFolder],
  );

  const handleNavigateToProjectRoot = useCallback(() => {
    if (!effectiveProjectId) return;
    handleNavigateToFolder(effectiveProjectId, projectRootLabel, 'var(--primary)');
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

  useEffect(() => {
    let cancelled = false;
    void window.electron?.db?.tags?.getAll(effectiveProjectId).then((res) => {
      if (cancelled || !res?.success) return;
      setProjectTags((res.data as ProjectTag[] | undefined) ?? []);
    });
    return () => { cancelled = true; };
  }, [effectiveProjectId]);

  useEffect(() => {
    if (!tagFilterId) {
      setTaggedResourceIds(new Set());
      return;
    }
    let cancelled = false;
    void window.electron?.db?.tags?.getResources(tagFilterId, effectiveProjectId).then((res) => {
      if (cancelled || !res?.success) return;
      setTaggedResourceIds(new Set((res.data ?? []).map((r) => r.id)));
    });
    return () => { cancelled = true; };
  }, [tagFilterId, effectiveProjectId]);

  const breadcrumb = useMemo(
    () => (viewCtx.isProjectRoot ? [] : getBreadcrumbPath(folderId).filter((f) => f.id !== folderId)),
    [folderId, getBreadcrumbPath, viewCtx.isProjectRoot],
  );

  const folderColor = currentFolder ? getFolderColor(currentFolder) : 'var(--primary)';
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
      folder_id: createFolderParentId ?? listFolderId,
      metadata: {},
    });
    setCreatingFolder(false);
    setCreateFolderParentId(null);
  }, [createResource, effectiveProjectId, listFolderId, createFolderParentId]);

  const handleOpenInSplit = useCallback((item: Resource) => {
    if (!canOpenInSplit) return;
    openResourceInSplit(item.id, item.type, item.title ?? '');
  }, [canOpenInSplit, openResourceInSplit]);

  const handleOpenInWindow = useCallback(async (item: Resource) => {
    if (!window.electron?.invoke || item.type !== 'note') return;
    try {
      await window.electron.invoke('window:create', {
        id: `note-focus:${item.id}`,
        route: `/focus/note/${encodeURIComponent(item.id)}`,
        options: {
          width: 960,
          height: 760,
          minWidth: 560,
          minHeight: 480,
          title: `${item.title || 'Nota'} — Dome`,
          transparent: false,
        },
      });
    } catch (err) {
      console.error('[FolderTabView] Failed to open popout:', err);
    }
  }, []);

  const handleNewSubfolder = useCallback((parentId: string) => {
    setCreateFolderParentId(parentId);
    setCreatingFolder(true);
  }, []);

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

  const importPathsIntoView = useCallback(async (paths: string[]) => {
    if (!paths.length || !window.electron?.resource?.importMultiple) return;
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

  const handleUpload = useCallback(async () => {
    if (!window.electron?.selectFiles) return;
    const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (!paths?.length) return;
    await importPathsIntoView(paths);
  }, [importPathsIntoView]);

  // ── Drag & drop import from Finder / OS file explorer ─────────────────────
  // dragenter/dragleave fire on every child; a depth counter keeps the overlay
  // stable until the pointer actually leaves the view.
  const dragDepthRef = useRef(0);
  const [osDropActive, setOsDropActive] = useState(false);

  const isOsFileDrag = useCallback((e: React.DragEvent) => {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
  }, []);

  const handleOsDragEnter = useCallback((e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setOsDropActive(true);
  }, [isOsFileDrag]);

  const handleOsDragOver = useCallback((e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, [isOsFileDrag]);

  const handleOsDragLeave = useCallback((e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setOsDropActive(false);
  }, [isOsFileDrag]);

  const handleOsDrop = useCallback(async (e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setOsDropActive(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (!files.length) return;
    const paths = (window.electron?.getPathsForFiles?.(files) ?? []).filter(Boolean) as string[];
    if (!paths.length) return;
    await importPathsIntoView(paths);
  }, [isOsFileDrag, importPathsIntoView]);

  const handleAddUrl = useCallback((url: string) => {
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
  }, [effectiveProjectId, listFolderId]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteResource(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteResource]);

  const revealLabel =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
      ? t('folder.reveal_in_finder')
      : t('folder.reveal_in_explorer');

  // Open the current folder (or the project vault root) in Finder/Explorer.
  const handleRevealCurrentFolder = useCallback(async () => {
    if (viewCtx.isProjectRoot || !currentFolder) {
      await window.electron?.resource?.openVaultRoot(effectiveProjectId);
      return;
    }
    const res = await window.electron?.resource?.getFilePath(currentFolder.id);
    if (res?.success && typeof res.data === 'string') {
      await window.electron?.openPath?.(res.data);
    } else {
      await window.electron?.resource?.openVaultRoot(effectiveProjectId);
    }
  }, [viewCtx.isProjectRoot, currentFolder, effectiveProjectId]);

  const handleRenameFile = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
  }, [updateResource]);

  const handleSubfolderRename = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
    updateTab(`folder:${id}`, { title: newTitle });
  }, [updateResource, updateTab]);


  const handleSubfolderColor = useCallback(async (id: string, color: string, folder: Resource) => {
    const currentMeta = (folder.metadata as Record<string, unknown>) ?? {};
    await updateResource(id, { metadata: { ...currentMeta, color } });
    updateTab(`folder:${id}`, { color });
  }, [updateResource, updateTab]);

  const listItems = useMemo(() => {
    if (tagFilterId) {
      return allResources
        .filter(
          (r) => r.project_id === effectiveProjectId && taggedResourceIds.has(r.id) && r.type !== 'folder',
        )
        .map((item) => ({ item, isFolder: false as const }));
    }
    const folders = subfolders.map((f) => ({ item: f, isFolder: true as const }));
    const docs = files.map((f) => ({ item: f, isFolder: false as const }));
    return [...folders, ...docs];
  }, [tagFilterId, allResources, effectiveProjectId, taggedResourceIds, subfolders, files]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isFiltering = normalizedSearchQuery.length > 0;
  const isTagFiltering = tagFilterId !== null;
  const activeTag = projectTags.find((tag) => tag.id === tagFilterId);

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
    setTagFilterId(null);
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
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  const itemCount = tagFilterId ? listItems.length : subfolders.length + files.length;
  const visibleCount = isFiltering || isTagFiltering ? filteredListItems.length : itemCount;
  const isEmpty = !isTagFiltering && itemCount === 0 && !creatingFolder;
  const showNoResults = (isFiltering || isTagFiltering) && filteredListItems.length === 0;
  const rowsToRender = isFiltering || isTagFiltering ? filteredListItems : listItems;

  const statusLabel = isTagFiltering && activeTag
    ? t('folder.tagFilterActive', { name: activeTag.name, count: visibleCount, defaultValue: '{{name}} · {{count}}' })
    : isFiltering
      ? t('folder.searchResultCount', { count: visibleCount, total: itemCount })
      : t('folder.itemCount', { count: itemCount });

  // Per-card callback factories. Extracted from `renderCard` so its cognitive
  // complexity stays under the Sonar limit; the inline `isFolder ? ... : ...`
  // ternaries previously nested inside JSX-prop arrows pushed it over 15.
  const buildCardRefHandler = (id: string) => (el: HTMLDivElement | null) => {
    if (el) rowRefMap.set(id, el as unknown as HTMLDivElement);
    else rowRefMap.delete(id);
  };
  const buildRenameHandler = (item: Resource, isFolder: boolean) => (newTitle: string) =>
    void (isFolder ? handleSubfolderRename(item.id, newTitle) : handleRenameFile(item.id, newTitle));
  const buildChangeColorHandler = (item: Resource, isFolder: boolean) =>
    isFolder ? (color: string) => void handleSubfolderColor(item.id, color, item) : undefined;
  const buildOpenInSplitHandler = (item: Resource, isFolder: boolean) =>
    !isFolder && canOpenInSplit ? () => handleOpenInSplit(item) : undefined;
  const buildOpenInWindowHandler = (item: Resource, isFolder: boolean) =>
    !isFolder ? () => void handleOpenInWindow(item) : undefined;
  const buildNewSubfolderHandler = (item: Resource, isFolder: boolean) =>
    isFolder ? () => handleNewSubfolder(item.id) : undefined;

  return (
    <div
      className="dome-folder-view"
      onDragEnter={handleOsDragEnter}
      onDragOver={handleOsDragOver}
      onDragLeave={handleOsDragLeave}
      onDrop={handleOsDrop}
    >
      {osDropActive && (
        <div className="dome-folder-view__drop-overlay" aria-hidden>
          <div className="dome-folder-view__drop-overlay-card">
            <HugeiconsIcon icon={Upload04Icon} className="size-6" aria-hidden />
            <span>{t('folder.dropToImport', 'Suelta para importar aquí')}</span>
          </div>
        </div>
      )}
      <div className="dome-folder-view__toolbar">
        <div className="dome-folder-view__nav-controls">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={goBack}
                  disabled={!canGoBack}
                  aria-label={t('folder.navBack', 'Atrás')}
                />
              }
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} />
            </TooltipTrigger>
            <TooltipContent>{t('folder.navBack', 'Atrás')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={goForward}
                  disabled={!canGoForward}
                  aria-label={t('folder.navForward', 'Adelante')}
                />
              }
            >
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </TooltipTrigger>
            <TooltipContent>{t('folder.navForward', 'Adelante')}</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-5" />

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
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleNavigateToProjectRoot}
                className="h-6 max-w-28 shrink-0 truncate px-1.5 text-muted-foreground"
                title={projectRootLabel}
              >
                {projectRootLabel}
              </Button>
              {breadcrumb.map((folder) => (
                <Fragment key={folder.id}>
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-3 shrink-0 text-muted-foreground/60" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => handleNavigateToFolder(folder.id, folder.title, getFolderColor(folder))}
                    className="h-6 max-w-28 shrink truncate px-1.5 text-muted-foreground"
                    title={folder.title}
                  >
                    {folder.title}
                  </Button>
                </Fragment>
              ))}
              {breadcrumb.length > 0 && (
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3 shrink-0 text-muted-foreground/60" />
              )}
              <span className="dome-folder-view__breadcrumb-current" title={displayTitle} aria-current="page">
                {displayTitle}
              </span>
            </>
          )}
        </nav>

        <div className="dome-folder-view__toolbar-end">
          <ToggleGroup
            value={[viewMode]}
            onValueChange={(values) => {
              const next = values[0];
              if (next === 'grid' || next === 'list') setFolderViewMode(next);
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={t('folder.viewMode', 'Modo de vista')}
          >
            <ToggleGroupItem value="grid" aria-label={t('folder.gridView', 'Vista de cuadrícula')}>
              <HugeiconsIcon icon={LayoutGridIcon} />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label={t('folder.listView', 'Vista de lista')}>
              <HugeiconsIcon icon={Menu01Icon} />
            </ToggleGroupItem>
          </ToggleGroup>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant={isTagFiltering ? 'secondary' : 'ghost'}
                        size="icon-sm"
                        aria-label={t('folder.tagFilter', 'Filtrar por tag')}
                      />
                    }
                  />
                }
              >
                <HugeiconsIcon icon={Tag01Icon} />
              </TooltipTrigger>
              <TooltipContent>
                {activeTag ? activeTag.name : t('folder.tagFilter', 'Filtrar por tag')}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setTagFilterId(null)}>
                  {t('folder.tagFilterAll', 'Todos los tags')}
                </DropdownMenuItem>
                {projectTags.length === 0 ? (
                  <DropdownMenuItem disabled>
                    {t('tags.no_tags', 'Sin tags')}
                  </DropdownMenuItem>
                ) : (
                  projectTags.map((tag) => (
                    <DropdownMenuItem
                      key={tag.id}
                      className={cn(tagFilterId === tag.id && 'font-semibold')}
                      onClick={() => setTagFilterId(tag.id)}
                    >
                      <span className="truncate">{tag.name}</span>
                      <span className="ml-auto text-muted-foreground tabular-nums">{tag.resource_count}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {searchOpen ? (
            <InputGroup className="w-[min(240px,42vw)] min-w-36">
              <InputGroupAddon align="inline-start">
                <HugeiconsIcon icon={Search01Icon} />
              </InputGroupAddon>
              <InputGroupInput
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('folder.searchPlaceholder', { shortcut: searchModHint })}
                aria-label={t('folder.searchAria', { shortcut: searchModHint })}
                autoComplete="off"
                spellCheck={false}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
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
                  <HugeiconsIcon icon={Cancel01Icon} />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={openSearch}
                    aria-label={t('folder.searchAria', { shortcut: searchModHint })}
                  />
                }
              >
                <HugeiconsIcon icon={Search01Icon} />
              </TooltipTrigger>
              <TooltipContent>
                {t('folder.searchPlaceholder', { shortcut: searchModHint })}
              </TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        ref={folderMenuBtnRef}
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('folder.folderMenu', 'Opciones de carpeta')}
                      />
                    }
                  />
                }
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} />
              </TooltipTrigger>
              <TooltipContent>{t('folder.folderMenu', 'Opciones de carpeta')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-52">
              <DropdownMenuGroup>
                {!viewCtx.isProjectRoot && currentFolder ? (
                  <DropdownMenuItem onClick={openFolderColorPicker}>
                    <HugeiconsIcon icon={PaintBoardIcon} data-icon="inline-start" />
                    {t('folder.changeColor', 'Cambiar color')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => void handleRevealCurrentFolder()}>
                  <HugeiconsIcon icon={FolderExportIcon} data-icon="inline-start" />
                  {revealLabel}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        aria-label={t('folder.addBtn', 'Añadir')}
                      />
                    }
                  />
                }
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2.25} />
              </TooltipTrigger>
              <TooltipContent>{t('folder.addBtn', 'Añadir')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setCreatingFolder(true)}>
                  <HugeiconsIcon icon={FolderAddIcon} data-icon="inline-start" />
                  {t('folder.newFolderBtn')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleNewNote}>
                  <HugeiconsIcon icon={FileEditIcon} data-icon="inline-start" />
                  {t('toolbar.note', 'Nota')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleUpload}>
                  <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" />
                  {t('toolbar.import', 'Importar')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUrlModalOpen(true)}>
                  <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" />
                  {t('toolbar.link', 'URL')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SelectionActionBar
        count={selectedIds.size}
        onMoveToFolder={() => { setFolderMoveIds(null); setFolderPickOpen(true); }}
        onMoveToProject={() =>
          setMoveProjectIds([...filterMoveProjectRoots(selectedIds, resourceMapForSelection)])
        }
        onDelete={() => setBulkDeleteOpen(true)}
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
            {isTagFiltering
              ? t('folder.tagFilterEmpty', 'Ningún recurso con este tag')
              : t('folder.searchNoResults', { query: searchQuery.trim() })}
          </p>
        ) : !isEmpty || isTagFiltering ? (
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
                  onDelete={() => setDeleteTarget(item)}
                  onRename={(newTitle) => void (isFolder ? handleSubfolderRename(item.id, newTitle) : handleRenameFile(item.id, newTitle))}
                  onChangeColor={isFolder ? (color) => void handleSubfolderColor(item.id, color, item) : undefined}
                  onMoveToProject={() => setMoveProjectIds([item.id])}
                  onMoveToFolder={() => openFolderPickerFor(item.id)}
                  onOpenInSplit={!isFolder && canOpenInSplit ? () => handleOpenInSplit(item) : undefined}
                  onOpenInWindow={!isFolder ? () => void handleOpenInWindow(item) : undefined}
                  onNewSubfolder={isFolder ? () => handleNewSubfolder(item.id) : undefined}
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
                  <NewFolderInline
                    variant="list"
                    onConfirm={handleCreateFolder}
                    onCancel={() => { setCreatingFolder(false); setCreateFolderParentId(null); }}
                  />
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
                    cardRef={buildCardRefHandler(item.id)}
                    onOpen={() => openListItem({ item, isFolder })}
                    onDelete={() => setDeleteTarget(item)}
                    onRename={buildRenameHandler(item, isFolder)}
                    onChangeColor={buildChangeColorHandler(item, isFolder)}
                    onMoveToProject={() => setMoveProjectIds([item.id])}
                    onMoveToFolder={() => openFolderPickerFor(item.id)}
                    onOpenInSplit={buildOpenInSplitHandler(item, isFolder)}
                    onOpenInWindow={buildOpenInWindowHandler(item, isFolder)}
                    onNewSubfolder={buildNewSubfolderHandler(item, isFolder)}
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
                  <div className="dome-folder-view__inline-create dome-folder-view__inline-create--grid">
                    <NewFolderInline
                      variant="grid"
                      onConfirm={handleCreateFolder}
                      onCancel={() => { setCreatingFolder(false); setCreateFolderParentId(null); }}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )
        ) : creatingFolder ? (
          <div className="dome-folder-view__grid dome-folder-view__grid--empty-create">
            <div className="dome-folder-view__inline-create dome-folder-view__inline-create--grid">
              <NewFolderInline
                variant="grid"
                onConfirm={handleCreateFolder}
                onCancel={() => { setCreatingFolder(false); setCreateFolderParentId(null); }}
              />
            </div>
          </div>
        ) : (
          <p className="dome-folder-view__empty">{t('folder.emptyFolderShort', 'Carpeta vacía')}</p>
        )}
      </div>

      <MoveFolderModal
        open={folderPickOpen}
        onClose={() => { setFolderPickOpen(false); setFolderMoveIds(null); }}
        resourceIds={folderMoveIds ?? filterMoveProjectRoots(selectedIds, resourceMapForSelection)}
        allFolders={allFolders}
        projectId={effectiveProjectId}
        currentFolderId={listFolderId}
        onConfirm={handleBulkMoveToFolder}
      />

      <MoveToProjectModal
        opened={moveProjectIds.length > 0}
        onClose={() => setMoveProjectIds([])}
        resourceIds={moveProjectIds}
        resourcesById={resourceMapForSelection}
        onCompleted={() => void refetch()}
      />

      {deleteTarget && (
        <DeleteConfirmModal
          resource={deleteTarget}
          onConfirm={() => void handleDeleteConfirm()}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {bulkDeleteOpen && (
        <BulkDeleteConfirmModal
          count={selectedIds.size}
          busy={bulkDeleting}
          onConfirm={() => void handleBulkDelete()}
          onClose={() => setBulkDeleteOpen(false)}
        />
      )}

      {urlModalOpen && (
        <UrlInputModal
          onConfirm={handleAddUrl}
          onClose={() => setUrlModalOpen(false)}
        />
      )}
    </div>
  );
}
