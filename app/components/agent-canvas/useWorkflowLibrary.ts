import { useCallback, useReducer } from 'react';
import type { CanvasWorkflow } from '@/types/canvas';
import type { DomeWorkflowFolder } from '@/types';
import {
  getWorkflows,
  deleteWorkflow,
  updateWorkflow,
  listWorkflowFolders,
  createWorkflowFolderRecord,
  updateWorkflowFolderRecord,
  deleteWorkflowFolderRecord,
} from '@/lib/agent-canvas/api';
import { syncMarketplaceOnWorkflowDelete } from '@/lib/marketplace/api';
import { useHubListLoader } from '@/lib/hub/useHubListLoader';
import { HUB_WORKFLOWS_CHANGED, notifyHubAgentsChanged, notifyHubWorkflowsChanged } from '@/lib/hub/hubEvents';
import { showToast } from '@/lib/store/useToastStore';
import { showPrompt } from '@/lib/store/usePromptStore';
import {
  exportWorkflowBundle,
  downloadHubBundle,
  slugExportFilenamePart,
  parseHubExportBundle,
  importWorkflowBundleOnly,
} from '@/lib/hub-export/bundle';
import {
  initialWorkflowLibraryState,
  workflowLibraryReducer,
} from './workflowLibraryReducer';

export function useWorkflowLibrary(hubProjectId: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const [state, dispatch] = useReducer(workflowLibraryReducer, initialWorkflowLibraryState);

  const fetchListData = useCallback(async () => {
    const [wfs, fds] = await Promise.all([getWorkflows(hubProjectId), listWorkflowFolders(hubProjectId)]);
    dispatch({
      type: 'SET_LIST',
      workflows: wfs.sort((a, b) => b.updatedAt - a.updatedAt),
      folders: fds,
    });
  }, [hubProjectId]);

  const { initialLoading: loading, reload: refresh } = useHubListLoader(
    fetchListData,
    [hubProjectId],
    { eventName: HUB_WORKFLOWS_CHANGED },
  );

  const setSearch = useCallback((search: string) => {
    dispatch({ type: 'SET_SEARCH', search });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_EXPAND', id });
  }, []);

  const setDragOverFolderId = useCallback((id: string | 'root' | null) => {
    dispatch({ type: 'SET_DRAG_OVER', id });
  }, []);

  const setDeleteFolderTarget = useCallback((folder: DomeWorkflowFolder | null) => {
    dispatch({ type: 'SET_DELETE_FOLDER_TARGET', folder });
  }, []);

  const handleExportWorkflow = useCallback(
    async (wf: CanvasWorkflow) => {
      const built = await exportWorkflowBundle(wf.id, { title: wf.name });
      if (!built.success) {
        showToast('error', built.error ?? t('hubExport.error_export'));
        return;
      }
      const name = `dome-workflow-${slugExportFilenamePart(wf.name)}-${new Date().toISOString().slice(0, 10)}.json`;
      downloadHubBundle(name, built.bundle);
      showToast('success', t('hubExport.export_done'));
    },
    [t],
  );

  const handleWorkflowImportFile = useCallback(
    async (file: File) => {
      dispatch({ type: 'SET_IMPORTING', importing: true });
      try {
        const text = await file.text();
        const parsed = parseHubExportBundle(text);
        if (!parsed.success) {
          showToast('error', parsed.error ?? t('hubExport.invalid_bundle'));
          return;
        }
        const result = await importWorkflowBundleOnly(parsed.data, hubProjectId);
        if (!result.success) {
          showToast('error', result.error ?? t('hubExport.error_import'));
          return;
        }
        showToast(
          'success',
          t('hubExport.import_done_workflow', {
            workflows: result.summary.workflowsCreated,
            agents: result.summary.agentsCreated,
          }),
        );
        await refresh();
        notifyHubAgentsChanged();
        notifyHubWorkflowsChanged();
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : t('hubExport.error_import'));
      } finally {
        dispatch({ type: 'SET_IMPORTING', importing: false });
      }
    },
    [hubProjectId, refresh, t],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      dispatch({ type: 'SET_DELETING', id });
      const result = await deleteWorkflow(id);
      if (result.success) {
        await syncMarketplaceOnWorkflowDelete(id);
        dispatch({ type: 'REMOVE_WORKFLOW', id });
        showToast('success', t('toast.workflow_deleted'));
        notifyHubWorkflowsChanged();
      } else {
        showToast('error', result.error ?? t('toast.workflow_delete_error'));
      }
      dispatch({ type: 'SET_DELETING', id: null });
    },
    [t],
  );

  const moveWorkflowToFolder = useCallback(
    async (workflowId: string, folderId: string | null) => {
      const result = await updateWorkflow(workflowId, { folderId: folderId ?? undefined });
      if (result.success && result.data) {
        dispatch({ type: 'UPDATE_WORKFLOW', workflow: result.data });
        showToast('success', t('canvas.workflow_moved'));
        notifyHubWorkflowsChanged();
      } else {
        showToast('error', result.error ?? t('toast.workflow_delete_error'));
      }
    },
    [t],
  );

  const handleNewRootFolder = useCallback(async () => {
    const name = await showPrompt(t('canvas.new_workflow_folder_name'), t('filter.new_folder'));
    if (name === null) return;
    const result = await createWorkflowFolderRecord(name || t('filter.new_folder'), null, hubProjectId);
    if (result.success && result.data) {
      dispatch({ type: 'ADD_FOLDER', folder: result.data });
      showToast('success', t('canvas.workflow_folder_created'));
      notifyHubWorkflowsChanged();
    }
  }, [hubProjectId, t]);

  const handleNewChildFolder = useCallback(
    async (parentId: string) => {
      const name = await showPrompt(t('canvas.new_workflow_folder_name'), t('filter.new_folder'));
      if (name === null) return;
      const result = await createWorkflowFolderRecord(name || t('filter.new_folder'), parentId, hubProjectId);
      if (result.success && result.data) {
        dispatch({ type: 'ADD_FOLDER', folder: result.data });
        showToast('success', t('canvas.workflow_folder_created'));
        notifyHubWorkflowsChanged();
      }
    },
    [hubProjectId, t],
  );

  const confirmDeleteFolder = useCallback(async () => {
    if (!state.deleteFolderTarget) return;
    const result = await deleteWorkflowFolderRecord(state.deleteFolderTarget.id);
    if (result.success) {
      dispatch({ type: 'SET_DELETE_FOLDER_TARGET', folder: null });
      showToast('success', t('canvas.workflow_folder_deleted'));
      await refresh();
      notifyHubWorkflowsChanged();
    } else {
      showToast('error', result.error ?? t('toast.workflow_delete_error'));
    }
  }, [state.deleteFolderTarget, refresh, t]);

  const renameFolder = useCallback(
    async (folder: DomeWorkflowFolder) => {
      const name = await showPrompt(t('canvas.rename_workflow_folder'), folder.name);
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const result = await updateWorkflowFolderRecord(folder.id, { name: trimmed });
      if (result.success) {
        dispatch({ type: 'UPDATE_FOLDER_NAME', id: folder.id, name: trimmed });
        showToast('success', t('canvas.workflow_folder_renamed'));
        notifyHubWorkflowsChanged();
      }
    },
    [t],
  );

  return {
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
  };
}
