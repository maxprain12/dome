'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FolderOpen,
  Trash2,
  Clock,
  Plus,
  Workflow,
  Zap,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  MoreHorizontal,
  Download,
  Upload,
} from 'lucide-react';
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
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
import HubSearchField from '@/components/ui/HubSearchField';
import HubListState from '@/components/ui/HubListState';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeButton from '@/components/ui/DomeButton';
import DomeContextMenu from '@/components/ui/DomeContextMenu';
import HubBentoCard from '@/components/ui/HubBentoCard';
import {
  exportWorkflowBundle,
  downloadHubBundle,
  slugExportFilenamePart,
  parseHubExportBundle,
  importWorkflowBundleOnly,
} from '@/lib/hub-export/bundle';

const DND_WORKFLOW_MIME = 'application/x-dome-workflow-id';

interface WorkflowLibraryViewProps {
  onShowAutomations?: (workflowId: string, workflowLabel: string) => void;
}

function folderByIdMap(folders: DomeWorkflowFolder[]): Map<string, DomeWorkflowFolder> {
  const m = new Map<string, DomeWorkflowFolder>();
  for (const f of folders) m.set(f.id, f);
  return m;
}

function wfMatchesSearch(wf: CanvasWorkflow, q: string): boolean {
  if (!q) return true;
  const n = wf.name.toLowerCase();
  const d = (wf.description || '').toLowerCase();
  return n.includes(q) || d.includes(q);
}

function folderNameMatches(folder: DomeWorkflowFolder, q: string): boolean {
  if (!q) return true;
  return folder.name.toLowerCase().includes(q);
}

function wfVisibleInSearch(
  wf: CanvasWorkflow,
  q: string,
  map: Map<string, DomeWorkflowFolder>,
): boolean {
  if (!q) return true;
  if (wfMatchesSearch(wf, q)) return true;
  let cur = wf.folderId ?? null;
  while (cur) {
    const f = map.get(cur);
    if (!f) break;
    if (folderNameMatches(f, q)) return true;
    cur = f.parentId;
  }
  return false;
}

function folderVisibleInSearch(
  folder: DomeWorkflowFolder,
  q: string,
  allFolders: DomeWorkflowFolder[],
  workflows: CanvasWorkflow[],
  map: Map<string, DomeWorkflowFolder>,
): boolean {
  if (!q) return true;
  if (folderNameMatches(folder, q)) return true;
  if (workflows.some((w) => w.folderId === folder.id && wfVisibleInSearch(w, q, map))) return true;
  return allFolders
    .filter((c) => c.parentId === folder.id)
    .some((c) => folderVisibleInSearch(c, q, allFolders, workflows, map));
}

