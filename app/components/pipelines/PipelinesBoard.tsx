import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { DashboardSquare01Icon, DatabaseIcon, Delete02Icon, Download04Icon, Loading03Icon, MoreVerticalIcon, PencilIcon, PlusSignIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import { showToast } from '@/lib/store/useToastStore';
import type { ExecutorOption } from '@/lib/store/usePipelinesStore';
import type {
  CreateSourceInput,
  ExecutionPolicy,
  Pipeline,
  PipelineItem,
  PipelineSource,
  PipelineStage,
} from '@/lib/pipelines/types';
import StageColumn from './StageColumn';
import NewStageColumn from './NewStageColumn';
import CardDetailModal from './CardDetailModal';
import StageConfigModal from './StageConfigModal';
import DataSourcePanel from './DataSourcePanel';
import PipelinesDashboard from './PipelinesDashboard';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';
import { askStudioMany } from '@/components/studio-hub';
import { HubHeader, HubPageHeader } from '@/components/hub';

import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue , SelectGroup } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator , DropdownMenuGroup } from '@/components/ui/dropdown-menu';

/** Sort stages by board position — extracted so PipelinesBoard stays under S3776. */
function sortStagesByPosition(stages: PipelineStage[]): PipelineStage[] {
  return [...stages].sort((a, b) => a.position - b.position);
}

/** Cards in a stage, ordered by position. */
function itemsForStage(items: PipelineItem[], stageId: string): PipelineItem[] {
  return items.filter((i) => i.stageId === stageId).sort((a, b) => a.position - b.position);
}

/** Keep modal subject in sync with live store updates. */
function resolveLiveOpenItem(
  openItem: PipelineItem | null,
  items: PipelineItem[],
): PipelineItem | null {
  if (!openItem) return null;
  return items.find((i) => i.id === openItem.id) ?? null;
}

/** Keep stage-config subject in sync with live store updates. */
function resolveLiveConfigStage(
  configStage: PipelineStage | null,
  stages: PipelineStage[],
): PipelineStage | null {
  if (!configStage) return null;
  return stages.find((s) => s.id === configStage.id) ?? null;
}

function PipelinesBoardLoading() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <HugeiconsIcon icon={Loading03Icon} className="animate-spin" size={20} />
    </div>
  );
}

type PipelinesBoardToolbarProps = {
  showDashboard: boolean;
  onShowDashboard: () => void;
  renaming: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  pipelines: Pipeline[];
  activePipelineId: string | null;
  activePipeline: Pipeline | null;
  onSelectPipeline: (id: string) => void;
  onStartCreate: () => void;
  onStartRename: () => void;
  onExport: () => void;
  onImport: () => void;
  onRequestDelete: () => void;
  busy: boolean;
  sourcesOpen: boolean;
  onToggleSources: () => void;
};

