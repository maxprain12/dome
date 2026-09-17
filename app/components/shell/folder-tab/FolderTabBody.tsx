/** Folder tab list/grid body (extracted from FolderTabView for Sonar S3776). */

import { useTranslation } from 'react-i18next';
import type { Resource } from '@/lib/hooks/useResources';
import { getFolderColor } from './folderTabShared';
import FolderListRow from './FolderListRow';
import FolderCard from './FolderCard';
import NewFolderInline from './NewFolderInline';
import { FolderExplorerEmpty, FolderExplorerError } from './FolderExplorerEmpty';
import type { FolderListEntry, FolderViewMode } from './folderTabViewHelpers';
import { useFolderVirtualWindow } from './useFolderVirtualWindow';
import { cn } from '@/lib/utils';

export interface FolderTabBodyProps {
  viewMode: FolderViewMode;
  showNoResults: boolean;
  isEmpty: boolean;
  isTagFiltering: boolean;
  isFiltering: boolean;
  creatingFolder: boolean;
  statusLabel: string;
  searchQuery: string;
  normalizedSearchQuery: string;
  rowsToRender: FolderListEntry[];
  searchFocusIndex: number;
  selectedIds: Set<string>;
  showSelectionChrome: boolean;
  canOpenInSplit: boolean;
  effectiveProjectId: string;
  setRowRef: (id: string) => (el: HTMLDivElement | null) => void;
  openListItem: (entry: FolderListEntry) => void;
  handleNavigateToFolder: (id: string, title: string, color?: string) => void;
  openResourceTab: (
    id: string,
    type: string,
    title: string,
    projectId: string,
  ) => void;
  setDeleteTarget: (item: Resource) => void;
  handleSubfolderRename: (id: string, title: string) => void | Promise<void>;
  handleRenameFile: (id: string, title: string) => void | Promise<void>;
  handleSubfolderColor: (id: string, color: string, folder: Resource) => void | Promise<void>;
  setMoveProjectIds: (ids: string[]) => void;
  openFolderPickerFor: (id: string) => void;
  handleOpenInSplit: (item: Resource) => void;
  handleOpenInWindow: (item: Resource) => void | Promise<void>;
  handleNewSubfolder: (parentId: string) => void;
  toggleSelectId: (id: string, event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => void;
  handleCreateFolder: (name: string) => void | Promise<void>;
  onCancelCreateFolder: () => void;
  loadError?: string | null;
  onRetry?: () => void;
  onImport?: () => void;
  onNewNote?: () => void;
  onNewFolder?: () => void;
  childCountByFolder?: Map<string, number>;
  dropTargetId?: string | null;
  draggingIds?: string[];
  renameArmedId?: string | null;
  onPreview?: (item: Resource) => void;
  onItemDragStart?: (item: Resource, e: React.DragEvent) => void;
  onItemDragOver?: (item: Resource | null, e: React.DragEvent) => void;
  onItemDragLeave?: () => void;
  onItemDrop?: (item: Resource | null, e: React.DragEvent) => void;
  onItemDragEnd?: (e: React.DragEvent) => void;
}

export default function FolderTabBody(props: FolderTabBodyProps) {
  const { t } = useTranslation();
  const {
    viewMode,
    showNoResults,
    isEmpty,
    isTagFiltering,
    isFiltering,
    creatingFolder,
    statusLabel,
    searchQuery,
    normalizedSearchQuery,
    rowsToRender,
    searchFocusIndex,
    selectedIds,
    showSelectionChrome,
    canOpenInSplit,
    effectiveProjectId,
    setRowRef,
    openListItem,
    handleNavigateToFolder,
    openResourceTab,
    setDeleteTarget,
    handleSubfolderRename,
    handleRenameFile,
    handleSubfolderColor,
    setMoveProjectIds,
    openFolderPickerFor,
    handleOpenInSplit,
    handleOpenInWindow,
    handleNewSubfolder,
    toggleSelectId,
    handleCreateFolder,
    onCancelCreateFolder,
    loadError,
    onRetry,
    onImport,
    onNewNote,
    onNewFolder,
    childCountByFolder,
    dropTargetId,
    draggingIds,
    renameArmedId,
    onPreview,
    onItemDragStart,
    onItemDragOver,
    onItemDragLeave,
    onItemDrop,
    onItemDragEnd,
  } = props;
  const windowRange = useFolderVirtualWindow(rowsToRender.length, viewMode);
  const visibleRows = windowRange.enabled
    ? rowsToRender.slice(windowRange.start, windowRange.end)
    : rowsToRender;
  const listPadTop = windowRange.enabled ? windowRange.start * 44 : 0;
  const listPadBottom = windowRange.enabled
    ? Math.max(0, rowsToRender.length - windowRange.end) * 44
    : 0;

  // Per-card callback factories — kept out of inline JSX so complexity stays low.
  const buildRenameHandler = (item: Resource, isFolder: boolean) => (newTitle: string) => {
    void (isFolder ? handleSubfolderRename(item.id, newTitle) : handleRenameFile(item.id, newTitle));
  };
  const buildChangeColorHandler = (item: Resource, isFolder: boolean) =>
    isFolder
      ? (color: string) => {
          void handleSubfolderColor(item.id, color, item);
        }
      : undefined;
  const buildOpenInSplitHandler = (item: Resource, isFolder: boolean) =>
    !isFolder && canOpenInSplit ? () => handleOpenInSplit(item) : undefined;
  const buildOpenInWindowHandler = (item: Resource, isFolder: boolean) =>
    !isFolder
      ? () => {
          void handleOpenInWindow(item);
        }
      : undefined;
  const buildNewSubfolderHandler = (item: Resource, isFolder: boolean) =>
    isFolder ? () => handleNewSubfolder(item.id) : undefined;

  const itemDnD = (item: Resource) => ({
    dropActive: dropTargetId === item.id,
    dragging: Boolean(draggingIds?.includes(item.id)),
    renameArmed: renameArmedId === item.id,
    onPreview: onPreview ? () => onPreview(item) : undefined,
    onDragStart: onItemDragStart
      ? (e: React.DragEvent) => onItemDragStart(item, e)
      : undefined,
    onDragOver: onItemDragOver
      ? (e: React.DragEvent) => onItemDragOver(item, e)
      : undefined,
    onDragLeave: onItemDragLeave,
    onDrop: onItemDrop ? (e: React.DragEvent) => { void onItemDrop(item, e); } : undefined,
    onDragEnd: onItemDragEnd,
  });

  if (loadError) {
    return <FolderExplorerError message={loadError} onRetry={() => onRetry?.()} />;
  }

  if (showNoResults) {
    return (
      <p className="dome-folder-view__empty dome-folder-view__empty--search">
        {isTagFiltering
          ? t('folder.tagFilterEmpty', 'Ningún recurso con este tag')
          : t('folder.searchNoResults', { query: searchQuery.trim() })}
      </p>
    );
  }

  if (isEmpty && !isTagFiltering) {
    if (creatingFolder) {
      return (
        <div className="dome-folder-view__grid dome-folder-view__grid--empty-create">
          <div className="dome-folder-view__inline-create dome-folder-view__inline-create--grid">
            <NewFolderInline
              variant="grid"
              onConfirm={handleCreateFolder}
              onCancel={onCancelCreateFolder}
            />
          </div>
        </div>
      );
    }
    return (
      <FolderExplorerEmpty
        onImport={() => onImport?.()}
        onNewFolder={() => onNewFolder?.()}
        onNewNote={() => onNewNote?.()}
      />
    );
  }

  if (viewMode === 'list') {
    return (
      <div
        ref={windowRange.hostRef}
        className={cn(dropTargetId === null && 'dome-folder-view__list--drop-target')}
        onDragOver={(e) => onItemDragOver?.(null, e)}
        onDrop={(e) => {
          void onItemDrop?.(null, e);
        }}
      >
        <div className="dome-folder-view__list-header">
          <span className="dome-folder-view__list-header-name">
            {t('folder.colName', 'Nombre')}
            <span className="dome-folder-view__list-header-count">{statusLabel}</span>
          </span>
          <span className="dome-folder-view__col-modified">{t('folder.colModified', 'Modificado')}</span>
          <span aria-hidden />
        </div>

        {listPadTop > 0 ? <div style={{ height: listPadTop }} aria-hidden /> : null}
        {visibleRows.map(({ item, isFolder }, sliceIdx) => {
          const idx = windowRange.enabled ? windowRange.start + sliceIdx : sliceIdx;
          return (
          <FolderListRow
            key={item.id}
            item={item}
            isFolder={isFolder}
            isLast={idx === rowsToRender.length - 1 && !creatingFolder}
            rowRef={setRowRef(item.id)}
            onOpen={() => {
              if (isFolder) handleNavigateToFolder(item.id, item.title, getFolderColor(item));
              else
                openResourceTab(
                  item.id,
                  item.type,
                  item.title ?? t('folder.untitled'),
                  effectiveProjectId,
                );
            }}
            onDelete={() => setDeleteTarget(item)}
            onRename={buildRenameHandler(item, isFolder)}
            onChangeColor={buildChangeColorHandler(item, isFolder)}
            onMoveToProject={() => setMoveProjectIds([item.id])}
            onMoveToFolder={() => openFolderPickerFor(item.id)}
            onOpenInSplit={buildOpenInSplitHandler(item, isFolder)}
            onOpenInWindow={buildOpenInWindowHandler(item, isFolder)}
            onNewSubfolder={buildNewSubfolderHandler(item, isFolder)}
            selected={selectedIds.has(item.id) && selectedIds.size > 1}
            showSelectionChrome={showSelectionChrome}
            onToggleSelect={(e) => {
              toggleSelectId(item.id, e);
            }}
            searchQuery={isFiltering ? normalizedSearchQuery : undefined}
            searchFocused={isFiltering && idx === searchFocusIndex}
            {...itemDnD(item)}
          />
          );
        })}
        {listPadBottom > 0 ? <div style={{ height: listPadBottom }} aria-hidden /> : null}

        {creatingFolder ? (
          <div className="dome-folder-view__inline-create">
            <NewFolderInline
              variant="list"
              onConfirm={handleCreateFolder}
              onCancel={onCancelCreateFolder}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={windowRange.hostRef}
      className={cn(dropTargetId === null && 'dome-folder-view__list--drop-target')}
      onDragOver={(e) => onItemDragOver?.(null, e)}
      onDrop={(e) => {
        void onItemDrop?.(null, e);
      }}
    >
      <div className="dome-folder-view__grid-header">
        <span className="dome-folder-view__list-header-count">{statusLabel}</span>
      </div>
      <div className="dome-folder-view__grid">
        {visibleRows.map(({ item, isFolder }, sliceIdx) => {
          const idx = windowRange.enabled ? windowRange.start + sliceIdx : sliceIdx;
          return (
          <FolderCard
            key={item.id}
            item={item}
            isFolder={isFolder}
            isLast={idx === rowsToRender.length - 1 && !creatingFolder}
            cardRef={setRowRef(item.id)}
            onOpen={() => openListItem({ item, isFolder })}
            onDelete={() => setDeleteTarget(item)}
            onRename={buildRenameHandler(item, isFolder)}
            onChangeColor={buildChangeColorHandler(item, isFolder)}
            onMoveToProject={() => setMoveProjectIds([item.id])}
            onMoveToFolder={() => openFolderPickerFor(item.id)}
            onOpenInSplit={buildOpenInSplitHandler(item, isFolder)}
            onOpenInWindow={buildOpenInWindowHandler(item, isFolder)}
            onNewSubfolder={buildNewSubfolderHandler(item, isFolder)}
            selected={selectedIds.has(item.id) && selectedIds.size > 1}
            onToggleSelect={(e) => {
              toggleSelectId(item.id, e);
            }}
            searchQuery={isFiltering ? normalizedSearchQuery : undefined}
            searchFocused={isFiltering && idx === searchFocusIndex}
            childCount={isFolder ? (childCountByFolder?.get(item.id) ?? 0) : 0}
            {...itemDnD(item)}
          />
          );
        })}
        {creatingFolder ? (
          <div className="dome-folder-view__inline-create dome-folder-view__inline-create--grid">
            <NewFolderInline
              variant="grid"
              onConfirm={handleCreateFolder}
              onCancel={onCancelCreateFolder}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
