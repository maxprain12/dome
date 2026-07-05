import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Download,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Workflow,
  Zap,
} from 'lucide-react';
import type { CanvasWorkflow } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { listAutomations, listRuns } from '@/lib/automations/api';
import { HubWorkspaceProvider, type HubWorkspaceContextValue } from '@/lib/context/HubWorkspaceContext';
import { PENDING_AUTOMATIONS_FILTER_KEY } from '@/lib/hub/hubStorageKeys';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import AgentCanvasView from '@/components/agent-canvas/AgentCanvasView';
import { useWorkflowLibrary } from '@/components/agent-canvas/useWorkflowLibrary';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import DomeButton from '@/components/ui/DomeButton';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import HubSearchField from '@/components/ui/HubSearchField';
import OrchestrationShell, { type OrchestrationStat } from './OrchestrationShell';
import { useHubListLoader } from '@/lib/hub/useHubListLoader';
import { HUB_RUNS_CHANGED } from '@/lib/hub/hubEvents';

function isToday(ts: number | null | undefined): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(getDateTimeLocaleTag(), { day: '2-digit', month: 'short' });
}

/** Workflows section — redesigned library with live KPIs; the canvas opens in-tab. */
export default function WorkflowsStudioView() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const { openAutomationsTab } = useTabStore();
  const loadWorkflowIntoCanvas = useCanvasStore((s) => s.loadWorkflow);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);

  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [runsToday, setRunsToday] = useState<number | null>(null);
  const [activeAutomations, setActiveAutomations] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const {
    state,
    loading,
    setSearch,
    handleExportWorkflow,
    handleWorkflowImportFile,
    handleDelete,
  } = useWorkflowLibrary(projectId, t);
  const { workflows, folders, search, importingBundle, deletingId } = state;

  const fetchKpis = useCallback(async () => {
    const [runs, automations] = await Promise.all([
      listRuns({ limit: 100, projectId }).catch(() => []),
      listAutomations({ projectId }).catch(() => []),
    ]);
    setRunsToday(
      runs.filter((r) => r.ownerType === 'workflow' && isToday(r.updatedAt ?? r.startedAt)).length,
    );
    setActiveAutomations(
      automations.filter((a) => a.targetType === 'workflow' && a.enabled).length,
    );
  }, [projectId]);

  useHubListLoader(fetchKpis, [projectId], { eventName: HUB_RUNS_CHANGED });

  const hubWorkspace = useMemo<HubWorkspaceContextValue>(
    () => ({
      openWorkflowCanvas: (workflowId: string) => setActiveWorkflowId(workflowId),
      openNewWorkflowCanvas: () => setActiveWorkflowId('new'),
      closeWorkflowCanvas: () => setActiveWorkflowId(null),
      reportAutomationsFormMode: () => {},
      reportRunsDetailActive: () => {},
    }),
    [],
  );

  const q = search.trim().toLowerCase();
  const visibleWorkflows = useMemo(() => {
    let list = workflows;
    if (folderFilter === 'root') list = list.filter((w) => !w.folderId);
    else if (folderFilter !== 'all') list = list.filter((w) => w.folderId === folderFilter);
    if (q) {
      list = list.filter(
        (w) => w.name.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [workflows, folderFilter, q]);

  const totalNodes = useMemo(
    () => workflows.reduce((acc, w) => acc + (w.nodes?.length ?? 0), 0),
    [workflows],
  );

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDeleteWf = workflows.find((w) => w.id === confirmDeleteId) ?? null;

  const openWorkflow = (wf: CanvasWorkflow) => {
    loadWorkflowIntoCanvas(wf);
    setActiveWorkflowId(wf.id);
  };

  const newWorkflow = () => {
    clearCanvas();
    setActiveWorkflowId('new');
  };

  const openWorkflowAutomations = (wf: CanvasWorkflow) => {
    try {
      sessionStorage.setItem(
        PENDING_AUTOMATIONS_FILTER_KEY,
        JSON.stringify({ targetType: 'workflow', targetId: wf.id, targetLabel: wf.name }),
      );
    } catch {
      /* ignore */
    }
    openAutomationsTab();
  };

  if (activeWorkflowId != null) {
    return (
      <HubWorkspaceProvider value={hubWorkspace}>
        <AgentCanvasView onBackToLibrary={() => setActiveWorkflowId(null)} />
      </HubWorkspaceProvider>
    );
  }

  const stats: OrchestrationStat[] = [
    { label: t('orchestration.workflows.stat_workflows'), value: workflows.length, tone: 'info' },
    { label: t('orchestration.workflows.stat_nodes'), value: totalNodes },
    {
      label: t('orchestration.workflows.stat_runs_today'),
      value: runsToday ?? '—',
      tone: 'success',
      sub: t('orchestration.workflows.stat_runs_today_sub'),
    },
    {
      label: t('orchestration.workflows.stat_active_automations'),
      value: activeAutomations ?? '—',
      tone: 'warning',
      sub: t('orchestration.workflows.stat_active_automations_sub'),
    },
  ];

  const folderChips = [
    { value: 'all', label: t('orchestration.filter_all') },
    ...(folders.length > 0 ? [{ value: 'root', label: t('orchestration.filter_ungrouped') }] : []),
    ...folders.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <HubWorkspaceProvider value={hubWorkspace}>
      <OrchestrationShell
        section="workflows"
        title={t('tabs.workflows')}
        subtitle={t('automationHub.workflows_subtitle')}
        icon={GitBranch}
        stats={stats}
        actions={
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label={t('hubExport.import_workflow')}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleWorkflowImportFile(file);
              }}
            />
            <DomeButton
              variant="outline"
              size="sm"
              disabled={importingBundle}
              onClick={() => importInputRef.current?.click()}
              leftIcon={importingBundle ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            >
              {t('hubExport.import_workflow')}
            </DomeButton>
            <DomeButton
              variant="primary"
              size="sm"
              onClick={newWorkflow}
              className="!bg-[var(--dome-accent)]"
              leftIcon={<Plus className="size-3.5" />}
            >
              {t('canvas.new_workflow')}
            </DomeButton>
          </>
        }
        toolbar={
          <div className="flex items-center gap-3 flex-wrap">
            <HubSearchField
              value={search}
              onChange={setSearch}
              placeholder={t('canvas.search_workflows_placeholder')}
              ariaLabel={t('canvas.search_workflows_placeholder')}
            />
            <DomeFilterChipGroup
              dense
              options={folderChips.map((c) => ({ value: c.value, label: c.label }))}
              value={folderFilter}
              onChange={setFolderFilter}
            />
          </div>
        }
      >
        {loading ? (
          <div className="p-6">
            <DomeSkeletonGrid count={9} />
          </div>
        ) : workflows.length === 0 ? (
          <div className="p-6">
            <div
              className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl px-8 py-10 text-center"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
            >
              <div
                className="flex size-14 items-center justify-center rounded-2xl"
                style={{ background: 'var(--info-bg)', color: 'var(--info)' }}
              >
                <Workflow className="size-7" strokeWidth={1.5} />
              </div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
                {t('canvas.no_workflows_saved_title')}
              </h2>
              <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                {t('canvas.no_workflows_saved_desc')}
              </p>
              <DomeButton
                variant="primary"
                size="sm"
                className="mt-2 !bg-[var(--dome-accent)]"
                onClick={newWorkflow}
                leftIcon={<Plus className="size-3.5" />}
              >
                {t('canvas.create_first_workflow')}
              </DomeButton>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleWorkflows.map((wf) => {
              const nodeCount = wf.nodes?.length ?? 0;
              const agentNodes = (wf.nodes ?? []).filter((n) => n.type.includes('agent')).length;
              return (
                <div
                  key={wf.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openWorkflow(wf)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openWorkflow(wf);
                    }
                  }}
                  className="group flex cursor-pointer flex-col gap-3 rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
                  style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: 'var(--info-bg)', color: 'var(--info)' }}
                    >
                      <Workflow className="size-5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                        {wf.name}
                      </span>
                      <p className="line-clamp-2 text-xs leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                        {wf.description || t('orchestration.workflows.no_description')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
                    >
                      <GitBranch className="size-2.5" aria-hidden />
                      {t('orchestration.workflows.nodes_count', { count: nodeCount })}
                    </span>
                    {agentNodes > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                        style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
                      >
                        <Bot className="size-2.5" aria-hidden />
                        {t('orchestration.workflows.agents_count', { count: agentNodes })}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                      {formatDate(wf.updatedAt)}
                    </span>
                    <div
                      className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      <DomeButton
                        variant="outline"
                        size="xs"
                        onClick={() => openWorkflow(wf)}
                        leftIcon={<Pencil className="size-3" />}
                      >
                        {t('orchestration.workflows.open_canvas')}
                      </DomeButton>
                      <DomeButton
                        variant="ghost"
                        size="xs"
                        iconOnly
                        title={t('agents.automations')}
                        aria-label={t('agents.automations')}
                        onClick={() => openWorkflowAutomations(wf)}
                      >
                        <Zap className="size-3.5" style={{ color: 'var(--warning)' }} />
                      </DomeButton>
                      <DomeButton
                        variant="ghost"
                        size="xs"
                        iconOnly
                        title={t('hubExport.export_workflow')}
                        aria-label={t('hubExport.export_workflow')}
                        onClick={() => void handleExportWorkflow(wf)}
                      >
                        <Download className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                      </DomeButton>
                      <DomeButton
                        variant="ghost"
                        size="xs"
                        iconOnly
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                        disabled={deletingId === wf.id}
                        className="!text-[var(--error)] hover:!bg-[var(--error-bg)]"
                        onClick={() => setConfirmDeleteId(wf.id)}
                      >
                        {deletingId === wf.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </DomeButton>
                    </div>
                  </div>
                </div>
              );
            })}
            {q && visibleWorkflows.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                {t('canvas.no_workflow_search_results')}
              </p>
            ) : null}
          </div>
        )}

        <ConfirmDialog
          isOpen={confirmDeleteWf != null}
          title={t('orchestration.workflows.delete_title')}
          message={
            confirmDeleteWf
              ? t('orchestration.workflows.delete_confirm', { name: confirmDeleteWf.name })
              : ''
          }
          variant="danger"
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            if (confirmDeleteId) void handleDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      </OrchestrationShell>
    </HubWorkspaceProvider>
  );
}
