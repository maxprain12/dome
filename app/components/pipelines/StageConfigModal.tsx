import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import ManyIcon from '@/components/many/ManyIcon';
import { MANY_EXECUTOR_ID } from '@/lib/pipelines/types';
import type { ExecutionPolicy, PipelineStage } from '@/lib/pipelines/types';
import type { ExecutorOption } from '@/lib/store/usePipelinesStore';
import type { ManyAgent } from '@/types';

const AgentOnboarding = lazy(() => import('@/components/agents/AgentOnboarding'));

interface Props {
  stage: PipelineStage;
  agents: ExecutorOption[];
  workflows: ExecutorOption[];
  projectId?: string;
  onClose: () => void;
  onSave: (patch: Partial<PipelineStage>) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Called after a new agent is created so the board can refresh its lists. */
  onExecutorsChanged?: () => void;
  /** Open the workflow library (workflow authoring is canvas-based). */
  onCreateWorkflow?: () => void;
}

type ExecutorKind = 'agent' | 'workflow';

export default function StageConfigModal({
  stage,
  agents,
  workflows,
  projectId = 'default',
  onClose,
  onSave,
  onDelete,
  onExecutorsChanged,
  onCreateWorkflow,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(stage.title);
  const [policy, setPolicy] = useState<ExecutionPolicy>(stage.executionPolicy);
  const [isTerminal, setIsTerminal] = useState(stage.isTerminal);
  const [runInputTemplate, setRunInputTemplate] = useState(stage.runInputTemplate ?? '');
  const [executorKind, setExecutorKind] = useState<ExecutorKind>(stage.assignedWorkflowId ? 'workflow' : 'agent');
  // Agent stages default to Many; the user can switch to / create a custom agent.
  const [agentId, setAgentId] = useState<string | null>(stage.assignedAgentId ?? MANY_EXECUTOR_ID);
  const [workflowId, setWorkflowId] = useState<string | null>(stage.assignedWorkflowId ?? null);
  // Agents created inline (via "+ New agent") that aren't yet in the board list.
  const [extraAgents, setExtraAgents] = useState<ExecutorOption[]>([]);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAgentCreated = (agent: ManyAgent) => {
    setExtraAgents((prev) => [{ id: agent.id, name: agent.name }, ...prev]);
    setAgentId(agent.id);
    setCreatingAgent(false);
    onExecutorsChanged?.();
  };

  const save = async () => {
    setSaving(true);
    try {
      const usesExecutor = policy !== 'manual_resolve';
      const agentSelected = usesExecutor && executorKind === 'agent';
      // "Use Many" is NOT a real agent row, so it must never be written to
      // assigned_agent_id (FK → many_agents). Persist it as a flag in config
      // and keep assigned_agent_id NULL.
      const useMany = agentSelected && agentId === MANY_EXECUTOR_ID;
      const realAgentId = agentSelected && agentId !== MANY_EXECUTOR_ID ? agentId : null;
      await onSave({
        title: title.trim() || stage.title,
        executionPolicy: policy,
        isTerminal,
        runInputTemplate: runInputTemplate.trim() || null,
        assignedAgentId: realAgentId,
        assignedWorkflowId: usesExecutor && executorKind === 'workflow' ? workflowId : null,
        config: { ...(stage.config ?? {}), useMany },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const showTemplate = policy !== 'manual_resolve';

  if (creatingAgent) {
    return (
      <DomeModal open onClose={() => setCreatingAgent(false)} title={t('agents.new_agent')} size="full">
        <div className="h-full min-h-0">
          <Suspense fallback={null}>
            <AgentOnboarding
              projectId={projectId}
              onComplete={handleAgentCreated}
              onCancel={() => setCreatingAgent(false)}
            />
          </Suspense>
        </div>
      </DomeModal>
    );
  }

  return (
    <DomeModal
      open
      onClose={onClose}
      title={t('pipelines.configure')}
      subtitle={stage.title}
      size="md"
      footer={
        <>
          <DomeButton variant="ghost" onClick={() => void onDelete()}>
            <Trash2 className="size-4" />
            {t('pipelines.delete')}
          </DomeButton>
          <div style={{ flex: 1 }} />
          <DomeButton variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? t('pipelines.saving') : t('pipelines.save')}
          </DomeButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--tertiary-text)' }}>
            {t('pipelines.stage_title_placeholder')}
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-sm rounded-md px-2 py-1.5 outline-none"
            style={{ background: 'var(--bg)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
          />
        </label>

        <DomeSelectMenu<ExecutionPolicy>
          label={t('pipelines.execution_policy')}
          value={policy}
          onChange={setPolicy}
          options={[
            { value: 'manual_resolve', label: t('pipelines.policy_manual_resolve') },
            { value: 'manual_agent', label: t('pipelines.policy_manual_agent') },
            { value: 'auto_agent', label: t('pipelines.policy_auto_agent') },
          ]}
        />

        {showTemplate && (
          <div className="flex flex-col gap-2 rounded-md p-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div className="flex gap-3">
              <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--primary-text)' }}>
                <input
                  type="radio"
                  name="executor-kind"
                  checked={executorKind === 'agent'}
                  onChange={() => setExecutorKind('agent')}
                />
                {t('pipelines.stage_agent')}
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--primary-text)' }}>
                <input
                  type="radio"
                  name="executor-kind"
                  checked={executorKind === 'workflow'}
                  onChange={() => setExecutorKind('workflow')}
                />
                Workflow
              </label>
            </div>

            {executorKind === 'agent' ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <DomeSelectMenu
                    value={agentId ?? MANY_EXECUTOR_ID}
                    onChange={(v) => setAgentId(v || null)}
                    placeholder={t('pipelines.select_agent')}
                    options={[
                      { value: MANY_EXECUTOR_ID, label: t('pipelines.use_many'), icon: <ManyIcon size={14} /> },
                      // Inline-created agents first; the board list may already
                      // include them after a refresh, so dedupe by id.
                      ...extraAgents.map((a) => ({ value: a.id, label: a.name })),
                      ...agents
                        .filter((a) => !extraAgents.some((e) => e.id === a.id))
                        .map((a) => ({ value: a.id, label: a.name })),
                    ]}
                  />
                </div>
                <DomeButton variant="outline" size="sm" onClick={() => setCreatingAgent(true)}>
                  <Plus className="size-3.5" />
                  {t('pipelines.new_agent')}
                </DomeButton>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <DomeSelectMenu
                    value={workflowId ?? ''}
                    onChange={(v) => setWorkflowId(v || null)}
                    placeholder={t('pipelines.select_workflow')}
                    options={[
                      { value: '', label: t('pipelines.select_workflow') },
                      ...workflows.map((w) => ({ value: w.id, label: w.name })),
                    ]}
                  />
                </div>
                {onCreateWorkflow && (
                  <DomeButton variant="outline" size="sm" onClick={onCreateWorkflow}>
                    <Plus className="size-3.5" />
                    {t('pipelines.new_workflow')}
                  </DomeButton>
                )}
              </div>
            )}
          </div>
        )}

        {showTemplate && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--tertiary-text)' }}>
              {t('pipelines.run_input_template')}
            </span>
            <textarea
              value={runInputTemplate}
              onChange={(e) => setRunInputTemplate(e.target.value)}
              rows={4}
              placeholder={t('pipelines.run_input_template_hint')}
              className="text-xs font-mono rounded-md px-2 py-1.5 outline-none resize-y"
              style={{ background: 'var(--bg)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
            />
            <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
              {t('pipelines.run_input_template_hint')}
            </span>
          </label>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isTerminal} onChange={(e) => setIsTerminal(e.target.checked)} />
          <span className="text-sm" style={{ color: 'var(--primary-text)' }}>
            {t('pipelines.terminal_stage')}
          </span>
        </label>
      </div>
    </DomeModal>
  );
}
