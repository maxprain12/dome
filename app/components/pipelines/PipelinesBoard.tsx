import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Database, Download, LayoutDashboard, Loader2, MoreVertical, Pencil, Plus, Trash2, Upload, Zap } from 'lucide-react';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import { showToast } from '@/lib/store/useToastStore';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import DomeContextMenu from '@/components/ui/DomeContextMenu';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import { getManyAgents } from '@/lib/agents/api';
import { getWorkflows } from '@/lib/agent-canvas/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import type { PipelineItem, PipelineStage } from '@/lib/pipelines/types';
import StageColumn from './StageColumn';
import NewStageColumn from './NewStageColumn';
import CardDetailModal from './CardDetailModal';
import StageConfigModal from './StageConfigModal';
import DataSourcePanel from './DataSourcePanel';
import PipelinesDashboard from './PipelinesDashboard';
import AgentsWorkflowsModalView from './modal/AgentsWorkflowsModalView';
import AutomationsRunsModalView from './modal/AutomationsRunsModalView';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';

type ManageView = 'agentsWorkflows' | 'automationsRuns';

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
  const [manageView, setManageView] = useState<ManageView | null>(null);
  const [manageSegment, setManageSegment] = useState<'agents' | 'workflows'>('agents');
  const [automationsSegment, setAutomationsSegment] = useState<'automations' | 'runs'>('automations');
  const [fullAgents, setFullAgents] = useState<ManyAgent[]>([]);
  const [fullWorkflows, setFullWorkflows] = useState<CanvasWorkflow[]>([]);
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  // Horizontal wheel-scroll + drag for the Kanban columns row.
  const boardScrollRef = useRef<HTMLDivElement>(null);
  useHorizontalScroll(boardScrollRef);

  // Re-run on projectId change: currentProject loads async on boot, so the
  // first init() may run under 'default' before the real project resolves.
  // Without this dep the board would list the wrong project and a just-created
  // pipeline would "disappear" after a restart.
  useEffect(() => {
    void init();
  }, [init, projectId]);

  // The Automations management view needs full agent/workflow objects.
  useEffect(() => {
    if (manageView !== 'automationsRuns') return;
    void Promise.all([getManyAgents(projectId), getWorkflows(projectId)]).then(([a, w]) => {
      setFullAgents(a);
      setFullWorkflows(w);
    });
  }, [manageView, projectId]);

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
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--tertiary-text)' }}>
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  const toolbarBtn = (active: boolean) => ({
    background: active ? 'var(--bg-hover)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--secondary-text)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
  });

  return (
    <div className="flex flex-col h-full" style={{ minWidth: 0 }}>
      {/* Header toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => setShowDashboard(true)}
          className="inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded-md"
          style={toolbarBtn(showDashboard)}
          title={t('pipelines.dashboard_title')}
        >
          <LayoutDashboard size={14} />
          {t('pipelines.overview')}
        </button>

        <SectionGuideHelp sectionKey="pipelines" />

        {renaming ? (
          <div className="flex items-center gap-1.5">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the rename field the user just opened.
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              placeholder={t('pipelines.pipeline_name_placeholder')}
              className="text-sm rounded-md px-2 py-1 outline-none"
              style={{ background: 'var(--bg)', color: 'var(--primary-text)', border: '1px solid var(--accent)' }}
            />
            <button
              type="button"
              onClick={() => void handleRename()}
              className="text-xs px-2 py-1 rounded-md"
              style={{ background: 'var(--accent)', color: 'var(--dome-on-accent)', border: 'none', cursor: 'pointer' }}
            >
              {t('pipelines.save')}
            </button>
          </div>
        ) : (
          <div style={{ minWidth: 180 }}>
            <DomeSelectMenu
              value={activePipelineId ?? ''}
              onChange={(id) => {
                setShowDashboard(false);
                void selectPipeline(id);
              }}
              placeholder={t('pipelines.title')}
              options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        )}

        {creatingPipeline ? (
          <div className="flex items-center gap-1.5">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the pipeline-name field the user just opened.
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreatePipeline();
                if (e.key === 'Escape') setCreatingPipeline(false);
              }}
              placeholder={t('pipelines.pipeline_name_placeholder')}
              className="text-sm rounded-md px-2 py-1 outline-none"
              style={{ background: 'var(--bg)', color: 'var(--primary-text)', border: '1px solid var(--accent)' }}
            />
            <button
              type="button"
              onClick={() => void handleCreatePipeline()}
              className="text-xs px-2 py-1 rounded-md"
              style={{ background: 'var(--accent)', color: 'var(--dome-on-accent)', border: 'none', cursor: 'pointer' }}
            >
              {t('pipelines.create')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingPipeline(true)}
            className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded-md"
            style={toolbarBtn(false)}
            title={t('pipelines.new_pipeline')}
          >
            <Plus size={14} />
          </button>
        )}

        <DomeContextMenu
          align="start"
          trigger={
            <DomeButton iconOnly variant="ghost" size="sm" aria-label={t('pipelines.pipeline_actions')} disabled={busy}>
              <MoreVertical size={14} />
            </DomeButton>
          }
          items={[
            { label: t('pipelines.rename'), icon: <Pencil size={14} />, onClick: startRename, disabled: !activePipeline },
            { label: t('pipelines.export'), icon: <Download size={14} />, onClick: () => void handleExport(), disabled: !activePipeline },
            { label: t('pipelines.import'), icon: <Upload size={14} />, onClick: () => void handleImport(), separator: true },
            { label: t('pipelines.delete'), icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(true), variant: 'danger', disabled: !activePipeline, separator: true },
          ]}
        />

        <div className="flex-1" />

        {!showDashboard && (
          <button
            type="button"
            onClick={() => setSourcesOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded-md"
            style={toolbarBtn(sourcesOpen)}
            title={t('pipelines.data_sources')}
          >
            <Database size={14} />
            {t('pipelines.data_sources')}
          </button>
        )}

        {/* Manage agents/workflows and automations/runs from within Pipelines.
            Two grouped modals (DomeSegmentedControl inside each) keep the bar
            compact while still giving access to all four management surfaces. */}
        <DomeButton
          iconOnly
          variant="ghost"
          size="sm"
          aria-label={t('pipelines.manage_agents_workflows')}
          onClick={() => {
            setManageSegment('agents');
            setManageView('agentsWorkflows');
          }}
        >
          <Bot size={14} />
        </DomeButton>
        <DomeButton
          iconOnly
          variant="ghost"
          size="sm"
          aria-label={t('pipelines.manage_automations_runs')}
          onClick={() => { setAutomationsSegment('automations'); setManageView('automationsRuns'); }}
        >
          <Zap size={14} />
        </DomeButton>
      </div>

      {/* Body: dashboard overview or the active board */}
      {showDashboard ? (
        <PipelinesDashboard
          onOpenPipeline={(id) => { setShowDashboard(false); void selectPipeline(id); }}
          onOpenAgents={() => { setManageSegment('agents'); setManageView('agentsWorkflows'); }}
          onOpenWorkflows={() => { setManageSegment('workflows'); setManageView('agentsWorkflows'); }}
          onOpenAutomations={() => { setAutomationsSegment('automations'); setManageView('automationsRuns'); }}
          onOpenRuns={() => { setAutomationsSegment('runs'); setManageView('automationsRuns'); }}
        />
      ) : loadingBoard ? (
        <div className="flex items-center justify-center flex-1" style={{ color: 'var(--tertiary-text)' }}>
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : (
        <div className="flex flex-1" style={{ minWidth: 0, minHeight: 0 }}>
          {sourcesOpen && (
            <DataSourcePanel
              sources={sources}
              stages={sortedStages}
              onCreate={(input) => createSource(input)}
              onSync={(sourceId) => syncSource(sourceId)}
              onDelete={(sourceId) => deleteSource(sourceId)}
            />
          )}
          <div ref={boardScrollRef} className="flex gap-3 overflow-x-auto flex-1 p-4" style={{ minWidth: 0 }}>
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
          onClose={() => setOpenItem(null)}
          onSave={(patch) => updateItem({ id: liveOpenItem.id, ...patch })}
          onDelete={async () => {
            await deleteItem(liveOpenItem.id);
            setOpenItem(null);
          }}
          onRun={() => void runItem(liveOpenItem.id)}
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
            setManageSegment('workflows');
            setManageView('agentsWorkflows');
          }}
        />
      )}

      {manageView && (
        <DomeModal
          open
          onClose={() => {
            setManageView(null);
            // Refresh executor lists so newly created agents/workflows appear.
            void loadExecutors();
          }}
          title={
            manageView === 'agentsWorkflows'
              ? t('pipelines.manage_agents_workflows')
              : t('pipelines.manage_automations_runs')
          }
          size="full"
        >
          {/* Fill the modal body (85vh) instead of the old h-[70vh] cap so the
              management surfaces get the full workspace area. */}
          <div className="h-full min-h-0 overflow-hidden">
            {manageView === 'agentsWorkflows' && <AgentsWorkflowsModalView initialSegment={manageSegment} />}
            {manageView === 'automationsRuns' && (
              <AutomationsRunsModalView
                projectId={projectId}
                agents={fullAgents}
                workflows={fullWorkflows}
                initialSegment={automationsSegment}
              />
            )}
          </div>
        </DomeModal>
      )}

      {confirmDelete && activePipeline && (
        <DomeModal
          open
          onClose={() => setConfirmDelete(false)}
          title={t('pipelines.delete')}
          size="sm"
          footer={
            <>
              <DomeButton variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                {t('pipelines.cancel')}
              </DomeButton>
              <DomeButton variant="danger" onClick={() => void handleDelete()} disabled={busy}>
                {t('pipelines.delete')}
              </DomeButton>
            </>
          }
        >
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
            {t('pipelines.confirm_delete_pipeline')}
          </p>
        </DomeModal>
      )}
    </div>
  );
}
