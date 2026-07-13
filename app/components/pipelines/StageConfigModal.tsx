import { lazy, Suspense, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';
import ManyIcon from '@/components/many/ManyIcon';
import { MANY_EXECUTOR_ID } from '@/lib/pipelines/types';
import {
  macroToken,
  PIPELINE_TEMPLATE_MACRO_GROUPS,
  PIPELINE_TEMPLATE_MACROS,
  type PipelineMacroGroup,
} from '@/lib/pipelines/templateMacros';
import type { ExecutionPolicy, PipelineStage, StageDeliverable } from '@/lib/pipelines/types';
import type { ExecutorOption } from '@/lib/store/usePipelinesStore';
import type { ManyAgent } from '@/types';

import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerFooter,
  DetailDrawerHeader,
} from '@/components/shared/DetailDrawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue , SelectGroup } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ReactNode } from 'react';
const AgentOnboarding = lazy(() => import('@/components/orchestration/AgentEditor'));

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
  const [deliverable, setDeliverable] = useState<StageDeliverable>(
    (stage.config?.deliverable as StageDeliverable | undefined) ?? 'auto',
  );
  const [executorKind, setExecutorKind] = useState<ExecutorKind>(stage.assignedWorkflowId ? 'workflow' : 'agent');
  // Agent stages default to Many; the user can switch to / create a custom agent.
  const [agentId, setAgentId] = useState<string | null>(stage.assignedAgentId ?? MANY_EXECUTOR_ID);
  const [workflowId, setWorkflowId] = useState<string | null>(stage.assignedWorkflowId ?? null);
  // Agents created inline (via "+ New agent") that aren't yet in the board list.
  const [extraAgents, setExtraAgents] = useState<ExecutorOption[]>([]);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const macroScrollRef = useRef<HTMLDivElement>(null);
  useHorizontalScroll(macroScrollRef);

  const insertMacro = (key: string) => {
    const token = macroToken(key);
    const el = templateRef.current;
    if (!el) {
      setRunInputTemplate((prev) => (prev ? `${prev} ${token}` : token));
      return;
    }
    const start = el.selectionStart ?? runInputTemplate.length;
    const end = el.selectionEnd ?? start;
    const next = runInputTemplate.slice(0, start) + token + runInputTemplate.slice(end);
    setRunInputTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const macroGroupLabel = (group: PipelineMacroGroup) => {
    switch (group) {
      case 'card':
        return t('pipelines.macro_group_card');
      case 'pipeline':
        return t('pipelines.macro_group_pipeline');
      case 'advanced':
        return t('pipelines.macro_group_advanced');
      default:
        return group;
    }
  };

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
        config: { ...(stage.config ?? {}), useMany, deliverable },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const showTemplate = policy !== 'manual_resolve';

  const agentOptions: { value: string; label: string; icon?: ReactNode }[] = [
    { value: MANY_EXECUTOR_ID, label: t('pipelines.use_many'), icon: <ManyIcon size={14} /> },
    // Inline-created agents first; the board list may already
    // include them after a refresh, so dedupe by id.
    ...extraAgents.map((a) => ({ value: a.id, label: a.name })),
    ...agents
      .filter((a) => !extraAgents.some((e) => e.id === a.id))
      .map((a) => ({ value: a.id, label: a.name })),
  ];

  if (creatingAgent) {
    return (
      <DetailDrawer open onOpenChange={(next) => { if (!next) setCreatingAgent(false); }}>
        <DetailDrawerContent size="xl" className="h-[85vh] max-h-[85vh]">
          <DetailDrawerHeader title={t('agents.new_agent')} />
          <DetailDrawerBody className="min-h-0 flex-1">
            <div className="h-full min-h-0">
              <Suspense fallback={null}>
                <AgentOnboarding
                  projectId={projectId}
                  onComplete={handleAgentCreated}
                  onCancel={() => setCreatingAgent(false)}
                />
              </Suspense>
            </div>
          </DetailDrawerBody>
        </DetailDrawerContent>
      </DetailDrawer>
    );
  }

  return (
    <DetailDrawer open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DetailDrawerContent size="lg">
        <DetailDrawerHeader title={t('pipelines.configure')} description={stage.title || undefined} />
        <DetailDrawerBody>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stage-title">{t('pipelines.stage_title_placeholder')}</Label>
          <Input id="stage-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <Field className="gap-1.5"><FieldLabel className="text-xs">{t('pipelines.execution_policy')}</FieldLabel><Select value={policy ?? null} onValueChange={(next) => { if (next != null) (setPolicy)(next); }} items={[
            { value: 'manual_resolve', label: t('pipelines.policy_manual_resolve') },
            { value: 'manual_agent', label: t('pipelines.policy_manual_agent') },
            { value: 'auto_agent', label: t('pipelines.policy_auto_agent') },
          ]}><SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectGroup>{([
            { value: 'manual_resolve', label: t('pipelines.policy_manual_resolve') },
            { value: 'manual_agent', label: t('pipelines.policy_manual_agent') },
            { value: 'auto_agent', label: t('pipelines.policy_auto_agent') },
          ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select></Field>

        {showTemplate && (
          <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
            <RadioGroup value={executorKind} onValueChange={(value) => setExecutorKind(value as 'agent' | 'workflow')} className="flex gap-3">
              <Field orientation="horizontal">
                <RadioGroupItem value="agent" id="executor-agent" />
                <FieldLabel htmlFor="executor-agent">{t('pipelines.stage_agent')}</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <RadioGroupItem value="workflow" id="executor-workflow" />
                <FieldLabel htmlFor="executor-workflow">Workflow</FieldLabel>
              </Field>
            </RadioGroup>

            {executorKind === 'agent' ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Select value={agentId ?? MANY_EXECUTOR_ID} onValueChange={(next) => { if (next != null) ((v) => setAgentId(v || null))(next); }} items={agentOptions}><SelectTrigger className="w-full"><SelectValue placeholder={t('pipelines.select_agent')} /></SelectTrigger><SelectContent><SelectGroup>{agentOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span></span></SelectItem>))}</SelectGroup></SelectContent></Select>
                </div>
                <Button variant="outline" onClick={() => setCreatingAgent(true)} size="sm">
                  <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
                  {t('pipelines.new_agent')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Select value={workflowId ?? ''} onValueChange={(next) => { if (next != null) ((v) => setWorkflowId(v || null))(next); }} items={[
                      { value: '', label: t('pipelines.select_workflow') },
                      ...workflows.map((w) => ({ value: w.id, label: w.name })),
                    ]}><SelectTrigger className="w-full"><SelectValue placeholder={t('pipelines.select_workflow')} /></SelectTrigger><SelectContent><SelectGroup>{([
                      { value: '', label: t('pipelines.select_workflow') },
                      ...workflows.map((w) => ({ value: w.id, label: w.name })),
                    ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select>
                </div>
                {onCreateWorkflow && (
                  <Button variant="outline" onClick={onCreateWorkflow} size="sm">
                    <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
                    {t('pipelines.new_workflow')}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {showTemplate && (
          <Field className="gap-1.5"><FieldLabel className="text-xs">{t('pipelines.stage_deliverable')}</FieldLabel><Select value={deliverable ?? null} onValueChange={(next) => { if (next != null) (setDeliverable)(next); }} items={[
              { value: 'auto', label: t('pipelines.deliverable_auto') },
              { value: 'artifact', label: t('pipelines.deliverable_artifact') },
              { value: 'text', label: t('pipelines.deliverable_text') },
            ]}><SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectGroup>{([
              { value: 'auto', label: t('pipelines.deliverable_auto') },
              { value: 'artifact', label: t('pipelines.deliverable_artifact') },
              { value: 'text', label: t('pipelines.deliverable_text') },
            ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select></Field>
        )}

        {showTemplate && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-input-template">{t('pipelines.run_input_template')}</Label>
              <Textarea
                id="run-input-template"
                ref={templateRef}
                value={runInputTemplate}
                onChange={(e) => setRunInputTemplate(e.target.value)}
                rows={4}
                placeholder={t('pipelines.run_input_template_hint')}
                className="font-mono text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                {t('pipelines.run_input_context_auto_note')}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('pipelines.run_input_macros_title')}
              </span>
              {PIPELINE_TEMPLATE_MACRO_GROUPS.map((group) => {
                const macros = PIPELINE_TEMPLATE_MACROS.filter((m) => m.group === group);
                if (macros.length === 0) return null;
                return (
                  <div key={group} className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {macroGroupLabel(group)}
                    </span>
                    <div ref={macroScrollRef} className="flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-0.5">
                      {macros.map((macro) => (
                        <Button
                          key={macro.key}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => insertMacro(macro.key)}
                          className="shrink-0 font-mono text-[11px]"
                          title={macroToken(macro.key)}
                        >
                          {t(`pipelines.${macro.labelKey}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Field orientation="horizontal">
          <Checkbox id="terminal-stage" checked={isTerminal} onCheckedChange={setIsTerminal} />
          <FieldLabel htmlFor="terminal-stage">{t('pipelines.terminal_stage')}</FieldLabel>
        </Field>
      </div>
        </DetailDrawerBody>
        <DetailDrawerFooter>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" className="text-destructive hover:text-destructive" />}>
              <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
              {t('pipelines.delete')}
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>{t('pipelines.delete')}</AlertDialogTitle>
                <AlertDialogDescription>{stage.title}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('pipelines.cancel')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>{t('pipelines.delete')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex-1" />
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? t('pipelines.saving') : t('pipelines.save')}
          </Button>
        </DetailDrawerFooter>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
