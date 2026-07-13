import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { DashboardSquare01Icon, DatabaseIcon, Delete02Icon, Download04Icon, Loading03Icon, MoreVerticalIcon, PencilIcon, PlusSignIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import { showToast } from '@/lib/store/useToastStore';
import type { PipelineItem, PipelineStage } from '@/lib/pipelines/types';
import StageColumn from './StageColumn';
import NewStageColumn from './NewStageColumn';
import CardDetailModal from './CardDetailModal';
import StageConfigModal from './StageConfigModal';
import DataSourcePanel from './DataSourcePanel';
import PipelinesDashboard from './PipelinesDashboard';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue , SelectGroup } from '@/components/ui/select';
import type { ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator , DropdownMenuGroup } from '@/components/ui/dropdown-menu';
export default function PipelinesBoard() {
  const { t } = useTranslation();
  const {
    pipelines,
    activePipelineId,
    stages,
    items,
    sources,
    agents,
    workflows,
    loadingList,
    loadingBoard,
    init,
    loadExecutors,
    selectPipeline,
    createPipeline,
    renamePipeline,
    deletePipeline,
    exportPipeline,
    importPipeline,
    createStage,
    updateStage,
    deleteStage,
    createItem,
    updateItem,
    moveItem,
    runItem,
    resolveItem,
    deleteItem,
    createSource,
    syncSource,
    deleteSource,
  } = usePipelinesStore();

  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openItem, setOpenItem] = useState<PipelineItem | null>(null);
  const [configStage, setConfigStage] = useState<PipelineStage | null>(null);
  // Pipelines always opens on the hub/dashboard.
  const [showDashboard, setShowDashboard] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  // Agents/workflows/automations/runs live in their own sidebar sections now;
  // the dashboard shortcuts route to those tabs.
  const { openAgentsTab, openWorkflowsTab, openAutomationsTab, openRunsTab } = useTabStore();
  // Horizontal wheel-scroll + drag for the Kanban columns row.
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const boardScrollReady = !showDashboard && !loadingBoard;
  useHorizontalScroll(boardScrollRef, boardScrollReady);

  // Re-run on projectId change: currentProject loads async on boot, so the
  // first init() may run under 'default' before the real project resolves.
  // Without this dep the board would list the wrong project and a just-created
  // pipeline would "disappear" after a restart.
  useEffect(() => {
    void init();
  }, [init, projectId]);

  const sortedStages = [...stages].sort((a, b) => a.position - b.position);
  const itemsByStage = (stageId: string) =>
    items.filter((i) => i.stageId === stageId).sort((a, b) => a.position - b.position);

  // Keep modal subjects in sync with live store updates.
  const liveOpenItem = openItem ? items.find((i) => i.id === openItem.id) ?? null : null;
  const liveConfigStage = configStage ? stages.find((s) => s.id === configStage.id) ?? null : null;

  const handleCreatePipeline = async () => {
    const name = newName.trim();
    if (!name) return;
    await createPipeline(name);
    setNewName('');
    setCreatingPipeline(false);
  };

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  const startRename = () => {
    if (!activePipeline) return;
    setRenameValue(activePipeline.name);
    setRenaming(true);
  };

  const handleRename = async () => {
    const name = renameValue.trim();
    if (activePipelineId && name) await renamePipeline(activePipelineId, name);
    setRenaming(false);
  };

  const handleExport = async () => {
    if (!activePipelineId) return;
    setBusy(true);
    try {
      const ok = await exportPipeline(activePipelineId);
      if (ok) showToast('success', t('pipelines.exported_success'));
    } catch {
      showToast('error', t('pipelines.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const imported = await importPipeline();
      if (imported) {
        setShowDashboard(false);
        showToast('success', t('pipelines.imported_success'));
      }
    } catch {
      showToast('error', t('pipelines.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!activePipelineId) return;
    setBusy(true);
    try {
      await deletePipeline(activePipelineId);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  if (loadingList && pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <HugeiconsIcon icon={Loading03Icon} className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {/* Header toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 border-border">
        <Button
          variant={showDashboard ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowDashboard(true)}
          title={t('pipelines.dashboard_title')}
        >
          <HugeiconsIcon icon={DashboardSquare01Icon} data-icon="inline-start" />
          {t('pipelines.overview')}
        </Button>

        <SectionGuideHelp sectionKey="pipelines" />

        {renaming ? (
          <div className="flex items-center gap-1.5">
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the rename field the user just opened.
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              placeholder={t('pipelines.pipeline_name_placeholder')}
              aria-label={t('pipelines.pipeline_name_placeholder')}
              className="h-8"
            />
            <Button
              type="button"
              onClick={() => void handleRename()}
              size="sm"
            >
              {t('pipelines.save')}
            </Button>
          </div>
        ) : (
          <div style={{ minWidth: 180 }}>
            <Select value={activePipelineId ?? ''} onValueChange={(next) => { if (next != null) ((id) => {
                setShowDashboard(false);
                void selectPipeline(id);
              })(next); }} items={pipelines.map((p) => ({ value: p.id, label: p.name }))}><SelectTrigger className="w-full"><SelectValue placeholder={t('pipelines.title')} /></SelectTrigger><SelectContent><SelectGroup>{(pipelines.map((p) => ({ value: p.id, label: p.name }))).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select>
          </div>
        )}

        <Button
          type="button"
          onClick={() => setCreatingPipeline(true)}
          variant="outline"
          size="icon-sm"
          title={t('pipelines.new_pipeline')}
        >
          <HugeiconsIcon icon={PlusSignIcon} />
          <span className="sr-only">{t('pipelines.new_pipeline')}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" aria-label={t('pipelines.pipeline_actions')} disabled={busy} size="icon-sm" />
            }
          >
            <HugeiconsIcon icon={MoreVerticalIcon} size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40"><DropdownMenuGroup>
            <DropdownMenuItem disabled={!activePipeline} onClick={startRename}>
              <HugeiconsIcon icon={PencilIcon} size={14} />
              {t('pipelines.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!activePipeline} onClick={() => void handleExport()}>
              <HugeiconsIcon icon={Download04Icon} size={14} />
              {t('pipelines.export')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleImport()}>
              <HugeiconsIcon icon={Upload04Icon} size={14} />
              {t('pipelines.import')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={!activePipeline} onClick={() => setConfirmDelete(true)}>
              <HugeiconsIcon icon={Delete02Icon} size={14} />
              {t('pipelines.delete')}
            </DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {!showDashboard && (
          <Button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            variant={sourcesOpen ? 'secondary' : 'outline'}
            size="sm"
            title={t('pipelines.data_sources')}
          >
            <HugeiconsIcon icon={DatabaseIcon} data-icon="inline-start" />
            {t('pipelines.data_sources')}
          </Button>
        )}

      </div>

      {/* Body: dashboard overview or the active board */}
      {showDashboard ? (
        <PipelinesDashboard
          onOpenPipeline={(id) => { setShowDashboard(false); void selectPipeline(id); }}
          onOpenAgents={openAgentsTab}
          onOpenWorkflows={openWorkflowsTab}
          onOpenAutomations={openAutomationsTab}
          onOpenRuns={openRunsTab}
        />
      ) : loadingBoard ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} className="animate-spin" size={20} />
        </div>
      ) : (
        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          {sourcesOpen && (
            <DataSourcePanel
              sources={sources}
              stages={sortedStages}
              onCreate={(input) => createSource(input)}
              onSync={(sourceId) => syncSource(sourceId)}
              onDelete={(sourceId) => deleteSource(sourceId)}
            />
          )}
          <div
            ref={boardScrollRef}
            className="flex flex-nowrap gap-3 overflow-x-auto overflow-y-hidden flex-1 min-w-0 min-h-0 p-4"
          >
            {sortedStages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                items={itemsByStage(stage.id)}
                onDropItem={(itemId) => void moveItem(itemId, stage.id)}
                onAddCard={(title) => void createItem({ stageId: stage.id, title })}
                onOpenItem={(item) => setOpenItem(item)}
                onRunItem={(item) => void runItem(item.id)}
                onResolveItem={(item) => void resolveItem(item.id)}
                onConfigure={() => setConfigStage(stage)}
              />
            ))}
            <NewStageColumn onCreate={(data) => createStage(data)} />
          </div>
        </div>
      )}

      {liveOpenItem && (
        <CardDetailModal
          item={liveOpenItem}
          stage={stages.find((s) => s.id === liveOpenItem.stageId)}
          pipelineName={pipelines.find((p) => p.id === liveOpenItem.pipelineId)?.name}
          agents={agents}
          onClose={() => setOpenItem(null)}
          onSave={(patch) => updateItem({ id: liveOpenItem.id, ...patch })}
          onDelete={async () => {
            await deleteItem(liveOpenItem.id);
            setOpenItem(null);
          }}
          onRun={() => runItem(liveOpenItem.id)}
        />
      )}

      {liveConfigStage && (
        <StageConfigModal
          stage={liveConfigStage}
          agents={agents}
          workflows={workflows}
          projectId={projectId}
          onClose={() => setConfigStage(null)}
          onSave={(patch) => updateStage({ id: liveConfigStage.id, ...patch })}
          onDelete={async () => {
            await deleteStage(liveConfigStage.id);
            setConfigStage(null);
          }}
          onExecutorsChanged={() => void loadExecutors()}
          onCreateWorkflow={() => {
            setConfigStage(null);
            openWorkflowsTab();
          }}
        />
      )}

      <AlertDialog open={confirmDelete && Boolean(activePipeline)} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pipelines.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('pipelines.confirm_delete_pipeline')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('pipelines.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
              {t('pipelines.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={creatingPipeline} onOpenChange={setCreatingPipeline}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipelines.new_pipeline')}</DialogTitle>
            <DialogDescription>{t('pipelines.pipeline_name_placeholder')}</DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreatePipeline();
            }}
            placeholder={t('pipelines.pipeline_name_placeholder')}
            aria-label={t('pipelines.pipeline_name_placeholder')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingPipeline(false)}>
              {t('pipelines.cancel')}
            </Button>
            <Button onClick={() => void handleCreatePipeline()} disabled={!newName.trim()}>
              {t('pipelines.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
