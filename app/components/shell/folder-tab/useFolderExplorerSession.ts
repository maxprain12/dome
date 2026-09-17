/** Selection, keyboard, sort and internal DnD session for FolderTabView. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Resource } from '@/lib/hooks/useResources';
import {
  applyExplorerPointerSelect,
  moveExplorerFocus,
  selectAllIds,
} from '@/lib/workspace/explorerSelection';
import {
  persistExplorerSort,
  readExplorerSort,
  sortExplorerEntries,
  type ExplorerSortDir,
  type ExplorerSortKey,
} from '@/lib/workspace/explorerSort';
import {
  beginExplorerDrag,
  canDropExplorerItems,
  endExplorerDrag,
  explorerDragIdsForItem,
  getActiveExplorerDrag,
  isInternalResourceDrag,
  isOsFileDrag,
  setExplorerDragGhost,
  writeExplorerDrag,
  type ExplorerNode,
} from '@/lib/workspace/explorerDnD';
import { classifyExplorerKey } from '@/lib/workspace/explorerKeyboard';
import type { FolderListEntry, FolderViewMode } from './folderTabViewHelpers';

export function useFolderExplorerSession(opts: {
  entries: FolderListEntry[];
  untitled: string;
  copySuffix: string;
  viewMode: FolderViewMode;
  allResources: Resource[];
  projectId: string;
  listFolderId: string | null;
  moveToFolder: (id: string, folderId: string | null) => Promise<boolean>;
  refetch: () => Promise<unknown>;
  openEntry: (entry: FolderListEntry) => void;
  importOsPaths: (paths: string[], folderId: string | null) => Promise<void>;
}) {
  const {
    entries,
    untitled,
    copySuffix,
    viewMode,
    allResources,
    projectId,
    listFolderId,
    moveToFolder,
    refetch,
    openEntry,
    importOsPaths,
  } = opts;

  const [sortKey, setSortKey] = useState<ExplorerSortKey>(() => readExplorerSort().key);
  const [sortDir, setSortDir] = useState<ExplorerSortDir>(() => readExplorerSort().dir);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [quickLookId, setQuickLookId] = useState<string | null>(null);
  const [renameArmedId, setRenameArmedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null | undefined>(undefined);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  useEffect(() => {
    if (!renameArmedId) return undefined;
    const timer = globalThis.setTimeout(() => setRenameArmedId(null), 0);
    return () => globalThis.clearTimeout(timer);
  }, [renameArmedId]);

  const setSort = useCallback((key: ExplorerSortKey, dir: ExplorerSortDir) => {
    setSortKey(key);
    setSortDir(dir);
    persistExplorerSort({ key, dir });
  }, []);

  const sortedEntries = useMemo(
    () => sortExplorerEntries(entries, { key: sortKey, dir: sortDir, untitled }),
    [entries, sortKey, sortDir, untitled],
  );
  const orderedIds = useMemo(() => sortedEntries.map((row) => row.item.id), [sortedEntries]);
  const entryById = useMemo(
    () => new Map(sortedEntries.map((row) => [row.item.id, row])),
    [sortedEntries],
  );

  const byId = useMemo(() => {
    const map = new Map<string, ExplorerNode>();
    for (const resource of allResources) {
      map.set(resource.id, {
        id: resource.id,
        type: resource.type,
        folder_id: resource.folder_id,
        project_id: resource.project_id,
      });
    }
    return map;
  }, [allResources]);

  const resourceMap = useMemo(
    () => new Map(allResources.map((resource) => [resource.id, resource])),
    [allResources],
  );

  const selectItem = useCallback(
    (id: string, event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
      const next = applyExplorerPointerSelect({
        id,
        orderedIds,
        selectedIds,
        anchorId,
        additive: Boolean(event.metaKey || event.ctrlKey),
        range: Boolean(event.shiftKey),
      });
      setSelectedIds(next.selectedIds);
      setAnchorId(next.anchorId);
      setFocusId(id);
    },
    [anchorId, orderedIds, selectedIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const openFocused = useCallback(() => {
    const id = focusId ?? (selectedIds.size === 1 ? [...selectedIds][0] : null);
    if (!id) return;
    const entry = entryById.get(id);
    if (entry) openEntry(entry);
  }, [entryById, focusId, openEntry, selectedIds]);

  const openQuickLook = useCallback((id?: string) => {
    const target = id ?? focusId ?? (selectedIds.size === 1 ? [...selectedIds][0] : orderedIds[0]);
    if (!target) return;
    setQuickLookId(target);
    setFocusId(target);
  }, [focusId, orderedIds, selectedIds]);

  const applyInternalDrop = useCallback(
    async (targetFolderId: string | null) => {
      const drag = getActiveExplorerDrag();
      if (!drag) return false;
      const check = canDropExplorerItems({
        sourceIds: drag.ids,
        targetFolderId,
        projectId,
        byId,
      });
      if (!check.ok) return false;
      for (const id of drag.ids) {
        const ok = await moveToFolder(id, targetFolderId);
        if (!ok) break;
      }
      endExplorerDrag();
      setDraggingIds([]);
      setDropTargetId(undefined);
      setSelectedIds(new Set());
      await refetch();
      return true;
    },
    [byId, moveToFolder, projectId, refetch],
  );

  const handleItemDragStart = useCallback(
    (item: Resource, event: React.DragEvent) => {
      const ids = explorerDragIdsForItem(item.id, selectedIds, resourceMap);
      const payload = { ids, projectId };
      writeExplorerDrag(event.dataTransfer, payload);
      beginExplorerDrag(payload);
      setExplorerDragGhost(event.dataTransfer, item.title || untitled, ids.length);
      setDraggingIds(ids);
      if (!selectedIds.has(item.id)) {
        setSelectedIds(new Set([item.id]));
        setAnchorId(item.id);
        setFocusId(item.id);
      }
    },
    [projectId, resourceMap, selectedIds, untitled],
  );

  const handleItemDragOver = useCallback(
    (target: Resource | null, event: React.DragEvent) => {
      const types = event.dataTransfer.types;
      const targetFolderId = target?.type === 'folder' ? target.id : listFolderId;
      if (isOsFileDrag(types) && (target?.type === 'folder' || target === null)) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setDropTargetId(targetFolderId);
        return;
      }
      if (!isInternalResourceDrag(types) && !getActiveExplorerDrag()) return;
      const drag = getActiveExplorerDrag();
      if (!drag) return;
      const check = canDropExplorerItems({
        sourceIds: drag.ids,
        targetFolderId,
        projectId: drag.projectId,
        byId,
      });
      if (!check.ok) {
        event.dataTransfer.dropEffect = 'none';
        setDropTargetId(undefined);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setDropTargetId(targetFolderId);
    },
    [byId, listFolderId],
  );

  const handleItemDrop = useCallback(
    async (target: Resource | null, event: React.DragEvent) => {
      const targetFolderId = target?.type === 'folder' ? target.id : listFolderId;
      if (isOsFileDrag(event.dataTransfer.types)) {
        event.preventDefault();
        event.stopPropagation();
        const files = Array.from(event.dataTransfer.files ?? []);
        const paths = (globalThis.window.electron?.getPathsForFiles?.(files) ?? []).filter(Boolean) as string[];
        setDropTargetId(undefined);
        if (paths.length) await importOsPaths(paths, targetFolderId);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      await applyInternalDrop(targetFolderId);
    },
    [applyInternalDrop, importOsPaths, listFolderId],
  );

  const handleDragEnd = useCallback(() => {
    endExplorerDrag();
    setDraggingIds([]);
    setDropTargetId(undefined);
  }, []);

  const handleItemDragLeave = useCallback(() => {
    setDropTargetId(undefined);
  }, []);

  const handleBackgroundDrop = useCallback(
    async (event: React.DragEvent) => {
      await handleItemDrop(null, event);
    },
    [handleItemDrop],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = classifyExplorerKey(event);
      if (!command) return;
      if (command === 'selectAll') {
        event.preventDefault();
        setSelectedIds(selectAllIds(orderedIds));
        return;
      }
      if (command === 'escape') {
        if (quickLookId) {
          setQuickLookId(null);
          return;
        }
        clearSelection();
        setRenameArmedId(null);
        return;
      }
      if (command === 'open') {
        event.preventDefault();
        openFocused();
        return;
      }
      if (command === 'quickLook') {
        event.preventDefault();
        openQuickLook();
        return;
      }
      if (command === 'rename') {
        event.preventDefault();
        const id = focusId ?? (selectedIds.size === 1 ? [...selectedIds][0] : null);
        if (id) setRenameArmedId(id);
        return;
      }
      if (command === 'delete') {
        event.preventDefault();
        if (selectedIds.size > 0) setBulkDeleteOpen(true);
        return;
      }
      if (command === 'duplicate') {
        event.preventDefault();
        const id = focusId ?? (selectedIds.size === 1 ? [...selectedIds][0] : null);
        if (!id) return;
        const dup = window.electron?.resource?.duplicate(id, { suffix: copySuffix });
        if (dup) {
          dup.then(() => refetch()).catch(() => undefined);
        }
        return;
      }
      const delta = arrowDelta(command, viewMode);
      if (delta === 0) return;
      event.preventDefault();
      const nextId = moveExplorerFocus({ orderedIds, currentId: focusId, delta });
      if (!nextId) return;
      if (event.shiftKey) {
        selectItem(nextId, { shiftKey: true });
      } else {
        setFocusId(nextId);
        setSelectedIds(new Set([nextId]));
        setAnchorId(nextId);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    clearSelection,
    focusId,
    openFocused,
    openQuickLook,
    orderedIds,
    quickLookId,
    selectItem,
    selectedIds,
    viewMode,
    copySuffix,
    refetch,
  ]);

  const quickLookResource = quickLookId ? (resourceMap.get(quickLookId) ?? null) : null;
  const quickLookList = sortedEntries.map((row) => row.item);

  return {
    sortKey,
    sortDir,
    setSort,
    sortedEntries,
    selectedIds,
    setSelectedIds,
    focusId,
    selectItem,
    clearSelection,
    renameArmedId,
    setRenameArmedId,
    quickLookId,
    setQuickLookId,
    openQuickLook,
    quickLookResource,
    quickLookList,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    dropTargetId,
    draggingIds,
    handleItemDragStart,
    handleItemDragOver,
    handleItemDrop,
    handleDragEnd,
    handleItemDragLeave,
    handleBackgroundDrop,
    showSelectionChrome: selectedIds.size > 1,
  };
}

function arrowDelta(
  command: 'arrowUp' | 'arrowDown' | 'arrowLeft' | 'arrowRight' | string,
  viewMode: FolderViewMode,
): number {
  if (viewMode === 'list') {
    if (command === 'arrowUp') return -1;
    if (command === 'arrowDown') return 1;
    return 0;
  }
  if (command === 'arrowLeft' || command === 'arrowUp') return -1;
  if (command === 'arrowRight' || command === 'arrowDown') return 1;
  return 0;
}
