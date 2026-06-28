'use client';

import { useMemo, useRef } from 'react';
import { Plus, Workflow, FolderPlus, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CanvasWorkflow } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useHubWorkspace } from '@/lib/context/HubWorkspaceContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
import HubSearchField from '@/components/ui/HubSearchField';
import HubListState from '@/components/ui/HubListState';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeButton from '@/components/ui/DomeButton';
import { useEditorialHub } from '@/lib/context/EditorialHubContext';
import { useWorkflowLibrary } from './useWorkflowLibrary';
import WorkflowLibraryCard from './WorkflowLibraryCard';
import WorkflowLibraryFolderTree from './WorkflowLibraryFolderTree';
import { childFolders } from '@/lib/agent-canvas/workflow-library-folders';
import {
  DND_WORKFLOW_MIME,
  folderByIdMap,
  folderVisibleInSearch,
  wfVisibleInSearch,
} from './workflow-library-utils';

interface WorkflowLibraryViewProps {
  onShowAutomations?: (workflowId: string, workflowLabel: string) => void;
}

export default function WorkflowLibraryView({ onShowAutomations }: WorkflowLibraryViewProps) {
  const { t } = useTranslation();
  const editorialHub = useEditorialHub();
  const hubCardVariant: 'editorial' | 'card' = editorialHub ? 'editorial' : 'card';
  const hubListClass = editorialHub
    ? 'hub-list-stack w-full max-w-full'
    : 'flex w-full max-w-full flex-col gap-3';
  const workflowImportInputRef = useRef<HTMLInputElement>(null);

  const loadWorkflow = useCanvasStore((s) => s.loadWorkflow);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const hubWorkspace = useHubWorkspace();
  const hubProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const {
    state,
    loading,
    setSearch,
    toggleExpand,
    setDragOverFolderId,
    setDeleteFolderTarget,
    handleExportWorkflow,
    handleWorkflowImportFile,
    handleDelete,
    moveWorkflowToFolder,
    handleNewRootFolder,
    handleNewChildFolder,
    confirmDeleteFolder,
    renameFolder,
  } = useWorkflowLibrary(hubProjectId, t);

  const { workflows, folders, search, expanded, dragOverFolderId, deleteFolderTarget, importingBundle, deletingId } =
    state;

  const folderMap = useMemo(() => folderByIdMap(folders), [folders]);
  const q = search.trim().toLowerCase();

  const visibleWorkflows = useMemo(() => {
    if (!q) return workflows;
    return workflows.filter((w) => wfVisibleInSearch(w, q, folderMap));
  }, [workflows, q, folderMap]);

  const visibleFolders = useMemo(() => {
    if (!q) return folders;
    return folders.filter((f) => folderVisibleInSearch(f, q, folders, workflows, folderMap));
  }, [folders, q, workflows, folderMap]);

  const rootWorkflows = useMemo(
    () => visibleWorkflows.filter((w) => !w.folderId),
    [visibleWorkflows],
  );

  const handleOpen = (workflow: CanvasWorkflow) => {
    loadWorkflow(workflow);
    if (hubWorkspace) {
      hubWorkspace.openWorkflowCanvas(workflow.id);
    } else {
      setHomeSidebarSection(`workflow:${workflow.id}`);
    }
  };

  const handleNew = () => {
    clearCanvas();
    if (hubWorkspace) {
      hubWorkspace.openNewWorkflowCanvas();
    } else {
      setHomeSidebarSection('workflow:new');
    }
  };

  const rootDrop = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_WORKFLOW_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId('root');
    },
    onDragLeave: () => setDragOverFolderId(dragOverFolderId === 'root' ? null : dragOverFolderId),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DND_WORKFLOW_MIME);
      setDragOverFolderId(null);
      if (id) void moveWorkflowToFolder(id, null);
    },
  };

  const folderTreeProps = {
    folders,
    visibleFolders,
    visibleWorkflows,
    expanded,
    dragOverFolderId,
    hubCardVariant,
    hubListClass,
    deletingId,
    onToggleExpand: toggleExpand,
    onSetDragOver: setDragOverFolderId,
    onMoveWorkflow: moveWorkflowToFolder,
    onNewChildFolder: handleNewChildFolder,
    onRenameFolder: renameFolder,
    onDeleteFolderTarget: setDeleteFolderTarget,
    onOpenWorkflow: handleOpen,
    onExportWorkflow: handleExportWorkflow,
    onDeleteWorkflow: handleDelete,
    onShowAutomations,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <input
        ref={workflowImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label={t('canvas.import_workflow_json', 'Import workflow JSON file')}
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = '';
          if (file) void handleWorkflowImportFile(file);
        }}
      />
      <HubToolbar dense>
        {!editorialHub ? (
          <HubToolbar.Leading>
            <HubTitleBlock
              icon={Workflow}
              title={t('canvas.workflow_library')}
              subtitle={t('canvas.workflows_saved_count', { count: workflows.length })}
            />
          </HubToolbar.Leading>
        ) : null}
        <HubToolbar.Center>
          <HubSearchField
            value={search}
            onChange={setSearch}
            placeholder={t('canvas.search_workflows_placeholder')}
            ariaLabel={t('canvas.search_workflows_placeholder')}
          />
        </HubToolbar.Center>
        <HubToolbar.Trailing>
          <>
            <DomeButton
              type="button"
              variant="outline"
              size="xs"
              disabled={importingBundle}
              onClick={() => workflowImportInputRef.current?.click()}
              leftIcon={<Upload className="size-3" aria-hidden />}
            >
              {t('hubExport.import_workflow')}
            </DomeButton>
            <DomeButton
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void handleNewRootFolder()}
              leftIcon={<FolderPlus className="size-3" aria-hidden />}
            >
              {t('filter.new_folder')}
            </DomeButton>
            <DomeButton
              type="button"
              variant="primary"
              size="xs"
              onClick={handleNew}
              className="!bg-[var(--dome-accent)] !text-white border-transparent hover:opacity-90"
              leftIcon={<Plus className="size-3" aria-hidden />}
            >
              {t('canvas.new_workflow')}
            </DomeButton>
          </>
        </HubToolbar.Trailing>
      </HubToolbar>

      <div
        className="flex-1 overflow-y-auto p-4"
        {...rootDrop}
        style={{
          outline: dragOverFolderId === 'root' ? '2px dashed var(--dome-accent)' : undefined,
          outlineOffset: -4,
        }}
      >
        {dragOverFolderId === 'root' ? (
          <p className="text-xs mb-3 font-medium" style={{ color: 'var(--dome-accent)' }}>
            {t('canvas.move_workflow_root')}
          </p>
        ) : null}
        {loading ? (
          <DomeSkeletonGrid count={10} className="animate-in fade-in duration-150 motion-reduce:animate-none" />
        ) : workflows.length === 0 ? (
          <HubListState
            variant="empty"
            icon={<Workflow className="size-7" style={{ color: 'var(--dome-accent)' }} />}
            title={t('canvas.no_workflows_saved_title')}
            description={t('canvas.no_workflows_saved_desc')}
            action={
              <DomeButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleNew}
                className="mt-1 !bg-[var(--dome-accent)]"
                leftIcon={<Plus className="size-3.5" aria-hidden />}
              >
                {t('canvas.create_first_workflow')}
              </DomeButton>
            }
          />
        ) : (
          <div className="flex flex-col gap-4 animate-in fade-in duration-150 motion-reduce:animate-none">
            <WorkflowLibraryFolderTree {...folderTreeProps} />
            {rootWorkflows.length > 0 ? (
              <div>
                {childFolders(visibleFolders, null).length > 0 ? (
                  <p
                    className="text-xs font-semibold mb-2 uppercase tracking-wide"
                    style={{ color: 'var(--dome-text-muted)' }}
                  >
                    {t('canvas.ungrouped_workflows')}
                  </p>
                ) : null}
                <div className={hubListClass}>
                  {rootWorkflows.map((wf) => (
                    <WorkflowLibraryCard
                      key={wf.id}
                      wf={wf}
                      hubCardVariant={hubCardVariant}
                      deletingId={deletingId}
                      onOpen={handleOpen}
                      onExport={handleExportWorkflow}
                      onDelete={handleDelete}
                      onShowAutomations={onShowAutomations}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {q && visibleWorkflows.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--dome-text-muted)' }}>
                {t('canvas.no_workflow_search_results')}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteFolderTarget}
        title={t('canvas.delete_workflow_folder')}
        message={
          deleteFolderTarget
            ? t('canvas.delete_workflow_folder_confirm', { name: deleteFolderTarget.name })
            : ''
        }
        variant="danger"
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDeleteFolder()}
        onCancel={() => setDeleteFolderTarget(null)}
      />
    </div>
  );
}
