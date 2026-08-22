/** Action callbacks for FolderTabView (extracted for Sonar S3776). */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Resource } from '@/lib/hooks/useResources';
import { filterMoveProjectRoots } from '@/lib/workspace/filterMoveProjectRoots';
import { getFolderColor } from './folderTabShared';
import {
  importPathsIntoFolderView,
  openNoteInWindow,
  revealFolderOrVault,
  runAddUrl,
  runApplyFolderColor,
  runBulkDelete,
  runBulkMoveToFolder,
  runCreateUntitledNote,
  runSubfolderColor,
  runUploadIntoView,
  tabColorFromFolderMeta,
  toggleIdInSet,
} from './folderTabViewHelpers';

export function useToggleSelectId(setSelectedIds: Dispatch<SetStateAction<Set<string>>>) {
  return useCallback(
    (id: string) => {
      setSelectedIds((prev) => toggleIdInSet(prev, id));
    },
    [setSelectedIds],
  );
}

export function useBulkMoveToFolder(opts: {
  folderMoveIds: string[] | null;
  selectedIds: Set<string>;
  resourceMapForSelection: Map<string, Resource>;
  moveToFolder: (id: string, folderId: string | null) => Promise<boolean>;
  refetch: () => Promise<unknown>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setFolderMoveIds: Dispatch<SetStateAction<string[] | null>>;
  setFolderPickOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    folderMoveIds,
    selectedIds,
    resourceMapForSelection,
    moveToFolder,
    refetch,
    setSelectedIds,
    setFolderMoveIds,
    setFolderPickOpen,
  } = opts;

  return useCallback(
    async (targetFolderId: string | null) => {
      const outcome = await runBulkMoveToFolder({
        folderMoveIds,
        selectedIds,
        resourceMapForSelection,
        targetFolderId,
        moveToFolder,
        filterRoots: filterMoveProjectRoots,
      });
      if (outcome === 'cleared-selection') setSelectedIds(new Set());
      setFolderMoveIds(null);
      setFolderPickOpen(false);
      await refetch();
    },
    [
      folderMoveIds,
      selectedIds,
      resourceMapForSelection,
      moveToFolder,
      refetch,
      setSelectedIds,
      setFolderMoveIds,
      setFolderPickOpen,
    ],
  );
}

