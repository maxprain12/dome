import { useTranslation } from 'react-i18next';
import {
  Bot,
  Cable,
  CalendarClock,
  Hand,
  Layers,
  MessageSquareText,
  Sparkles,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import type { AutomationOutputMode } from '@/lib/automations/api';
import type { FeederRecord } from '@/lib/feeders/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import DomeButton from '@/components/ui/DomeButton';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import DomeToggle from '@/components/ui/DomeToggle';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import {
  type AutomationBindingDraft,
  type DraftState,
} from '@/components/hub/automations/automationsShared';

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
  icon: typeof Zap;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5" style={{ color: 'var(--dome-accent)' }} aria-hidden />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
          {title}
        </h2>
      </div>
      {hint ? (
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
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
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--dome-bg)' }}>
      {/* Header */}
      <header
        className="flex shrink-0 items-center justify-between gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
          >
            <Zap className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
              {isNew ? t('automation.new_page_title') : t('automation.edit_page_title')}
            </h1>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {isNew ? t('automation.new_page_subtitle') : t('automation.edit_page_subtitle')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DomeButton type="button" variant="outline" size="sm" onClick={onCancel}>
            {t('automation.cancel')}
          </DomeButton>
          <DomeButton
            type="button"
            variant="primary"
            size="sm"
            className="!bg-[var(--dome-accent)]"
            loading={saving}
            disabled={!canSave}
            onClick={onSave}
          >
            {isNew ? t('automation.create_footer') : t('automation.save_changes')}
          </DomeButton>
          <DomeButton type="button" variant="ghost" size="sm" iconOnly onClick={onCancel} aria-label={t('ui.close')}>
            <X className="size-4" />
          </DomeButton>
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
                  <DomeSegmentedControl
                    size="sm"
                    aria-label={t('automation.destination')}
                    options={[
                      { value: 'agent', label: t('automation.agent'), icon: <Bot className="size-3.5" aria-hidden /> },
                      { value: 'workflow', label: t('automation.workflow'), icon: <Workflow className="size-3.5" aria-hidden /> },
                      { value: 'feeder', label: t('automation.feeder'), icon: <Cable className="size-3.5" aria-hidden /> },
                    ]}
                    value={draft.targetType}
                    onChange={(v) => onDraftChange({ targetType: v as DraftState['targetType'], targetId: '' })}
                  />
                ) : null}
                {isNew ? (
                  <DomeSelectMenu
                    value={draft.targetId || null}
                    options={targetOptions}
                    onChange={(v) => onDraftChange({ targetId: v })}
                    placeholder={
                      isFeederTarget
                        ? t('automation.select_feeder')
                        : t('automation.select_agent_or_workflow', { type: targetTypeLabel })
                    }
                    aria-label={t('automation.destination')}
                  />
                ) : (
                  <p className="text-sm" style={{ color: 'var(--dome-text)' }}>
                    {targetTypeLabel}
                    {targetName ? ` · ${targetName}` : ''}
                  </p>
                )}
                <DomeInput
                  label={t('automation.name')}
                  type="text"
                  value={draft.title}
                  onChange={(e) => onDraftChange({ title: e.target.value })}
                  placeholder={t('automation.name_placeholder')}
                  className="w-full"
                  inputClassName="text-sm"
                />
                <DomeInput
                  label={t('automation.description')}
                  type="text"
                  value={draft.description}
                  onChange={(e) => onDraftChange({ description: e.target.value })}
                  placeholder={t('automation.description_placeholder')}
                  className="w-full"
                  inputClassName="text-sm"
                />
              </div>
            </SectionCard>

            {/* Trigger */}
            <SectionCard icon={CalendarClock} title={t('automation.trigger')}>
              <div className="flex flex-col gap-3">
                <DomeSegmentedControl
                  size="sm"
                  aria-label={t('automation.trigger')}
                  options={[
                    { value: 'manual', label: t('automation.manual'), icon: <Hand className="size-3.5" aria-hidden /> },
                    { value: 'schedule', label: t('automation.scheduled'), icon: <CalendarClock className="size-3.5" aria-hidden /> },
                    { value: 'contextual', label: t('automation.contextual'), icon: <Sparkles className="size-3.5" aria-hidden /> },
                  ]}
                  value={draft.triggerType}
                  onChange={(v) => onDraftChange({ triggerType: v as DraftState['triggerType'] })}
                />

                {draft.triggerType === 'contextual' ? (
                  <div className="flex flex-col gap-1.5">
                    <DomeInput
                      label={t('automation.context_tags_label')}
                      type="text"
                      value={draft.contextTags}
                      onChange={(e) => onDraftChange({ contextTags: e.target.value })}
                      placeholder={t('automation.context_tags_placeholder')}
                      className="w-full"
                      inputClassName="text-sm"
                    />
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                      {t('automation.context_tags_hint')}
                    </p>
                  </div>
                ) : null}

                {draft.triggerType === 'schedule' ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DomeSelectMenu
                      label={t('automation.cadence')}
                      value={draft.cadence}
                      options={[
                        { value: 'daily', label: t('automation.daily') },
                        { value: 'weekly', label: t('automation.weekly') },
                        { value: 'cron-lite', label: t('automation.cadence_interval') },
                      ]}
                      onChange={(v) => onDraftChange({ cadence: v as DraftState['cadence'] })}
                      aria-label={t('automation.cadence')}
                    />
                    {draft.cadence !== 'cron-lite' ? (
                      <DomeInput
                        label={t('automation.schedule_hour_label')}
                        type="number"
                        min={0}
                        max={23}
                        value={draft.hour}
                        onChange={(e) => onDraftChange({ hour: parseInt(e.target.value) || 0 })}
                        className="w-full"
                        inputClassName="text-sm"
                      />
                    ) : (
                      <DomeInput
                        label={t('automation.interval_minutes_label')}
                        type="number"
                        min={1}
                        value={draft.intervalMinutes}
                        onChange={(e) => onDraftChange({ intervalMinutes: parseInt(e.target.value) || 60 })}
                        className="w-full"
                        inputClassName="text-sm"
                      />
                    )}
                    {draft.cadence === 'weekly' ? (
                      <DomeSelectMenu
                        label={t('automation.weekday_label')}
                        value={String(draft.weekday)}
                        options={(['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun'] as const).map(
                          (dayKey, i) => ({ value: String(i + 1), label: t(`automation.${dayKey}`) }),
                        )}
                        onChange={(v) => onDraftChange({ weekday: parseInt(v) })}
                        aria-label={t('automation.weekday_label')}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </SectionCard>

            {/* Input prompt */}
            {showPromptAndOutput ? (
              <SectionCard icon={MessageSquareText} title={t('automation.base_prompt')}>
                <DomeTextarea
                  rows={5}
                  value={draft.prompt}
                  onChange={(e) => onDraftChange({ prompt: e.target.value })}
                  placeholder={t('automation.base_prompt_placeholder')}
                  className="w-full"
                  textareaClassName="text-sm resize-y"
                />
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
                  <DomeSelectMenu
                    label={t('automation.output')}
                    value={draft.outputMode}
                    options={[
                      { value: 'chat_only', label: t('automation.output_chat_only') },
                      { value: 'studio_output', label: t('automation.studio') },
                      { value: 'mixed', label: t('automation.mixed') },
                    ]}
                    onChange={(v) => onDraftChange({ outputMode: v as AutomationOutputMode })}
                    aria-label={t('automation.output')}
                  />

                  {draft.artifactBindings.map((b, idx) => (
                    <div
                      key={b.id ?? `draft-binding-${idx}`}
                      className="flex flex-col gap-2.5 rounded-xl p-3"
                      style={{ border: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
                    >
                      <DomeSelectMenu
                        label={t('automation.artifact_select')}
                        value={b.artifactResourceId || null}
                        options={hubArtifacts.map((a) => ({ value: a.resourceId, label: a.title }))}
                        onChange={(v) => updateBinding(idx, { artifactResourceId: v })}
                        placeholder="—"
                        aria-label={t('automation.artifact_select')}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <DomeInput
                          label={t('automation.artifact_slot')}
                          type="text"
                          value={b.slot}
                          onChange={(e) => updateBinding(idx, { slot: e.target.value })}
                          className="w-full"
                          inputClassName="text-sm"
                        />
                        <DomeSelectMenu
                          label={t('automation.artifact_policy')}
                          value={b.updatePolicy}
                          options={[
                            { value: 'replace', label: t('automation.artifact_policy_replace') },
                            { value: 'merge_shallow', label: t('automation.artifact_policy_merge_shallow') },
                            { value: 'merge_deep', label: t('automation.artifact_policy_merge_deep') },
                            { value: 'append_array', label: t('automation.artifact_policy_append_array') },
                          ]}
                          onChange={(v) => updateBinding(idx, { updatePolicy: v as AutomationBindingDraft['updatePolicy'] })}
                          aria-label={t('automation.artifact_policy')}
                        />
                      </div>
                      <DomeSelectMenu
                        label={t('automation.artifact_extract_mode')}
                        value={b.extractMode}
                        options={[
                          { value: 'json_fence', label: t('automation.extract_json_fence') },
                          { value: 'full_output', label: t('automation.extract_full_output') },
                        ]}
                        onChange={(v) => updateBinding(idx, { extractMode: v as AutomationBindingDraft['extractMode'] })}
                        aria-label={t('automation.artifact_extract_mode')}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: 'var(--dome-text)' }}>
                          {t('automation.state_enabled')}
                        </span>
                        <DomeToggle checked={b.enabled} onChange={(v) => updateBinding(idx, { enabled: v })} size="sm" />
                        <DomeButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto text-[var(--dome-error)]"
                          onClick={() =>
                            onDraftChange({ artifactBindings: draft.artifactBindings.filter((_, i) => i !== idx) })
                          }
                        >
                          {t('automation.artifact_remove_binding')}
                        </DomeButton>
                      </div>
                    </div>
                  ))}

                  <DomeButton
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full border-[var(--dome-border)]"
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
                  >
                    {t('automation.artifact_add_binding')}
                  </DomeButton>
                </div>
              </SectionCard>
            ) : null}
          </div>

          {/* Summary column */}
          <aside className="flex min-w-0 flex-col gap-4 md:sticky md:top-0 md:self-start">
            <div
              className="flex flex-col gap-3 rounded-2xl p-4"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                {t('orchestration.automation_editor.summary_title')}
              </p>

              <div className="flex flex-col gap-2.5 text-xs leading-snug" style={{ color: 'var(--dome-text)' }}>
                <div className="flex items-start gap-2">
                  {draft.targetType === 'agent' ? (
                    <Bot className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
                  ) : draft.targetType === 'workflow' ? (
                    <Workflow className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--info)' }} aria-hidden />
                  ) : (
                    <Cable className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                  )}
                  <span>
                    {targetName
                      ? t('orchestration.automation_editor.summary_target', { type: targetTypeLabel, name: targetName })
                      : t('orchestration.automation_editor.summary_no_target', { type: targetTypeLabel })}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
                  <span>{triggerSentence}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquareText className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                  <span>{outputSentence}</span>
                </div>
                {activeBindings.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <Layers className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--success)' }} aria-hidden />
                    <span>
                      {t('orchestration.automation_editor.summary_bindings', { count: activeBindings.length })}
                    </span>
                  </div>
                ) : null}
              </div>

              <div
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
              >
                <span className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                  {draft.enabled ? t('automation.enabled_on_save') : t('automation.paused_on_save')}
                </span>
                <DomeToggle checked={draft.enabled} onChange={(v) => onDraftChange({ enabled: v })} size="sm" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
