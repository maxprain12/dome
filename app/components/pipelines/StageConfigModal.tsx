import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon } from '@hugeicons/core-free-icons';
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

import { InlineDetailCard } from '@/components/shared/InlineDetailCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue , SelectGroup } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ReactNode } from 'react';

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

export default function StageConfigModal({
  stage,
  agents,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(stage.title);
  const [policy, setPolicy] = useState<ExecutionPolicy>(stage.executionPolicy);
  const [isTerminal, setIsTerminal] = useState(stage.isTerminal);
  const [runInputTemplate, setRunInputTemplate] = useState(stage.runInputTemplate ?? '');
  const [deliverable, setDeliverable] = useState<StageDeliverable>(
    (stage.config?.deliverable as StageDeliverable | undefined) ?? 'auto',
  );
  const [agentId, setAgentId] = useState<string | null>((stage.config?.cloudManyId as string | undefined) ?? MANY_EXECUTOR_ID);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const save = async () => {
    setSaving(true);
    try {
      const usesExecutor = policy !== 'manual_resolve';
      const agentSelected = usesExecutor;
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
        assignedAgentId: null,
        assignedWorkflowId: null,
        config: { ...(stage.config ?? {}), useMany, cloudManyId:realAgentId, deliverable },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const showTemplate = policy !== 'manual_resolve';

  const agentOptions: { value: string; label: string; icon?: ReactNode }[] = [
    { value: MANY_EXECUTOR_ID, label: t('pipelines.use_many'), icon: <ManyIcon size={14} /> },
    ...agents.map(a=>({value:a.id,label:a.name})),
  ];


  return (
    <>
    <InlineDetailCard
      onClose={onClose}
      title={t('pipelines.configure')}
      description={stage.title || undefined}
      containerName="pipeline-stage"
      footer={
        <>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
            {t('pipelines.delete')}
          </Button>
          <div className="flex-1" />
          <Button onClick={() => save()} disabled={saving}>
            {saving ? t('pipelines.saving') : t('pipelines.save')}
          </Button>
        </>
      }
    >
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
          <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-3">
            <Field><FieldLabel>{t('manys.title')}</FieldLabel><Select value={agentId ?? MANY_EXECUTOR_ID} onValueChange={next=>{if(next)setAgentId(next);}} items={agentOptions}><SelectTrigger><SelectValue placeholder={t('manys.local')}>{agentOptions.find(option=>option.value===(agentId??MANY_EXECUTOR_ID))?.label??t('manys.local')}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{agentOptions.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
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
    </InlineDetailCard>
    <ConfirmDialog
      isOpen={confirmDelete}
      title={t('pipelines.delete')}
      message={stage.title}
      confirmLabel={t('pipelines.delete')}
      cancelLabel={t('pipelines.cancel')}
      variant="danger"
      onConfirm={() => {
        void onDelete();
        setConfirmDelete(false);
      }}
      onCancel={() => setConfirmDelete(false)}
    />
    </>
  );
}