export function useBulkDelete(opts: {
  selectedIds: Set<string>;
  refetch: () => Promise<unknown>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setBulkDeleting: Dispatch<SetStateAction<boolean>>;
  setBulkDeleteOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { selectedIds, refetch, setSelectedIds, setBulkDeleting, setBulkDeleteOpen } = opts;
  return useCallback(async () => {
    setBulkDeleting(true);
    try {
      const ok = await runBulkDelete(selectedIds, refetch);
      if (ok) setSelectedIds(new Set());
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  }, [selectedIds, refetch, setSelectedIds, setBulkDeleting, setBulkDeleteOpen]);
}

type CreateResource = (resource: Omit<Resource, 'id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
type UpdateResource = (id: string, updates: Partial<Resource>) => Promise<unknown>;

export function useFolderTabResourceActions(opts: {
  canOpenInSplit: boolean;
  openResourceInSplit: (id: string, type: string, title: string) => void;
  createResource: CreateResource;
  effectiveProjectId: string;
  listFolderId: string | null;
  createFolderParentId: string | null;
  setCreatingFolder: Dispatch<SetStateAction<boolean>>;
  setCreateFolderParentId: Dispatch<SetStateAction<string | null>>;
  openResourceTab: (id: string, type: string, title: string, projectId: string) => void;
  untitledNoteTitle: string;
  refetch: () => Promise<unknown>;
  updateResource: UpdateResource;
  updateTab: (id: string, patch: { title?: string; color?: string }) => void;
  deleteResource: (id: string) => Promise<unknown>;
  deleteTarget: Resource | null;
  setDeleteTarget: Dispatch<SetStateAction<Resource | null>>;
  viewCtxIsProjectRoot: boolean;
  currentFolder: Resource | undefined;
  folderId: string;
  setColorPickerPos: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
  navigateToFolder: (loc: { id: string; title: string; color?: string }) => void;
  projectRootLabel: string;
  tUntitled: string;
}) {
  const {
    canOpenInSplit,
    openResourceInSplit,
    createResource,
    effectiveProjectId,
    listFolderId,
    createFolderParentId,
    setCreatingFolder,
    setCreateFolderParentId,
    openResourceTab,
    untitledNoteTitle,
    refetch,
    updateResource,
    updateTab,
    deleteResource,
    deleteTarget,
    setDeleteTarget,
    viewCtxIsProjectRoot,
    currentFolder,
    folderId,
    setColorPickerPos,
    navigateToFolder,
    projectRootLabel,
    tUntitled,
  } = opts;

  const handleNavigateToFolder = useCallback(
    (id: string, title: string, color?: string) => {
      navigateToFolder({ id, title, color: tabColorFromFolderMeta(color) });
    },
    [navigateToFolder],
  );

  const handleNavigateToProjectRoot = useCallback(() => {
    if (!effectiveProjectId) return;
    handleNavigateToFolder(effectiveProjectId, projectRootLabel, 'var(--primary)');
  }, [effectiveProjectId, projectRootLabel, handleNavigateToFolder]);

  const handleCurrentFolderColor = useCallback(
    async (color: string) => {
      const applied = await runApplyFolderColor({
        currentFolder,
        folderId,
        color,
        updateResource,
        updateTab,
      });
      if (applied) setColorPickerPos(null);
    },
    [currentFolder, folderId, updateResource, updateTab, setColorPickerPos],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
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
    },
    [
      createResource,
      effectiveProjectId,
      listFolderId,
      createFolderParentId,
      setCreatingFolder,
      setCreateFolderParentId,
    ],
  );

  const handleOpenInSplit = useCallback(
    (item: Resource) => {
      if (!canOpenInSplit) return;
      openResourceInSplit(item.id, item.type, item.title ?? '');
    },
    [canOpenInSplit, openResourceInSplit],
  );

  const handleOpenInWindow = useCallback(async (item: Resource) => {
    await openNoteInWindow(item);
  }, []);

  const handleNewSubfolder = useCallback(
    (parentId: string) => {
      setCreateFolderParentId(parentId);
      setCreatingFolder(true);
    },
    [setCreateFolderParentId, setCreatingFolder],
  );

  const handleNewNote = useCallback(async () => {
    await runCreateUntitledNote({
      title: untitledNoteTitle,
      effectiveProjectId,
      listFolderId,
      openResourceTab,
    });
  }, [effectiveProjectId, listFolderId, untitledNoteTitle, openResourceTab]);

  const importPathsIntoView = useCallback(
    async (paths: string[]) => {
      await importPathsIntoFolderView({
        paths,
        effectiveProjectId,
        listFolderId,
        refetch,
      });
    },
    [effectiveProjectId, listFolderId, refetch],
  );

  const handleUpload = useCallback(async () => {
    await runUploadIntoView(importPathsIntoView);
  }, [importPathsIntoView]);

  const handleAddUrl = useCallback(
    (url: string) => {
      runAddUrl({ url, effectiveProjectId, listFolderId });
    },
    [effectiveProjectId, listFolderId],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteResource(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteResource, setDeleteTarget]);

  const handleRevealCurrentFolder = useCallback(async () => {
    await revealFolderOrVault({
      isProjectRoot: viewCtxIsProjectRoot,
      currentFolder,
      effectiveProjectId,
    });
  }, [viewCtxIsProjectRoot, currentFolder, effectiveProjectId]);

  const handleRenameFile = useCallback(
    async (id: string, newTitle: string) => {
      await updateResource(id, { title: newTitle });
    },
    [updateResource],
  );

  const handleSubfolderRename = useCallback(
    async (id: string, newTitle: string) => {
      await updateResource(id, { title: newTitle });
      updateTab(`folder:${id}`, { title: newTitle });
    },
    [updateResource, updateTab],
  );

  const handleSubfolderColor = useCallback(
    async (id: string, color: string, folder: Resource) => {
      await runSubfolderColor({ id, color, folder, updateResource, updateTab });
    },
    [updateResource, updateTab],
  );

  const openListItem = useCallback(
    ({ item, isFolder }: { item: Resource; isFolder: boolean }) => {
      if (isFolder) {
        handleNavigateToFolder(item.id, item.title, getFolderColor(item));
        return;
      }
      openResourceTab(item.id, item.type, item.title ?? tUntitled, effectiveProjectId);
    },
    [handleNavigateToFolder, openResourceTab, tUntitled, effectiveProjectId],
  );

  return {
    handleNavigateToFolder,
    handleNavigateToProjectRoot,
    handleCurrentFolderColor,
    handleCreateFolder,
    handleOpenInSplit,
    handleOpenInWindow,
    handleNewSubfolder,
    handleNewNote,
    importPathsIntoView,
    handleUpload,
    handleAddUrl,
    handleDeleteConfirm,
    handleRevealCurrentFolder,
    handleRenameFile,
    handleSubfolderRename,
    handleSubfolderColor,
    openListItem,
  };
}
