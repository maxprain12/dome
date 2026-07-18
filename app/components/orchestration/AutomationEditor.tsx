import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  BotIcon as BotIcon,
  CableIcon as CableIcon,
  CalendarClockIcon as CalendarClockIcon,
  HandIcon as HandIcon,
  Layers01Icon as LayersIcon,
  Comment02Icon as MessageSquareTextIcon,
  SparklesIcon as SparklesIcon,
  WorkflowSquare01Icon as WorkflowIcon,
  Cancel01Icon as XIcon,
  ZapIcon as ZapIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { AutomationOutputMode } from '@/lib/automations/api';
import type { FeederRecord } from '@/lib/feeders/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import {
  type AutomationBindingDraft,
  type DraftState,
} from '@/components/hub/automations/automationsShared';

import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Bot = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BotIcon} {...props} />
);
const CalendarClock = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={CalendarClockIcon} {...props} />
);
const Layers = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={LayersIcon} {...props} />
);
const MessageSquareText = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={MessageSquareTextIcon} {...props} />
);
interface AutomationEditorProps {
  draft: DraftState;
  agents: ManyAgent[];
  workflows: CanvasWorkflow[];
  feeders: FeederRecord[];
  hubArtifacts: Array<{ resourceId: string; title: string }>;
  isNew: boolean;
  saving: boolean;
  onDraftChange: (partial: Partial<DraftState>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function weekdayName(weekday: number): string {
  const d = new Date(Date.UTC(1970, 0, 4 + weekday));
  return d.toLocaleDateString(getDateTimeLocaleTag(), { weekday: 'long', timeZone: 'UTC' });
}

function SectionCard({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-primary" aria-hidden />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      </div>
      {hint ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Full-screen automation editor: sectioned cards (target, trigger, input,
 * output/artifact sinks) plus a live summary panel that reads back the rule
 * in plain language — so the user always knows what will run, when and where
 * the output lands.
 */
export default function AutomationEditor({
  draft,
  agents,
  workflows,
  feeders,
  hubArtifacts,
  isNew,
  saving,
  onDraftChange,
  onSave,
  onCancel,
}: AutomationEditorProps) {
  const { t } = useTranslation();
  const isFeederTarget = draft.targetType === 'feeder';
  const showPromptAndOutput = !isFeederTarget;
  const canSave = Boolean(draft.title.trim() && draft.targetId) && !saving;

  const targetOptions =
    draft.targetType === 'agent'
      ? agents.map((a) => ({ value: a.id, label: a.name }))
      : draft.targetType === 'workflow'
        ? workflows.map((w) => ({ value: w.id, label: w.name }))
        : feeders.map((f) => {
            const artifactLabel =
              hubArtifacts.find((a) => a.resourceId === f.artifactResourceId)?.title ?? f.artifactResourceId;
            const tag = !f.approved
              ? ` · ${t('automation.feeder_not_approved')}`
              : !f.enabled
                ? ` · ${t('automation.feeder_disabled')}`
                : '';
            return { value: f.id, label: `${f.name} — ${artifactLabel}${tag}` };
          });

  const targetName = targetOptions.find((o) => o.value === draft.targetId)?.label ?? null;

  // ── Live summary sentences ──────────────────────────────────────────────────
  const targetTypeLabel =
    draft.targetType === 'agent'
      ? t('automation.agent')
      : draft.targetType === 'workflow'
        ? t('automation.workflow')
        : t('automation.feeder');

  const triggerSentence = (() => {
    if (draft.triggerType === 'manual') return t('orchestration.automation_editor.summary_manual');
    if (draft.triggerType === 'contextual') {
      const tags = draft.contextTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', ');
      return t('orchestration.automation_editor.summary_contextual', { tags: tags || '—' });
    }
    const hour = String(draft.hour).padStart(2, '0');
    if (draft.cadence === 'weekly') {
      return t('orchestration.automation_editor.summary_weekly', { weekday: weekdayName(draft.weekday), hour });
    }
    if (draft.cadence === 'cron-lite') {
      return t('orchestration.automation_editor.summary_interval', { minutes: draft.intervalMinutes });
    }
    return t('orchestration.automation_editor.summary_daily', { hour });
  })();

  const outputSentence = isFeederTarget
    ? t('orchestration.automation_editor.summary_feeder_output')
    : draft.outputMode === 'studio_output'
      ? t('automation.studio')
      : draft.outputMode === 'mixed'
        ? t('automation.mixed')
        : t('automation.output_chat_only');

  const activeBindings = draft.artifactBindings.filter((b) => b.enabled && b.artifactResourceId.trim());

  const updateBinding = (idx: number, patch: Partial<AutomationBindingDraft>) => {
    onDraftChange({
      artifactBindings: draft.artifactBindings.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <header
        className="flex shrink-0 items-center justify-between gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
          >
            <HugeiconsIcon icon={ZapIcon} className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground">
              {isNew ? t('automation.new_page_title') : t('automation.edit_page_title')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isNew ? t('automation.new_page_subtitle') : t('automation.edit_page_subtitle')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button"
  variant="outline"
  onClick={onCancel}
  size="sm">
            {t('automation.cancel')}
          </Button>
          <Button type="button"
  className="!bg-primary"
  loading={saving}
  disabled={!canSave}
  onClick={onSave}
  size="sm">
            {isNew ? t('automation.create_footer') : t('automation.save_changes')}
          </Button>
          <Button type="button"
  variant="ghost"
  onClick={onCancel}
  aria-label={t('ui.close')}
  size="icon-sm">
            <HugeiconsIcon icon={XIcon} className="size-4" />
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 p-6 md:grid-cols-[minmax(0,1fr)_290px]">
          {/* Form column */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* Target */}
            <SectionCard
              icon={Bot}
              title={t('automation.destination')}
              hint={isFeederTarget ? t('automation.feeder_target_hint') : undefined}
            >
              <div className="flex flex-col gap-3">
                {isNew ? (
                  <Tabs value={draft.targetType} onValueChange={(v) => onDraftChange({ targetType: v as DraftState['targetType'], targetId: '' })} className="min-w-0"><TabsList aria-label={t('automation.destination')} className="h-auto w-full max-w-full flex-wrap">{([
                      { value: 'agent', label: t('automation.agent'), icon: <HugeiconsIcon icon={BotIcon} className="size-3.5" aria-hidden /> },
                      { value: 'workflow', label: t('automation.workflow'), icon: <HugeiconsIcon icon={WorkflowIcon} className="size-3.5" aria-hidden /> },
                      { value: 'feeder', label: t('automation.feeder'), icon: <HugeiconsIcon icon={CableIcon} className="size-3.5" aria-hidden /> },
                    ]).map((opt: { value: string; label: string; icon?: ReactNode }) => (<TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1 px-2.5 py-1 text-xs">{opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}<span className="truncate">{opt.label}</span></TabsTrigger>))}</TabsList></Tabs>
                ) : null}
                {isNew ? (
                  <Select value={draft.targetId || null} onValueChange={(next) => { if (next != null) ((v) => onDraftChange({ targetId: v }))(next); }} items={targetOptions}><SelectTrigger className="w-full" aria-label={t('automation.destination')}><SelectValue placeholder={
                      isFeederTarget
                        ? t('automation.select_feeder')
                        : t('automation.select_agent_or_workflow', { type: targetTypeLabel })
                    } /></SelectTrigger><SelectContent>{(targetOptions).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select>
                ) : (
                  <p className="text-sm text-foreground">
                    {targetTypeLabel}
                    {targetName ? ` · ${targetName}` : ''}
                  </p>
                )}
                <Field className="gap-1.5 w-full"><FieldLabel htmlFor="fld-input-13" className="text-xs">{t('automation.name')}</FieldLabel><Input id="fld-input-13" className="text-sm" type="text" value={draft.title} onChange={(e) => onDraftChange({ title: e.target.value })} placeholder={t('automation.name_placeholder')} /></Field>
                <Field className="gap-1.5 w-full"><FieldLabel htmlFor="fld-input-14" className="text-xs">{t('automation.description')}</FieldLabel><Input id="fld-input-14" className="text-sm" type="text" value={draft.description} onChange={(e) => onDraftChange({ description: e.target.value })} placeholder={t('automation.description_placeholder')} /></Field>
              </div>
            </SectionCard>

            {/* Trigger */}
            <SectionCard icon={CalendarClock} title={t('automation.trigger')}>
              <div className="flex flex-col gap-3">
                <Tabs value={draft.triggerType} onValueChange={(v) => onDraftChange({ triggerType: v as DraftState['triggerType'] })} className="min-w-0"><TabsList aria-label={t('automation.trigger')} className="h-auto w-full max-w-full flex-wrap">{([
                    { value: 'manual', label: t('automation.manual'), icon: <HugeiconsIcon icon={HandIcon} className="size-3.5" aria-hidden /> },
                    { value: 'schedule', label: t('automation.scheduled'), icon: <HugeiconsIcon icon={CalendarClockIcon} className="size-3.5" aria-hidden /> },
                    { value: 'contextual', label: t('automation.contextual'), icon: <HugeiconsIcon icon={SparklesIcon} className="size-3.5" aria-hidden /> },
                  ]).map((opt: { value: string; label: string; icon?: ReactNode }) => (<TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1 px-2.5 py-1 text-xs">{opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}<span className="truncate">{opt.label}</span></TabsTrigger>))}</TabsList></Tabs>

                {draft.triggerType === 'contextual' ? (
                  <div className="flex flex-col gap-1.5">
                    <Field className="gap-1.5 w-full"><FieldLabel htmlFor="fld-input-15" className="text-xs">{t('automation.context_tags_label')}</FieldLabel><Input id="fld-input-15" className="text-sm" type="text" value={draft.contextTags} onChange={(e) => onDraftChange({ contextTags: e.target.value })} placeholder={t('automation.context_tags_placeholder')} /></Field>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {t('automation.context_tags_hint')}
                    </p>
                  </div>
                ) : null}

                {draft.triggerType === 'schedule' ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field className="gap-1.5"><FieldLabel className="text-xs">{t('automation.cadence')}</FieldLabel><Select value={draft.cadence ?? null} onValueChange={(next) => { if (next != null) ((v) => onDraftChange({ cadence: v as DraftState['cadence'] }))(next); }} items={[
                        { value: 'daily', label: t('automation.daily') },
                        { value: 'weekly', label: t('automation.weekly') },
                        { value: 'cron-lite', label: t('automation.cadence_interval') },
                      ]}><SelectTrigger className="w-full" aria-label={t('automation.cadence')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{([
                        { value: 'daily', label: t('automation.daily') },
                        { value: 'weekly', label: t('automation.weekly') },
                        { value: 'cron-lite', label: t('automation.cadence_interval') },
                      ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select></Field>
                    {draft.cadence !== 'cron-lite' ? (
                      <Field className="gap-1.5 w-full"><FieldLabel htmlFor="fld-input-16" className="text-xs">{t('automation.schedule_hour_label')}</FieldLabel><Input id="fld-input-16" className="text-sm" type="number" min={0} max={23} value={draft.hour} onChange={(e) => onDraftChange({ hour: parseInt(e.target.value) || 0 })} /></Field>
                    ) : (
                      <Field className="gap-1.5 w-full"><FieldLabel htmlFor="fld-input-17" className="text-xs">{t('automation.interval_minutes_label')}</FieldLabel><Input id="fld-input-17" className="text-sm" type="number" min={1} value={draft.intervalMinutes} onChange={(e) => onDraftChange({ intervalMinutes: parseInt(e.target.value) || 60 })} /></Field>
                    )}
                    {draft.cadence === 'weekly' ? (
                      <Field className="gap-1.5"><FieldLabel className="text-xs">{t('automation.weekday_label')}</FieldLabel><Select value={String(draft.weekday)} onValueChange={(next) => { if (next != null) ((v) => onDraftChange({ weekday: parseInt(v) }))(next); }} items={(['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun'] as const).map(
                          (dayKey, i) => ({ value: String(i + 1), label: t(`automation.${dayKey}`) }),
                        )}><SelectTrigger className="w-full" aria-label={t('automation.weekday_label')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{((['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun'] as const).map(
                          (dayKey, i) => ({ value: String(i + 1), label: t(`automation.${dayKey}`) }),
                        )).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select></Field>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </SectionCard>

            {/* Input prompt */}
            {showPromptAndOutput ? (
              <SectionCard icon={MessageSquareText} title={t('automation.base_prompt')}>
                <Textarea className="min-h-24 resize-y w-full text-sm resize-y" rows={5} value={draft.prompt} onChange={(e) => onDraftChange({ prompt: e.target.value })} placeholder={t('automation.base_prompt_placeholder')} />
              </SectionCard>
            ) : null}

            {/* Output + artifact sinks */}
            {showPromptAndOutput ? (
              <SectionCard
                icon={Layers}
                title={t('automation.artifact_sink_section')}
                hint={t('automation.artifact_sink_hint')}
              >
                <div className="flex flex-col gap-3">
                  <Field className="gap-1.5"><FieldLabel className="text-xs">{t('automation.output')}</FieldLabel><Select value={draft.outputMode ?? null} onValueChange={(next) => { if (next != null) ((v) => onDraftChange({ outputMode: v as AutomationOutputMode }))(next); }} items={[
                      { value: 'chat_only', label: t('automation.output_chat_only') },
                      { value: 'studio_output', label: t('automation.studio') },
                      { value: 'mixed', label: t('automation.mixed') },
                    ]}><SelectTrigger className="w-full" aria-label={t('automation.output')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{([
                      { value: 'chat_only', label: t('automation.output_chat_only') },
                      { value: 'studio_output', label: t('automation.studio') },
                      { value: 'mixed', label: t('automation.mixed') },
                    ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select></Field>

                  {draft.artifactBindings.map((b, idx) => (
                    <div
                      key={b.id ?? `draft-binding-${idx}`}
                      className="flex flex-col gap-2.5 rounded-xl p-3"
                      style={{ border: '1px solid var(--border)', background: 'var(--background)' }}
                    >
                      <Field className="gap-1.5"><FieldLabel className="text-xs">{t('automation.artifact_select')}</FieldLabel><Select value={b.artifactResourceId || null} onValueChange={(next) => { if (next != null) ((v) => updateBinding(idx, { artifactResourceId: v }))(next); }} items={hubArtifacts.map((a) => ({ value: a.resourceId, label: a.title }))}><SelectTrigger className="w-full" aria-label={t('automation.artifact_select')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{(hubArtifacts.map((a) => ({ value: a.resourceId, label: a.title }))).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select></Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field className="gap-1.5 w-full"><FieldLabel htmlFor="fld-input-18" className="text-xs">{t('automation.artifact_slot')}</FieldLabel><Input id="fld-input-18" className="text-sm" type="text" value={b.slot} onChange={(e) => updateBinding(idx, { slot: e.target.value })} /></Field>
                        <Field className="gap-1.5"><FieldLabel className="text-xs">{t('automation.artifact_policy')}</FieldLabel><Select value={b.updatePolicy ?? null} onValueChange={(next) => { if (next != null) ((v) => updateBinding(idx, { updatePolicy: v as AutomationBindingDraft['updatePolicy'] }))(next); }} items={[
                            { value: 'replace', label: t('automation.artifact_policy_replace') },
                            { value: 'merge_shallow', label: t('automation.artifact_policy_merge_shallow') },
                            { value: 'merge_deep', label: t('automation.artifact_policy_merge_deep') },
                            { value: 'append_array', label: t('automation.artifact_policy_append_array') },
                          ]}><SelectTrigger className="w-full" aria-label={t('automation.artifact_policy')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{([
                            { value: 'replace', label: t('automation.artifact_policy_replace') },
                            { value: 'merge_shallow', label: t('automation.artifact_policy_merge_shallow') },
                            { value: 'merge_deep', label: t('automation.artifact_policy_merge_deep') },
                            { value: 'append_array', label: t('automation.artifact_policy_append_array') },
                          ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select></Field>
                      </div>
                      <Field className="gap-1.5"><FieldLabel className="text-xs">{t('automation.artifact_extract_mode')}</FieldLabel><Select value={b.extractMode ?? null} onValueChange={(next) => { if (next != null) ((v) => updateBinding(idx, { extractMode: v as AutomationBindingDraft['extractMode'] }))(next); }} items={[
                          { value: 'json_fence', label: t('automation.extract_json_fence') },
                          { value: 'full_output', label: t('automation.extract_full_output') },
                        ]}><SelectTrigger className="w-full" aria-label={t('automation.artifact_extract_mode')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{([
                          { value: 'json_fence', label: t('automation.extract_json_fence') },
                          { value: 'full_output', label: t('automation.extract_full_output') },
                        ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectContent></Select></Field>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground">
                          {t('automation.state_enabled')}
                        </span>
                        <Switch checked={b.enabled} onCheckedChange={(v) => updateBinding(idx, { enabled: v })} size="sm" />
                        <Button type="button"
  variant="ghost"
  className="ml-auto text-destructive"
  onClick={() =>
                            onDraftChange({ artifactBindings: draft.artifactBindings.filter((_, i) => i !== idx) })
                          }
  size="sm">
                          {t('automation.artifact_remove_binding')}
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button type="button"
  variant="outline"
  className="w-full border-border"
  onClick={() =>
                      onDraftChange({
                        artifactBindings: [
                          ...draft.artifactBindings,
                          {
                            id: crypto.randomUUID(),
                            artifactResourceId: hubArtifacts[0]?.resourceId ?? '',
                            slot: 'default',
                            updatePolicy: 'replace',
                            extractMode: 'json_fence',
                            enabled: true,
                          },
                        ],
                      })
                    }
  size="sm">
                    {t('automation.artifact_add_binding')}
                  </Button>
                </div>
              </SectionCard>
            ) : null}
          </div>

          {/* Summary column */}
          <aside className="flex min-w-0 flex-col gap-4 md:sticky md:top-0 md:self-start">
            <div
              className="flex flex-col gap-3 rounded-2xl p-4"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('orchestration.automation_editor.summary_title')}
              </p>

              <div className="flex flex-col gap-2.5 text-xs leading-snug text-foreground">
                <div className="flex items-start gap-2">
                  {draft.targetType === 'agent' ? (
                    <HugeiconsIcon icon={BotIcon} className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                  ) : draft.targetType === 'workflow' ? (
                    <HugeiconsIcon icon={WorkflowIcon} className="mt-0.5 size-3.5 shrink-0 text-[var(--info)]" aria-hidden />
                  ) : (
                    <HugeiconsIcon icon={CableIcon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span>
                    {targetName
                      ? t('orchestration.automation_editor.summary_target', { type: targetTypeLabel, name: targetName })
                      : t('orchestration.automation_editor.summary_no_target', { type: targetTypeLabel })}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <HugeiconsIcon icon={CalendarClockIcon} className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
                  <span>{triggerSentence}</span>
                </div>
                <div className="flex items-start gap-2">
                  <HugeiconsIcon icon={MessageSquareTextIcon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{outputSentence}</span>
                </div>
                {activeBindings.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <HugeiconsIcon icon={LayersIcon} className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" aria-hidden />
                    <span>
                      {t('orchestration.automation_editor.summary_bindings', { count: activeBindings.length })}
                    </span>
                  </div>
                ) : null}
              </div>

              <div
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
              >
                <span className="text-xs font-medium text-foreground">
                  {draft.enabled ? t('automation.enabled_on_save') : t('automation.paused_on_save')}
                </span>
                <Switch checked={draft.enabled} onCheckedChange={(v) => onDraftChange({ enabled: v })} size="sm" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
