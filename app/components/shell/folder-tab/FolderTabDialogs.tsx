/** Modals owned by FolderTabView (extracted for Sonar S3776). */

import type { Resource } from '@/lib/hooks/useResources';
import MoveToProjectModal from '@/components/workspace/MoveToProjectModal';
import MoveFolderModal from '@/components/workspace/MoveFolderModal';
import {
  BulkDeleteConfirmModal,
  DeleteConfirmModal,
  UrlInputModal,
} from '@/components/workspace/sidebar/SidebarModals';
import { filterMoveProjectRoots } from '@/lib/workspace/filterMoveProjectRoots';

export interface FolderTabDialogsProps {
  folderPickOpen: boolean;
  onCloseFolderPick: () => void;
  folderMoveIds: string[] | null;
  selectedIds: Set<string>;
  resourceMapForSelection: Map<string, Resource>;
  allFolders: Resource[];
  effectiveProjectId: string;
  listFolderId: string | null;
  onConfirmBulkMove: (targetFolderId: string | null) => void | Promise<void>;
  moveProjectIds: string[];
  onCloseMoveProject: () => void;
  onMoveProjectCompleted: () => void;
  deleteTarget: Resource | null;
  onConfirmDelete: () => void;
  onCloseDelete: () => void;
  bulkDeleteOpen: boolean;
  bulkDeleting: boolean;
  onConfirmBulkDelete: () => void;
  onCloseBulkDelete: () => void;
  urlModalOpen: boolean;
  onConfirmUrl: (url: string) => void;
  onCloseUrl: () => void;
}

export default function FolderTabDialogs(props: FolderTabDialogsProps) {
  const {
    folderPickOpen,
    onCloseFolderPick,
    folderMoveIds,
    selectedIds,
    resourceMapForSelection,
    allFolders,
    effectiveProjectId,
    listFolderId,
    onConfirmBulkMove,
    moveProjectIds,
    onCloseMoveProject,
    onMoveProjectCompleted,
    deleteTarget,
    onConfirmDelete,
    onCloseDelete,
    bulkDeleteOpen,
    bulkDeleting,
    onConfirmBulkDelete,
    onCloseBulkDelete,
    urlModalOpen,
    onConfirmUrl,
    onCloseUrl,
  } = props;

  return (
    <>
      <MoveFolderModal
        open={folderPickOpen}
        onClose={onCloseFolderPick}
        resourceIds={folderMoveIds ?? filterMoveProjectRoots(selectedIds, resourceMapForSelection)}
        allFolders={allFolders}
        projectId={effectiveProjectId}
        currentFolderId={listFolderId}
        onConfirm={onConfirmBulkMove}
      />

      <MoveToProjectModal
        opened={moveProjectIds.length > 0}
        onClose={onCloseMoveProject}
        resourceIds={moveProjectIds}
        resourcesById={resourceMapForSelection}
        onCompleted={onMoveProjectCompleted}
      />

      {deleteTarget ? (
        <DeleteConfirmModal
          resource={deleteTarget}
          onConfirm={onConfirmDelete}
          onClose={onCloseDelete}
        />
      ) : null}

      {bulkDeleteOpen ? (
        <BulkDeleteConfirmModal
          count={selectedIds.size}
          busy={bulkDeleting}
          onConfirm={onConfirmBulkDelete}
          onClose={onCloseBulkDelete}
        />
      ) : null}

      {urlModalOpen ? (
        <UrlInputModal onConfirm={onConfirmUrl} onClose={onCloseUrl} />
      ) : null}
    </>
  );
}
