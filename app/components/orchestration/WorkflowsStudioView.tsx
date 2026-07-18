import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  BotIcon as BotIcon,
  Download04Icon as DownloadIcon,
  GitBranchIcon as GitBranchIcon,
  Loading03Icon as Loader2Icon,
  PencilIcon as PencilIcon,
  PlusSignIcon as PlusIcon,
  Delete02Icon as Trash2Icon,
  Upload04Icon as UploadIcon,
  WorkflowSquare01Icon as WorkflowIcon,
  ZapIcon as ZapIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Input } from '@/components/ui/input';
import type { CanvasWorkflow } from '@/types/canvas';
import { useCanvasStore } from '@/lib/store/useCanvasStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { listRuns } from '@/lib/automations/api';
import { HubWorkspaceProvider, type HubWorkspaceContextValue } from '@/lib/context/HubWorkspaceContext';
import { PENDING_AUTOMATIONS_FILTER_KEY } from '@/lib/hub/hubStorageKeys';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import AgentCanvasView from '@/components/agent-canvas/AgentCanvasView';
import { useWorkflowLibrary } from '@/components/agent-canvas/useWorkflowLibrary';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DomainStatChips, type DomainStat } from '@/components/shared/DomainStatChips';
import { HubHeader, HubPageHeader } from '@/components/hub';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { askStudioMany } from '@/components/studio-hub';
import { useHubListLoader } from '@/lib/hub/useHubListLoader';
import { HUB_RUNS_CHANGED } from '@/lib/hub/hubEvents';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { Skeleton } from '@/components/ui/skeleton';
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
    const runs = await listRuns({ limit: 100, projectId }).catch(() => []);
    setRunsToday(
      runs.filter((r) => r.ownerType === 'workflow' && isToday(r.updatedAt ?? r.startedAt)).length,
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
        <div key={`canvas-${activeWorkflowId}`} className="h-full studio-view-enter">
          <AgentCanvasView onBackToLibrary={() => setActiveWorkflowId(null)} />
        </div>
      </HubWorkspaceProvider>
    );
  }

  const stats: DomainStat[] = [
    { id: 'stat_workflows', label: t('orchestration.workflows.stat_workflows'), value: workflows.length, tone: 'info' },
    { id: 'stat_nodes', label: t('orchestration.workflows.stat_nodes'), value: totalNodes },
    {
      id: 'stat_runs_today',
      label: t('orchestration.workflows.stat_runs_today'),
      value: runsToday ?? '—',
      tone: 'success',
      sub: t('orchestration.workflows.stat_runs_today_sub'),
    },
  ];

  const folderChips = [
    { value: 'all', label: t('orchestration.filter_all') },
    ...(folders.length > 0 ? [{ value: 'root', label: t('orchestration.filter_ungrouped') }] : []),
    ...folders.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <HubWorkspaceProvider value={hubWorkspace}>
      <div
        key="library"
        className="@container/workflows flex h-full min-h-0 flex-col overflow-hidden bg-background studio-view-enter"
      >
        <HubPageHeader className="space-y-3">
          <HubHeader
            title={t('tabs.workflows')}
            description={t('automationHub.workflows_subtitle')}
            actions={
              <>
                <Input
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
                <Button
                  variant="outline"
                  disabled={importingBundle}
                  onClick={() => importInputRef.current?.click()}
                  size="sm"
                >
                  {importingBundle ? (
                    <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={UploadIcon} className="size-3.5" />
                  )}
                  {t('hubExport.import_workflow')}
                </Button>
                <Button onClick={newWorkflow} size="sm">
                  <HugeiconsIcon icon={PlusIcon} className="size-3.5" />
                  {t('canvas.new_workflow')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => askStudioMany(t('orchestration.agent_prompt_workflows'))}
                >
                  {t('orchestration.agent_ask_many')}
                </Button>
              </>
            }
          />
          <DomainStatChips stats={stats} />
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="h-8 max-w-xl">
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('canvas.search_workflows_placeholder')}
                aria-label={t('canvas.search_workflows_placeholder')}
              />
            </InputGroup>
            <ToggleGroup
              value={[folderFilter]}
              onValueChange={(values) => values[0] && setFolderFilter(values[0])}
            >
              {folderChips.map((chip) => (
                <ToggleGroupItem key={chip.value} value={chip.value} size="sm">
                  {chip.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </HubPageHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6">
              <output className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-lg" />
                ))}
              </output>
            </div>
          ) : workflows.length === 0 ? (
            <div className="space-y-4 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card size="sm" className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {t('orchestration.workflows.stat_workflows')}
                  </p>
                  <p className="text-xl font-semibold tabular-nums text-info">0</p>
                </Card>
                <Card size="sm" className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {t('orchestration.workflows.stat_nodes')}
                  </p>
                  <p className="text-xl font-semibold tabular-nums">0</p>
                </Card>
                <Card size="sm" className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {t('orchestration.workflows.stat_runs_today')}
                  </p>
                  <p className="text-xl font-semibold tabular-nums text-success">{runsToday ?? 0}</p>
                </Card>
              </div>
              <Card className="max-w-2xl gap-3 px-6 py-6">
                <div className="flex size-12 items-center justify-center rounded-xl bg-info/10 text-info">
                  <HugeiconsIcon icon={WorkflowIcon} className="size-6" strokeWidth={1.5} />
                </div>
                <h2 className="text-base font-semibold text-foreground">
                  {t('canvas.no_workflows_saved_title')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('canvas.no_workflows_saved_desc')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={newWorkflow} size="sm">
                    <HugeiconsIcon icon={PlusIcon} className="size-3.5" />
                    {t('canvas.create_first_workflow')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => askStudioMany(t('orchestration.agent_prompt_workflows'))}
                  >
                    {t('orchestration.agent_ask_many')}
                  </Button>
                </div>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2 xl:grid-cols-3">
              {visibleWorkflows.map((wf) => {
                const nodeCount = wf.nodes?.length ?? 0;
                const agentNodes = (wf.nodes ?? []).filter((n) => n.type.includes('agent')).length;
                return (
                  <Card
                    key={wf.id}
                    size="sm"
                    role="button"
                    tabIndex={0}
                    onClick={() => openWorkflow(wf)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openWorkflow(wf);
                      }
                    }}
                    className="group cursor-pointer text-left transition-[background-color] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out)] hover:bg-accent/30"
                  >
                    <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
                        <HugeiconsIcon icon={WorkflowIcon} className="size-5" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {wf.name}
                        </span>
                        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                          {wf.description || t('orchestration.workflows.no_description')}
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <HugeiconsIcon icon={GitBranchIcon} className="size-2.5" aria-hidden />
                        {t('orchestration.workflows.nodes_count', { count: nodeCount })}
                      </Badge>
                      {agentNodes > 0 ? (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          <HugeiconsIcon icon={BotIcon} className="size-2.5" aria-hidden />
                          {t('orchestration.workflows.agents_count', { count: agentNodes })}
                        </Badge>
                      ) : null}
                    </CardContent>
                    <CardFooter className="justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(wf.updatedAt)}
                      </span>
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <Button variant="outline" onClick={() => openWorkflow(wf)} size="xs">
                          <HugeiconsIcon icon={PencilIcon} className="size-3" />
                          {t('orchestration.workflows.open_canvas')}
                        </Button>
                        <Button
                          variant="ghost"
                          title={t('agents.automations')}
                          aria-label={t('agents.automations')}
                          onClick={() => openWorkflowAutomations(wf)}
                          size="icon-xs"
                        >
                          <HugeiconsIcon icon={ZapIcon} className="size-3.5 text-warning" />
                        </Button>
                        <Button
                          variant="ghost"
                          title={t('hubExport.export_workflow')}
                          aria-label={t('hubExport.export_workflow')}
                          onClick={() => void handleExportWorkflow(wf)}
                          size="icon-xs"
                        >
                          <HugeiconsIcon icon={DownloadIcon} className="size-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                          disabled={deletingId === wf.id}
                          className="text-destructive"
                          onClick={() => setConfirmDeleteId(wf.id)}
                          size="icon-xs"
                        >
                          {deletingId === wf.id ? (
                            <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" />
                          ) : (
                            <HugeiconsIcon icon={Trash2Icon} className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
              {q && visibleWorkflows.length === 0 ? (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  {t('canvas.no_workflow_search_results')}
                </p>
              ) : null}
            </div>
          )}
        </div>

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
      </div>
    </HubWorkspaceProvider>
  );
}
