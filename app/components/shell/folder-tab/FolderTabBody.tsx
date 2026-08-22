/** Folder tab list/grid body (extracted from FolderTabView for Sonar S3776). */

import { useTranslation } from 'react-i18next';
import type { Resource } from '@/lib/hooks/useResources';
import { getFolderColor } from './folderTabShared';
import FolderListRow from './FolderListRow';
import FolderCard from './FolderCard';
import NewFolderInline from './NewFolderInline';
import type { FolderListEntry, FolderViewMode } from './folderTabViewHelpers';

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
  toggleSelectId: (id: string) => void;
  handleCreateFolder: (name: string) => void | Promise<void>;
  onCancelCreateFolder: () => void;
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
  } = props;

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
    return <p className="dome-folder-view__empty">{t('folder.emptyFolderShort', 'Carpeta vacía')}</p>;
  }

  if (viewMode === 'list') {
    return (
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
              onCancel={onCancelCreateFolder}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
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
              onCancel={onCancelCreateFolder}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