/** Header controls — rename/select/actions/sources. Extracted for S3776. */
function PipelinesBoardToolbar({
  showDashboard,
  onShowDashboard,
  renaming,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
  pipelines,
  activePipelineId,
  activePipeline,
  onSelectPipeline,
  onStartCreate,
  onStartRename,
  onExport,
  onImport,
  onRequestDelete,
  busy,
  sourcesOpen,
  onToggleSources,
}: PipelinesBoardToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={showDashboard ? 'secondary' : 'outline'}
        size="sm"
        onClick={onShowDashboard}
        title={t('pipelines.dashboard_title')}
      >
        <HugeiconsIcon icon={DashboardSquare01Icon} data-icon="inline-start" />
        {t('pipelines.overview')}
      </Button>

      {renaming ? (
        <div className="flex items-center gap-1.5">
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the rename field the user just opened.
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSubmit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            placeholder={t('pipelines.pipeline_name_placeholder')}
            aria-label={t('pipelines.pipeline_name_placeholder')}
            className="h-8"
          />
          <Button type="button" onClick={onRenameSubmit} size="sm">
            {t('pipelines.save')}
          </Button>
        </div>
      ) : (
        <Select
          value={pipelines.length === 0 ? null : (activePipelineId ?? null)}
          onValueChange={(next) => {
            if (next != null) onSelectPipeline(next);
          }}
          items={pipelines.map((p) => ({ value: p.id, label: p.name }))}
          disabled={pipelines.length === 0}
        >
          <SelectTrigger className="w-[min(100%,16rem)]" disabled={pipelines.length === 0}>
            <SelectValue
              placeholder={
                pipelines.length === 0
                  ? t('pipelines.empty_title')
                  : t('pipelines.select_pipeline')
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="block truncate">{p.name}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}

      <Button
        type="button"
        onClick={onStartCreate}
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
            <Button
              variant="ghost"
              aria-label={t('pipelines.pipeline_actions')}
              disabled={busy}
              size="icon-sm"
            />
          }
        >
          <HugeiconsIcon icon={MoreVerticalIcon} size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={!activePipeline} onClick={onStartRename}>
              <HugeiconsIcon icon={PencilIcon} size={14} />
              {t('pipelines.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!activePipeline} onClick={onExport}>
              <HugeiconsIcon icon={Download04Icon} size={14} />
              {t('pipelines.export')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onImport}>
              <HugeiconsIcon icon={Upload04Icon} size={14} />
              {t('pipelines.import')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!activePipeline}
              onClick={onRequestDelete}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} />
              {t('pipelines.delete')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {!showDashboard && (
        <Button
          type="button"
          onClick={onToggleSources}
          variant={sourcesOpen ? 'secondary' : 'outline'}
          size="sm"
          title={t('pipelines.data_sources')}
        >
          <HugeiconsIcon icon={DatabaseIcon} data-icon="inline-start" />
          {t('pipelines.data_sources')}
        </Button>
      )}
    </div>
  );
}

type PipelinesDetailDockProps = {
  liveOpenItem: PipelineItem | null;
  liveConfigStage: PipelineStage | null;
  stages: PipelineStage[];
  pipelines: Pipeline[];
  agents: ExecutorOption[];
  workflows: ExecutorOption[];
  projectId: string;
  onCloseItem: () => void;
  onCloseStage: () => void;
  onSaveItem: (patch: Partial<PipelineItem> & { id: string }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onRunItem: (id: string) => void | Promise<void>;
  onSaveStage: (patch: Partial<PipelineStage> & { id: string }) => Promise<void>;
  onDeleteStage: (id: string) => Promise<void>;
  onExecutorsChanged: () => void;
  onCreateWorkflow: () => void;
};

/** Card / stage side panel — extracted so PipelinesBoard stays under S3776. */
function PipelinesDetailDock({
  liveOpenItem,
  liveConfigStage,
  stages,
  pipelines,
  agents,
  workflows,
  projectId,
  onCloseItem,
  onCloseStage,
  onSaveItem,
  onDeleteItem,
  onRunItem,
  onSaveStage,
  onDeleteStage,
  onExecutorsChanged,
  onCreateWorkflow,
}: PipelinesDetailDockProps) {
  if (!liveOpenItem && !liveConfigStage) return null;

  return (
    <div className="absolute inset-0 z-10 flex h-full min-h-0 w-full flex-col border-l bg-background min-[900px]:static min-[900px]:inset-auto min-[900px]:z-auto min-[900px]:w-[22rem] min-[900px]:shrink-0 lg:w-[28rem]">
      {liveOpenItem ? (
        <CardDetailModal
          item={liveOpenItem}
          stage={stages.find((s) => s.id === liveOpenItem.stageId)}
          pipelineName={pipelines.find((p) => p.id === liveOpenItem.pipelineId)?.name}
          agents={agents}
          onClose={onCloseItem}
          onSave={(patch) => onSaveItem({ id: liveOpenItem.id, ...patch })}
          onDelete={async () => {
            await onDeleteItem(liveOpenItem.id);
            onCloseItem();
          }}
          onRun={() => onRunItem(liveOpenItem.id)}
        />
      ) : null}
      {liveConfigStage && !liveOpenItem ? (
        <StageConfigModal
          stage={liveConfigStage}
          agents={agents}
          workflows={workflows}
          projectId={projectId}
          onClose={onCloseStage}
          onSave={(patch) => onSaveStage({ id: liveConfigStage.id, ...patch })}
          onDelete={async () => {
            await onDeleteStage(liveConfigStage.id);
            onCloseStage();
          }}
          onExecutorsChanged={onExecutorsChanged}
          onCreateWorkflow={onCreateWorkflow}
        />
      ) : null}
    </div>
  );
}

type PipelinesKanbanViewProps = {
  boardScrollRef: RefObject<HTMLDivElement>;
  sourcesOpen: boolean;
  sources: PipelineSource[];
  sortedStages: PipelineStage[];
  items: PipelineItem[];
  onCreateSource: (input: Omit<CreateSourceInput, 'pipelineId'>) => Promise<void>;
  onSyncSource: (sourceId: string) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
  onMoveItem: (itemId: string, stageId: string) => void;
  onAddCard: (stageId: string, title: string) => void;
  onOpenItem: (item: PipelineItem) => void;
  onRunItem: (item: PipelineItem) => void;
  onResolveItem: (item: PipelineItem) => void;
  onConfigureStage: (stage: PipelineStage) => void;
  onCreateStage: (data: { title: string; executionPolicy: ExecutionPolicy }) => Promise<void> | void;
  detailDock: ReactNode;
};

/** Kanban columns + optional sources panel. Extracted for S3776. */
function PipelinesKanbanView({
  boardScrollRef,
  sourcesOpen,
  sources,
  sortedStages,
  items,
  onCreateSource,
  onSyncSource,
  onDeleteSource,
  onMoveItem,
  onAddCard,
  onOpenItem,
  onRunItem,
  onResolveItem,
  onConfigureStage,
  onCreateStage,
  detailDock,
}: PipelinesKanbanViewProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {sourcesOpen ? (
        <DataSourcePanel
          sources={sources}
          stages={sortedStages}
          onCreate={(input) => onCreateSource(input)}
          onSync={(sourceId) => onSyncSource(sourceId)}
          onDelete={(sourceId) => onDeleteSource(sourceId)}
        />
      ) : null}
      <div
        ref={boardScrollRef}
        className="flex h-full min-h-0 min-w-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-3 py-3 sm:px-4"
      >
        {sortedStages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            items={itemsForStage(items, stage.id)}
            onDropItem={(itemId) => onMoveItem(itemId, stage.id)}
            onAddCard={(title) => onAddCard(stage.id, title)}
            onOpenItem={onOpenItem}
            onRunItem={onRunItem}
            onResolveItem={onResolveItem}
            onConfigure={() => onConfigureStage(stage)}
          />
        ))}
        <NewStageColumn onCreate={(data) => onCreateStage(data)} />
      </div>
      {detailDock}
    </div>
  );
}

