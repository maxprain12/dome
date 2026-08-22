import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useResources, type Resource } from '@/lib/hooks/useResources';
import { useTabStore, FOLDER_TAB_PREFIX } from '@/lib/store/useTabStore';
import { useFolderNavigationHistory } from '@/lib/hooks/useFolderNavigationHistory';
import { useAppStore } from '@/lib/store/useAppStore';
import { filterMoveProjectRoots } from '@/lib/workspace/filterMoveProjectRoots';
import SelectionActionBar from '@/components/home/SelectionActionBar';
import { Spinner } from '@/components/ui/spinner';
import '@/styles/folder-view.css';

import { resolveFolderTabView, FOLDER_COLOR_DEFAULT } from './folder-tab/folderTabShared';
import ColorPickerPopover from './folder-tab/ColorPickerPopover';
import FolderTabToolbar from './folder-tab/FolderTabToolbar';
import FolderTabBody from './folder-tab/FolderTabBody';
import FolderTabDialogs from './folder-tab/FolderTabDialogs';
import FolderTabDropOverlay from './folder-tab/FolderTabDropOverlay';
import { useFolderOsDrop } from './folder-tab/useFolderOsDrop';
import { useFolderTabSearchController } from './folder-tab/useFolderTabSearch';
import {
  useFolderNavAltArrowKeys,
  useProjectTagsLoader,
  useTaggedResourcesLoader,
} from './folder-tab/useFolderTabEffects';
import {
  useToggleSelectId,
  useBulkMoveToFolder,
  useBulkDelete,
  useFolderTabResourceActions,
} from './folder-tab/useFolderTabActions';
import {
  type FolderViewMode,
  type ProjectTag,
  readFolderViewMode,
  partitionFolderChildren,
  buildResourceMapForSelection,
  buildFolderListItems,
  filterListItemsBySearch,
  resolveEffectiveProjectId,
  folderSearchModHint,
  folderRevealLabel,
  computeFolderViewStatus,
  colorPickerPositionFromRect,
  resolveFolderChromeColor,
  buildTabColorKey,
  canOpenResourceInSplit,
  buildBreadcrumbExcludingCurrent,
  persistFolderViewMode,
} from './folder-tab/folderTabViewHelpers';

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
    persistFolderViewMode(next);
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

  const platform = typeof navigator === 'undefined' ? undefined : navigator.platform;
  const searchModHint = folderSearchModHint(platform);
  const revealLabel = folderRevealLabel(
    platform,
    t('folder.reveal_in_finder'),
    t('folder.reveal_in_explorer'),
  );

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

  const { subfolders, files } = useMemo(
    () => partitionFolderChildren(allResources, viewCtx, folderId),
    [allResources, viewCtx, folderId],
  );

  const currentFolder = viewCtx.isProjectRoot ? undefined : folderResource;
  const displayTitle = currentFolder?.title ?? folderTitle;
  // Breadcrumb root = the project (vault root), never "Home".
  const projectRootLabel = currentProject?.name || 'Library';
  const effectiveProjectId = resolveEffectiveProjectId({
    isProjectRoot: viewCtx.isProjectRoot,
    viewProjectId: viewCtx.projectId,
    currentFolderProjectId: currentFolder?.project_id,
    currentProjectId: currentProject?.id,
  });
  const listFolderId = viewCtx.listFolderId;

  const resourceMapForSelection = useMemo(
    () =>
      buildResourceMapForSelection({
        subfolders,
        files,
        folderId,
        isProjectRoot: viewCtx.isProjectRoot,
        getBreadcrumbPath,
        getFolderById,
      }),
    [subfolders, files, folderId, getBreadcrumbPath, getFolderById, viewCtx.isProjectRoot],
  );

  const toggleSelectId = useToggleSelectId(setSelectedIds);
  const handleBulkMoveToFolder = useBulkMoveToFolder({
    folderMoveIds,
    selectedIds,
    resourceMapForSelection,
    moveToFolder,
    refetch,
    setSelectedIds,
    setFolderMoveIds,
    setFolderPickOpen,
  });

  const openFolderPickerFor = useCallback((id: string) => {
    setFolderMoveIds([id]);
    setFolderPickOpen(true);
  }, []);

  const handleBulkDelete = useBulkDelete({
    selectedIds,
    refetch,
    setSelectedIds,
    setBulkDeleting,
    setBulkDeleteOpen,
  });

  const { openResourceTab, openResourceInSplit, navigateFolderTab, updateTab, activeTabId, tabs } =
    useTabStore(
      useShallow((s) => ({
        openResourceTab: s.openResourceTab,
        openResourceInSplit: s.openResourceInSplit,
        navigateFolderTab: s.navigateFolderTab,
        updateTab: s.updateTab,
        activeTabId: s.activeTabId,
        tabs: s.tabs,
      })),
    );

  const canOpenInSplit = canOpenResourceInSplit(activeTabId, tabs);

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

  useFolderNavAltArrowKeys(goBack, goForward);

  const prevListFolderIdRef = useRef<string | null | undefined>(listFolderId);
  if (prevListFolderIdRef.current !== listFolderId) {
    prevListFolderIdRef.current = listFolderId;
    setCurrentFolderId(listFolderId);
  }

  useEffect(() => () => { setCurrentFolderId(null); }, [setCurrentFolderId]);

  useProjectTagsLoader(effectiveProjectId, setProjectTags);
  useTaggedResourcesLoader(tagFilterId, effectiveProjectId, setTaggedResourceIds);

  const breadcrumb = useMemo(
    () => buildBreadcrumbExcludingCurrent(viewCtx.isProjectRoot, folderId, getBreadcrumbPath),
    [folderId, getBreadcrumbPath, viewCtx.isProjectRoot],
  );

  const { folderColorHex } = resolveFolderChromeColor(currentFolder);
  const tabColorKey = buildTabColorKey(folderId, folderColorHex, viewCtx.isProjectRoot);
  const prevTabColorKeyRef = useRef('');
  if (tabColorKey && tabColorKey !== prevTabColorKeyRef.current) {
    prevTabColorKeyRef.current = tabColorKey;
    updateTab(`folder:${folderId}`, { color: folderColorHex! });
  }

  const actions = useFolderTabResourceActions({
    canOpenInSplit,
    openResourceInSplit,
    createResource,
    effectiveProjectId,
    listFolderId,
    createFolderParentId,
    setCreatingFolder,
    setCreateFolderParentId,
    openResourceTab,
    untitledNoteTitle: t('dashboard.untitled_note', 'Nota sin título'),
    refetch,
    updateResource,
    updateTab,
    deleteResource,
    deleteTarget,
    setDeleteTarget,
    viewCtxIsProjectRoot: viewCtx.isProjectRoot,
    currentFolder,
    folderId,
    setColorPickerPos,
    navigateToFolder,
    projectRootLabel,
    tUntitled: t('folder.untitled'),
  });

  const {
    osDropActive,
    handleOsDragEnter,
    handleOsDragOver,
    handleOsDragLeave,
    handleOsDrop,
  } = useFolderOsDrop(actions.importPathsIntoView);

  const listItems = useMemo(
    () =>
      buildFolderListItems({
        tagFilterId,
        allResources,
        effectiveProjectId,
        taggedResourceIds,
        subfolders,
        files,
      }),
    [tagFilterId, allResources, effectiveProjectId, taggedResourceIds, subfolders, files],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isFiltering = normalizedSearchQuery.length > 0;
  const isTagFiltering = tagFilterId !== null;
  const activeTag = projectTags.find((tag) => tag.id === tagFilterId);

  const filteredListItems = useMemo(
    () => filterListItemsBySearch(listItems, normalizedSearchQuery, t('folder.untitled')),
    [listItems, normalizedSearchQuery, t],
  );

  const { setRowRef, closeSearch, openSearch, handleSearchKeyDown } = useFolderTabSearchController({
    searchOpen,
    searchQuery,
    setSearchQuery,
    setSearchOpen,
    searchFocusIndex,
    setSearchFocusIndex,
    searchInputRef,
    filteredListItems,
    normalizedSearchQuery,
    isFiltering,
    openListItem: actions.openListItem,
  });

  const prevFolderIdRef = useRef(folderId);
  if (folderId !== prevFolderIdRef.current) {
    prevFolderIdRef.current = folderId;
    closeSearch();
    setTagFilterId(null);
  }

  const openFolderColorPicker = useCallback(() => {
    const btn = folderMenuBtnRef.current;
    if (!btn) return;
    setColorPickerPos(colorPickerPositionFromRect(btn.getBoundingClientRect()));
  }, []);

  const onCancelCreateFolder = useCallback(() => {
    setCreatingFolder(false);
    setCreateFolderParentId(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  const { isEmpty, showNoResults, rowsToRender, statusLabel } = computeFolderViewStatus({
    tagFilterId,
    listItems,
    subfoldersLen: subfolders.length,
    filesLen: files.length,
    creatingFolder,
    isFiltering,
    isTagFiltering,
    filteredListItems,
    activeTagName: activeTag?.name,
    statusTag: ({ name, count }) =>
      t('folder.tagFilterActive', { name, count, defaultValue: '{{name}} · {{count}}' }),
    statusSearch: ({ count, total }) => t('folder.searchResultCount', { count, total }),
    statusCount: ({ count }) => t('folder.itemCount', { count }),
  });

  return (
    <div
      className="dome-folder-view"
      onDragEnter={handleOsDragEnter}
      onDragOver={handleOsDragOver}
      onDragLeave={handleOsDragLeave}
      onDrop={handleOsDrop}
    >
      <FolderTabDropOverlay active={osDropActive} />

      <FolderTabToolbar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        goBack={goBack}
        goForward={goForward}
        isProjectRoot={viewCtx.isProjectRoot}
        projectRootLabel={projectRootLabel}
        breadcrumb={breadcrumb}
        displayTitle={displayTitle}
        handleNavigateToProjectRoot={actions.handleNavigateToProjectRoot}
        handleNavigateToFolder={actions.handleNavigateToFolder}
        viewMode={viewMode}
        setFolderViewMode={setFolderViewMode}
        isTagFiltering={isTagFiltering}
        tagFilterId={tagFilterId}
        setTagFilterId={setTagFilterId}
        projectTags={projectTags}
        activeTag={activeTag}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchInputRef={searchInputRef}
        handleSearchKeyDown={handleSearchKeyDown}
        searchModHint={searchModHint}
        openSearch={openSearch}
        closeSearch={closeSearch}
        folderMenuBtnRef={folderMenuBtnRef}
        currentFolder={currentFolder}
        openFolderColorPicker={openFolderColorPicker}
        handleRevealCurrentFolder={actions.handleRevealCurrentFolder}
        revealLabel={revealLabel}
        setCreatingFolder={setCreatingFolder}
        handleNewNote={actions.handleNewNote}
        handleUpload={actions.handleUpload}
        setUrlModalOpen={setUrlModalOpen}
      />

      <SelectionActionBar
        count={selectedIds.size}
        onMoveToFolder={() => {
          setFolderMoveIds(null);
          setFolderPickOpen(true);
        }}
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
          onSave={actions.handleCurrentFolderColor}
          onClose={() => setColorPickerPos(null)}
        />
      ) : null}

      <div
        className={`dome-folder-view__list dome-folder-view__list--${viewMode}`}
        data-view-mode={viewMode}
      >
        <FolderTabBody
          viewMode={viewMode}
          showNoResults={showNoResults}
          isEmpty={isEmpty}
          isTagFiltering={isTagFiltering}
          isFiltering={isFiltering}
          creatingFolder={creatingFolder}
          statusLabel={statusLabel}
          searchQuery={searchQuery}
          normalizedSearchQuery={normalizedSearchQuery}
          rowsToRender={rowsToRender}
          searchFocusIndex={searchFocusIndex}
          selectedIds={selectedIds}
          showSelectionChrome={showSelectionChrome}
          canOpenInSplit={canOpenInSplit}
          effectiveProjectId={effectiveProjectId}
          setRowRef={setRowRef}
          openListItem={actions.openListItem}
          handleNavigateToFolder={actions.handleNavigateToFolder}
          openResourceTab={openResourceTab}
          setDeleteTarget={setDeleteTarget}
          handleSubfolderRename={actions.handleSubfolderRename}
          handleRenameFile={actions.handleRenameFile}
          handleSubfolderColor={actions.handleSubfolderColor}
          setMoveProjectIds={setMoveProjectIds}
          openFolderPickerFor={openFolderPickerFor}
          handleOpenInSplit={actions.handleOpenInSplit}
          handleOpenInWindow={actions.handleOpenInWindow}
          handleNewSubfolder={actions.handleNewSubfolder}
          toggleSelectId={toggleSelectId}
          handleCreateFolder={actions.handleCreateFolder}
          onCancelCreateFolder={onCancelCreateFolder}
        />
      </div>

      <FolderTabDialogs
        folderPickOpen={folderPickOpen}
        onCloseFolderPick={() => {
          setFolderPickOpen(false);
          setFolderMoveIds(null);
        }}
        folderMoveIds={folderMoveIds}
        selectedIds={selectedIds}
        resourceMapForSelection={resourceMapForSelection}
        allFolders={allFolders}
        effectiveProjectId={effectiveProjectId}
        listFolderId={listFolderId}
        onConfirmBulkMove={handleBulkMoveToFolder}
        moveProjectIds={moveProjectIds}
        onCloseMoveProject={() => setMoveProjectIds([])}
        onMoveProjectCompleted={() => {
          void refetch();
        }}
        deleteTarget={deleteTarget}
        onConfirmDelete={() => {
          void actions.handleDeleteConfirm();
        }}
        onCloseDelete={() => setDeleteTarget(null)}
        bulkDeleteOpen={bulkDeleteOpen}
        bulkDeleting={bulkDeleting}
        onConfirmBulkDelete={() => {
          void handleBulkDelete();
        }}
        onCloseBulkDelete={() => setBulkDeleteOpen(false)}
        urlModalOpen={urlModalOpen}
        onConfirmUrl={actions.handleAddUrl}
        onCloseUrl={() => setUrlModalOpen(false)}
      />
    </div>
  );
}