export default function WorkflowLibraryView({ onShowAutomations }: WorkflowLibraryViewProps) {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);
  const [folders, setFolders] = useState<DomeWorkflowFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | 'root' | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<DomeWorkflowFolder | null>(null);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [importingBundle, setImportingBundle] = useState(false);
  const workflowImportInputRef = useRef<HTMLInputElement>(null);

  const loadWorkflow = useCanvasStore((s) => s.loadWorkflow);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const hubProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const folderMap = useMemo(() => folderByIdMap(folders), [folders]);
  const q = search.trim().toLowerCase();

  const refresh = useCallback(async () => {
    setLoading(true);
    const [wfs, fds] = await Promise.all([getWorkflows(hubProjectId), listWorkflowFolders(hubProjectId)]);
    setWorkflows(wfs.sort((a, b) => b.updatedAt - a.updatedAt));
    setFolders(fds);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const f of fds) next.add(f.id);
      return next;
    });
    setLoading(false);
  }, [hubProjectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener('dome:workflows-changed', handler);
    return () => window.removeEventListener('dome:workflows-changed', handler);
  }, [refresh]);

  const visibleWorkflows = useMemo(() => {
    if (!q) return workflows;
    return workflows.filter((w) => wfVisibleInSearch(w, q, folderMap));
  }, [workflows, q, folderMap]);

  const visibleFolders = useMemo(() => {
    if (!q) return folders;
    return folders.filter((f) => folderVisibleInSearch(f, q, folders, workflows, folderMap));
  }, [folders, q, workflows, folderMap]);

  const childFolders = useCallback(
    (parentId: string | null) =>
      visibleFolders
        .filter((f) => (f.parentId ?? null) === parentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [visibleFolders],
  );

  const workflowsInFolder = useCallback(
    (folderId: string) =>
      visibleWorkflows.filter((w) => w.folderId === folderId).sort((a, b) => b.updatedAt - a.updatedAt),
    [visibleWorkflows],
  );

  const rootWorkflows = useMemo(
    () => visibleWorkflows.filter((w) => !w.folderId),
    [visibleWorkflows],
  );

  const handleOpen = (workflow: CanvasWorkflow) => {
    loadWorkflow(workflow);
    setHomeSidebarSection(`workflow:${workflow.id}`);
  };

  const handleNew = () => {
    clearCanvas();
    setHomeSidebarSection('workflow:new');
  };

  const handleExportWorkflow = async (wf: CanvasWorkflow) => {
    const built = await exportWorkflowBundle(wf.id, { title: wf.name });
    if (!built.success) {
      showToast('error', built.error ?? t('hubExport.error_export'));
      return;
    }
    const name = `dome-workflow-${slugExportFilenamePart(wf.name)}-${new Date().toISOString().slice(0, 10)}.json`;
    downloadHubBundle(name, built.bundle);
    showToast('success', t('hubExport.export_done'));
  };

  const handlePickWorkflowImport = () => workflowImportInputRef.current?.click();

  const handleWorkflowImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingBundle(true);
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
      window.dispatchEvent(new CustomEvent('dome:agents-changed'));
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('hubExport.error_import'));
    } finally {
      setImportingBundle(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const result = await deleteWorkflow(id);
    if (result.success) {
      await syncMarketplaceOnWorkflowDelete(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      showToast('success', t('toast.workflow_deleted'));
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
    } else {
      showToast('error', result.error ?? t('toast.workflow_delete_error'));
    }
    setDeletingId(null);
  };

  const moveWorkflowToFolder = async (workflowId: string, folderId: string | null) => {
    const result = await updateWorkflow(workflowId, { folderId: folderId ?? undefined });
    if (result.success && result.data) {
      setWorkflows((prev) => prev.map((w) => (w.id === workflowId ? result.data! : w)));
      showToast('success', t('canvas.workflow_moved'));
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
    } else {
      showToast('error', result.error ?? t('toast.workflow_delete_error'));
    }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(getDateTimeLocaleTag(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNewRootFolder = async () => {
    const name = window.prompt(t('canvas.new_workflow_folder_name'), t('filter.new_folder'));
    if (name === null) return;
    const result = await createWorkflowFolderRecord(name || t('filter.new_folder'), null, hubProjectId);
    if (result.success && result.data) {
      setFolders((prev) => [...prev, result.data!]);
      setExpanded((p) => new Set(p).add(result.data!.id));
      showToast('success', t('canvas.workflow_folder_created'));
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
    }
  };

  const handleNewChildFolder = async (parentId: string) => {
    const name = window.prompt(t('canvas.new_workflow_folder_name'), t('filter.new_folder'));
    if (name === null) return;
    const result = await createWorkflowFolderRecord(name || t('filter.new_folder'), parentId, hubProjectId);
    if (result.success && result.data) {
      setFolders((prev) => [...prev, result.data!]);
      setExpanded((p) => new Set(p).add(result.data!.id));
      showToast('success', t('canvas.workflow_folder_created'));
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
    }
    setMenuFolderId(null);
  };

  const confirmDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    const result = await deleteWorkflowFolderRecord(deleteFolderTarget.id);
    if (result.success) {
      setDeleteFolderTarget(null);
      showToast('success', t('canvas.workflow_folder_deleted'));
      await refresh();
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
    } else {
      showToast('error', result.error ?? t('toast.workflow_delete_error'));
    }
  };

  const renderWorkflowRow = (wf: CanvasWorkflow) => {
    const desc = (wf.description || '').trim();
    const graphSummary = t('canvas.nodes_edges_summary', { nodes: wf.nodes.length, edges: wf.edges.length });

    return (
      <HubBentoCard
        key={wf.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_WORKFLOW_MIME, wf.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => handleOpen(wf)}
        icon={
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <Workflow className="w-5 h-5" style={{ color: 'var(--dome-accent)' }} aria-hidden />
          </div>
        }
        title={
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--dome-text)' }}>
            {wf.name}
          </span>
        }
        subtitle={
          <span className="line-clamp-2" title={desc || undefined}>
            {desc || graphSummary}
          </span>
        }
        meta={
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            {desc ? <span>{graphSummary}</span> : null}
            <span className="inline-flex items-center gap-1 shrink-0">
              {desc ? <span aria-hidden>·</span> : null}
              <Clock className="w-3 h-3 shrink-0" aria-hidden />
              {formatDate(wf.updatedAt)}
            </span>
          </div>
        }
        trailing={
          <DomeContextMenu
            align="end"
            trigger={
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-[var(--dome-bg)] transition-colors"
                title={t('ui.options')}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
              </button>
            }
            items={[
              ...(onShowAutomations
                ? [
                    {
                      label: t('agents.automations'),
                      icon: <Zap className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />,
                      onClick: () => onShowAutomations(wf.id, wf.name),
                    },
                  ]
                : []),
              {
                label: t('hubExport.title_export_workflow'),
                icon: <Download className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />,
                onClick: () => void handleExportWorkflow(wf),
              },
              {
                separator: true,
                label: t('common.delete'),
                icon: <Trash2 className="w-4 h-4" />,
                variant: 'danger' as const,
                disabled: deletingId === wf.id,
                onClick: () => void handleDelete(wf.id),
              },
            ]}
          />
        }
      />
    );
  };

  const renderFolder = (folder: DomeWorkflowFolder, depth: number): React.ReactNode => {
    const isOpen = expanded.has(folder.id);
    const kids = childFolders(folder.id);
    const wfs = workflowsInFolder(folder.id);
    const pad = Math.min(depth * 12, 48);

    const onDragOverRow = (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_WORKFLOW_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId(folder.id);
    };

    const onDropRow = (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DND_WORKFLOW_MIME);
      setDragOverFolderId(null);
      if (id) void moveWorkflowToFolder(id, folder.id);
    };

    return (
      <div key={folder.id} className="flex flex-col gap-2">
        <div
          className="flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors"
          style={{
            marginLeft: pad,
            borderColor: dragOverFolderId === folder.id ? 'var(--dome-accent)' : 'var(--dome-border)',
            background:
              dragOverFolderId === folder.id ? 'var(--dome-accent-bg)' : 'var(--dome-surface)',
          }}
          onDragOver={onDragOverRow}
          onDragLeave={() => setDragOverFolderId((cur) => (cur === folder.id ? null : cur))}
          onDrop={onDropRow}
        >
          <button
            type="button"
            onClick={() => toggleExpand(folder.id)}
            className="p-1 rounded-lg hover:bg-[var(--dome-bg)] shrink-0"
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            ) : (
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            )}
          </button>
          <FolderOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--dome-accent)' }} />
          <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
            {folder.name}
          </span>
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleNewChildFolder(folder.id)}
              className="p-1.5 rounded-lg hover:bg-[var(--dome-bg)]"
              title={t('filter.new_folder')}
            >
              <FolderPlus className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            </button>
            <button
              type="button"
              onClick={() => setMenuFolderId((m) => (m === folder.id ? null : folder.id))}
              className="p-1.5 rounded-lg hover:bg-[var(--dome-bg)]"
              title={t('canvas.workflow_folder_actions')}
            >
              <MoreHorizontal className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            </button>
            {menuFolderId === folder.id ? (
              <div
                className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-lg border py-1 shadow-lg"
                style={{
                  background: 'var(--dome-surface)',
                  borderColor: 'var(--dome-border)',
                }}
              >
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--dome-bg)]"
                  style={{ color: 'var(--dome-text)' }}
                  onClick={() => {
                    setMenuFolderId(null);
                    const name = window.prompt(t('canvas.rename_workflow_folder'), folder.name);
                    if (name === null) return;
                    const trimmed = name.trim();
                    if (!trimmed) return;
                    void (async () => {
                      const result = await updateWorkflowFolderRecord(folder.id, { name: trimmed });
                      if (result.success) {
                        setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: trimmed } : f)));
                        showToast('success', t('canvas.workflow_folder_renamed'));
                        window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
                      }
                    })();
                  }}
                >
                  {t('canvas.rename_workflow_folder')}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--error-bg)]"
                  style={{ color: 'var(--error)' }}
                  onClick={() => {
                    setDeleteFolderTarget(folder);
                    setMenuFolderId(null);
                  }}
                >
                  {t('canvas.delete_workflow_folder')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {isOpen ? (
          <div className="flex flex-col gap-2">
            {kids.map((k) => renderFolder(k, depth + 1))}
            {wfs.length > 0 ? (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                style={{ marginLeft: pad + 8 }}
              >
                {wfs.map((wf) => renderWorkflowRow(wf))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const rootDrop = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_WORKFLOW_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverFolderId('root');
    },
    onDragLeave: () => setDragOverFolderId((cur) => (cur === 'root' ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DND_WORKFLOW_MIME);
      setDragOverFolderId(null);
      if (id) void moveWorkflowToFolder(id, null);
    },
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <input
        ref={workflowImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(ev) => void handleWorkflowImportFile(ev)}
      />
      <HubToolbar
        dense
        leading={
          <HubTitleBlock
            icon={Workflow}
            title={t('canvas.workflow_library')}
            subtitle={t('canvas.workflows_saved_count', { count: workflows.length })}
          />
        }
        center={
          <HubSearchField
            value={search}
            onChange={setSearch}
            placeholder={t('canvas.search_workflows_placeholder')}
            ariaLabel={t('canvas.search_workflows_placeholder')}
          />
        }
        trailing={
          <>
            <DomeButton
              type="button"
              variant="outline"
              size="xs"
              disabled={importingBundle}
              onClick={() => handlePickWorkflowImport()}
              leftIcon={<Upload className="w-3 h-3" aria-hidden />}
            >
              {t('hubExport.import_workflow')}
            </DomeButton>
            <DomeButton
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void handleNewRootFolder()}
              leftIcon={<FolderPlus className="w-3 h-3" aria-hidden />}
            >
              {t('filter.new_folder')}
            </DomeButton>
            <DomeButton
              type="button"
              variant="primary"
              size="xs"
              onClick={handleNew}
              className="!bg-[var(--dome-accent)] !text-white border-transparent hover:opacity-90"
              leftIcon={<Plus className="w-3 h-3" aria-hidden />}
            >
              {t('canvas.new_workflow')}
            </DomeButton>
          </>
        }
      />

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
          <DomeSkeletonGrid
            count={10}
            className="animate-in fade-in duration-150 motion-reduce:animate-none"
          />
        ) : workflows.length === 0 ? (
          <HubListState
            variant="empty"
            icon={<Workflow className="w-7 h-7" style={{ color: 'var(--dome-accent)' }} />}
            title={t('canvas.no_workflows_saved_title')}
            description={t('canvas.no_workflows_saved_desc')}
            action={
              <DomeButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleNew}
                className="mt-1 !bg-[var(--dome-accent)]"
                leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden />}
              >
                {t('canvas.create_first_workflow')}
              </DomeButton>
            }
          />
        ) : (
          <div className="flex flex-col gap-4 animate-in fade-in duration-150 motion-reduce:animate-none">
            {childFolders(null).map((f) => renderFolder(f, 0))}
            {rootWorkflows.length > 0 ? (
              <div>
                {childFolders(null).length > 0 ? (
                  <p
                    className="text-xs font-semibold mb-2 uppercase tracking-wide"
                    style={{ color: 'var(--dome-text-muted)' }}
                  >
                    {t('canvas.ungrouped_workflows')}
                  </p>
                ) : null}
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                  {rootWorkflows.map((wf) => renderWorkflowRow(wf))}
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