type PipelinesBoardBodyProps = {
  showDashboard: boolean;
  loadingBoard: boolean;
  onOpenPipeline: (id: string) => void;
  kanban: ReactNode;
};

/** Dashboard / loading / kanban switch — extracted for S3776. */
function PipelinesBoardBody({
  showDashboard,
  loadingBoard,
  onOpenPipeline,
  kanban,
}: PipelinesBoardBodyProps) {
  if (showDashboard) {
    return <PipelinesDashboard onOpenPipeline={onOpenPipeline} />;
  }
  if (loadingBoard) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <HugeiconsIcon icon={Loading03Icon} className="animate-spin" size={20} />
      </div>
    );
  }
  return kanban;
}

type PipelinesCreateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newName: string;
  onNewNameChange: (value: string) => void;
  onCreate: () => void;
};

/** New-pipeline name modal — extracted for S3776. */
function PipelinesCreateModal({
  open,
  onOpenChange,
  newName,
  onNewNameChange,
  onCreate,
}: PipelinesCreateModalProps) {
  const { t } = useTranslation();

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="sm">
        <AppModalHeader
          title={t('pipelines.new_pipeline')}
          description={t('pipelines.pipeline_name_placeholder')}
        />
        <AppModalBody>
          <Input
            value={newName}
            onChange={(event) => onNewNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onCreate();
            }}
            placeholder={t('pipelines.pipeline_name_placeholder')}
            aria-label={t('pipelines.pipeline_name_placeholder')}
          />
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('pipelines.cancel')}
          </Button>
          <Button onClick={onCreate} disabled={!newName.trim()}>
            {t('pipelines.create')}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

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
  const { openWorkflowsTab } = useTabStore();
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

  const sortedStages = sortStagesByPosition(stages);
  const liveOpenItem = resolveLiveOpenItem(openItem, items);
  const liveConfigStage = resolveLiveConfigStage(configStage, stages);
  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  const handleCreatePipeline = async () => {
    const name = newName.trim();
    if (!name) return;
    await createPipeline(name);
    setNewName('');
    setCreatingPipeline(false);
  };

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

  const clearBoardSelection = () => {
    setOpenItem(null);
    setConfigStage(null);
  };

  const openPipelineBoard = (id: string) => {
    clearBoardSelection();
    setShowDashboard(false);
    void selectPipeline(id).catch(() => {});
  };

  if (loadingList && pipelines.length === 0) {
    return <PipelinesBoardLoading />;
  }

  const detailDock = (
    <PipelinesDetailDock
      liveOpenItem={liveOpenItem}
      liveConfigStage={liveConfigStage}
      stages={stages}
      pipelines={pipelines}
      agents={agents}
      workflows={workflows}
      projectId={projectId}
      onCloseItem={() => setOpenItem(null)}
      onCloseStage={() => setConfigStage(null)}
      onSaveItem={(patch) => updateItem(patch)}
      onDeleteItem={(id) => deleteItem(id)}
      onRunItem={(id) => runItem(id)}
      onSaveStage={(patch) => updateStage(patch)}
      onDeleteStage={(id) => deleteStage(id)}
      onExecutorsChanged={() => {
        void loadExecutors().catch(() => {});
      }}
      onCreateWorkflow={() => {
        setConfigStage(null);
        openWorkflowsTab();
      }}
    />
  );

  const kanban = (
    <PipelinesKanbanView
      boardScrollRef={boardScrollRef}
      sourcesOpen={sourcesOpen}
      sources={sources}
      sortedStages={sortedStages}
      items={items}
      onCreateSource={createSource}
      onSyncSource={syncSource}
      onDeleteSource={deleteSource}
      onMoveItem={(itemId, stageId) => {
        void moveItem(itemId, stageId).catch(() => {});
      }}
      onAddCard={(stageId, title) => {
        void createItem({ stageId, title }).catch(() => {});
      }}
      onOpenItem={(item) => {
        setConfigStage(null);
        setOpenItem(item);
      }}
      onRunItem={(item) => {
        void runItem(item.id).catch(() => {});
      }}
      onResolveItem={(item) => {
        void resolveItem(item.id).catch(() => {});
      }}
      onConfigureStage={(stage) => {
        setOpenItem(null);
        setConfigStage(stage);
      }}
      onCreateStage={createStage}
      detailDock={detailDock}
    />
  );

  return (
    <div className="@container/pipelines flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <HubPageHeader className="shrink-0 gap-y-3">
        <HubHeader
          title={t('pipelines.title')}
          description={t('pipelines.dashboard_title')}
          actions={
            <>
              <SectionGuideHelp sectionKey="pipelines" />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => askStudioMany(t('orchestration.agent_prompt_pipelines'))}
              >
                {t('orchestration.agent_ask_many')}
              </Button>
            </>
          }
        />
        <PipelinesBoardToolbar
          showDashboard={showDashboard}
          onShowDashboard={() => {
            clearBoardSelection();
            setShowDashboard(true);
          }}
          renaming={renaming}
          renameValue={renameValue}
          onRenameValueChange={setRenameValue}
          onRenameSubmit={() => {
            void handleRename().catch(() => {});
          }}
          onRenameCancel={() => setRenaming(false)}
          pipelines={pipelines}
          activePipelineId={activePipelineId}
          activePipeline={activePipeline}
          onSelectPipeline={openPipelineBoard}
          onStartCreate={() => setCreatingPipeline(true)}
          onStartRename={startRename}
          onExport={() => {
            void handleExport().catch(() => {});
          }}
          onImport={() => {
            void handleImport().catch(() => {});
          }}
          onRequestDelete={() => setConfirmDelete(true)}
          busy={busy}
          sourcesOpen={sourcesOpen}
          onToggleSources={() => setSourcesOpen((v) => !v)}
        />
      </HubPageHeader>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <PipelinesBoardBody
          showDashboard={showDashboard}
          loadingBoard={loadingBoard}
          onOpenPipeline={(id) => {
            setShowDashboard(false);
            void selectPipeline(id).catch(() => {});
          }}
          kanban={kanban}
        />
      </div>

      <ConfirmDialog
        isOpen={confirmDelete && Boolean(activePipeline)}
        title={t('pipelines.delete')}
        message={t('pipelines.confirm_delete_pipeline')}
        confirmLabel={t('pipelines.delete')}
        cancelLabel={t('pipelines.cancel')}
        variant="danger"
        busy={busy}
        onConfirm={() => {
          void handleDelete().catch(() => {});
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      <PipelinesCreateModal
        open={creatingPipeline}
        onOpenChange={setCreatingPipeline}
        newName={newName}
        onNewNameChange={setNewName}
        onCreate={() => {
          void handleCreatePipeline().catch(() => {});
        }}
      />
    </div>
  );
}
