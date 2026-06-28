/** Automation create/edit drawer (03/T02 — extracted from AutomationsWorkspaceView.tsx). */

import { useTranslation } from 'react-i18next';
import { Bot, Cable, Layers, Workflow, X } from 'lucide-react';
import type { AutomationOutputMode } from '@/lib/automations/api';
import type { FeederRecord } from '@/lib/feeders/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import DomeButton from '@/components/ui/DomeButton';
import DomeDrawerLayout from '@/components/ui/DomeDrawerLayout';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import { DomeSelect } from '@/components/ui/DomeSelect';
import DomeToggle from '@/components/ui/DomeToggle';
import DomeSubpageFooter from '@/components/ui/DomeSubpageFooter';
import { type AutomationBindingDraft, type DraftState } from './automationsShared';

interface AutomationEditDrawerProps {
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
  /** When true, renders only the form fields — no header, no footer, no outer wrapper */
  embedded?: boolean;
}

export default function AutomationEditDrawer({
  draft, agents, workflows, feeders, hubArtifacts, isNew, saving, onDraftChange, onSave, onCancel, embedded,
}: AutomationEditDrawerProps) {
  const { t } = useTranslation();
  const isFeederTarget = draft.targetType === 'feeder';
  // Feeders ignore LLM prompt/output/artifact bindings — they have their own merge logic.
  const showPromptAndOutput = !isFeederTarget;
  const formFields = (
    <div className={embedded ? 'flex flex-col gap-4' : 'p-5 flex flex-col gap-4'}>

        {/* Target — only shown when creating */}
        {isNew ? (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.destination')}</label>
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
            {isFeederTarget ? (
              <>
                <DomeSelect
                  value={draft.targetId}
                  onChange={(e) => onDraftChange({ targetId: e.target.value })}
                  className="w-full"
                  selectClassName="text-sm"
                >
                  <option value="">{t('automation.select_feeder')}</option>
                  {feeders.length === 0 ? (
                    <option value="" disabled>{t('automation.feeder_empty_options')}</option>
                  ) : (
                    feeders.map((f) => {
                      const artifactLabel =
                        hubArtifacts.find((a) => a.resourceId === f.artifactResourceId)?.title ?? f.artifactResourceId;
                      const tag = !f.approved
                        ? ` · ${t('automation.feeder_not_approved')}`
                        : !f.enabled
                          ? ` · ${t('automation.feeder_disabled')}`
                          : '';
                      return (
                        <option key={f.id} value={f.id} disabled={!f.approved || !f.enabled}>
                          {f.name} — {artifactLabel}{tag}
                        </option>
                      );
                    })
                  )}
                </DomeSelect>
                <p className="text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('automation.feeder_target_hint')}
                </p>
              </>
            ) : (
              <DomeSelect
                value={draft.targetId}
                onChange={(e) => onDraftChange({ targetId: e.target.value })}
                className="w-full"
                selectClassName="text-sm"
              >
                <option value="">{t('automation.select_agent_or_workflow', { type: draft.targetType === 'agent' ? t('automation.agent') : t('automation.workflow') })}</option>
                {draft.targetType === 'agent'
                  ? agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)
                  : workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </DomeSelect>
            )}
          </div>
        ) : null}

        {/* Title */}
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

        <DomeSelect
          label={t('automation.trigger')}
          value={draft.triggerType}
          onChange={(e) => onDraftChange({ triggerType: e.target.value as DraftState['triggerType'] })}
          className="w-full"
          selectClassName="text-sm"
        >
          <option value="manual">{t('automation.manual')}</option>
          <option value="schedule">{t('automation.scheduled')}</option>
          <option value="contextual">{t('automation.contextual')}</option>
        </DomeSelect>

        {draft.triggerType === 'contextual' && (
          <div
            className="flex flex-col gap-1.5 rounded-xl p-3"
            style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
          >
            <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
              {t('automation.context_tags_label')}
            </label>
            <DomeInput
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
        )}

        {/* Schedule options */}
        {draft.triggerType === 'schedule' && (
          <div className="flex flex-col gap-3 rounded-xl p-3" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.cadence')}</label>
              <DomeSelect
                value={draft.cadence}
                onChange={(e) => onDraftChange({ cadence: e.target.value as DraftState['cadence'] })}
                className="w-full"
                selectClassName="text-sm"
              >
                <option value="daily">{t('automation.daily')}</option>
                <option value="weekly">{t('automation.weekly')}</option>
                <option value="cron-lite">{t('automation.cadence_interval')}</option>
              </DomeSelect>
            </div>
            {draft.cadence !== 'cron-lite' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.schedule_hour_label')}</label>
                <DomeInput
                  type="number"
                  min={0}
                  max={23}
                  value={draft.hour}
                  onChange={(e) => onDraftChange({ hour: parseInt(e.target.value) || 0 })}
                  className="w-full"
                  inputClassName="text-sm"
                />
              </div>
            )}
            {draft.cadence === 'weekly' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.weekday_label')}</label>
                <DomeSelect
                  value={draft.weekday}
                  onChange={(e) => onDraftChange({ weekday: parseInt(e.target.value) })}
                  className="w-full"
                  selectClassName="text-sm"
                >
                  {(['day_mon','day_tue','day_wed','day_thu','day_fri','day_sat','day_sun'] as const).map((dayKey, i) => (
                    <option key={dayKey} value={i + 1}>{t(`automation.${dayKey}`)}</option>
                  ))}
                </DomeSelect>
              </div>
            )}
            {draft.cadence === 'cron-lite' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.interval_minutes_label')}</label>
                <DomeInput
                  type="number"
                  min={1}
                  value={draft.intervalMinutes}
                  onChange={(e) => onDraftChange({ intervalMinutes: parseInt(e.target.value) || 60 })}
                  className="w-full"
                  inputClassName="text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* Prompt — agents/workflows only */}
        {showPromptAndOutput && (
          <DomeTextarea
            label={t('automation.base_prompt')}
            rows={4}
            value={draft.prompt}
            onChange={(e) => onDraftChange({ prompt: e.target.value })}
            placeholder={t('automation.base_prompt_placeholder')}
            className="w-full"
            textareaClassName="text-sm resize-none"
          />
        )}

        {showPromptAndOutput && (
        <div
          className="flex flex-col gap-3 rounded-xl p-3"
          style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        >
          <div className="flex items-center gap-2">
            <Layers className="size-4 shrink-0" style={{ color: 'var(--dome-accent)' }} aria-hidden />
            <span className="text-xs font-semibold" style={{ color: 'var(--dome-text)' }}>
              {t('automation.artifact_sink_section')}
            </span>
          </div>
          <p className="text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
            {t('automation.artifact_sink_hint')}
          </p>

          {draft.artifactBindings.map((b, idx) => (
            <div
              key={b.id ?? `draft-binding-${idx}`}
              className="flex flex-col gap-2 rounded-lg p-2"
              style={{ border: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
            >
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium" style={{ color: 'var(--dome-text)' }}>
                  {t('automation.artifact_select')}
                </label>
                <DomeSelect
                  value={b.artifactResourceId}
                  onChange={(e) => {
                    const v = e.target.value;
                    onDraftChange({
                      artifactBindings: draft.artifactBindings.map((row, i) =>
                        i === idx ? { ...row, artifactResourceId: v } : row,
                      ),
                    });
                  }}
                  className="w-full"
                  selectClassName="text-sm"
                >
                  <option value="">—</option>
                  {hubArtifacts.map((a) => (
                    <option key={a.resourceId} value={a.resourceId}>
                      {a.title}
                    </option>
                  ))}
                </DomeSelect>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DomeInput
                  label={t('automation.artifact_slot')}
                  type="text"
                  value={b.slot}
                  onChange={(e) => {
                    const v = e.target.value;
                    onDraftChange({
                      artifactBindings: draft.artifactBindings.map((row, i) =>
                        i === idx ? { ...row, slot: v } : row,
                      ),
                    });
                  }}
                  className="w-full"
                  inputClassName="text-sm"
                />
                <DomeSelect
                  label={t('automation.artifact_policy')}
                  value={b.updatePolicy}
                  onChange={(e) => {
                    const v = e.target.value as AutomationBindingDraft['updatePolicy'];
                    onDraftChange({
                      artifactBindings: draft.artifactBindings.map((row, i) =>
                        i === idx ? { ...row, updatePolicy: v } : row,
                      ),
                    });
                  }}
                  className="w-full"
                  selectClassName="text-sm"
                >
                  <option value="replace">{t('automation.artifact_policy_replace')}</option>
                  <option value="merge_shallow">{t('automation.artifact_policy_merge_shallow')}</option>
                  <option value="merge_deep">{t('automation.artifact_policy_merge_deep')}</option>
                  <option value="append_array">{t('automation.artifact_policy_append_array')}</option>
                </DomeSelect>
              </div>
              <DomeSelect
                label={t('automation.artifact_extract_mode')}
                value={b.extractMode}
                onChange={(e) => {
                  const v = e.target.value as AutomationBindingDraft['extractMode'];
                  onDraftChange({
                    artifactBindings: draft.artifactBindings.map((row, i) =>
                      i === idx ? { ...row, extractMode: v } : row,
                    ),
                  });
                }}
                className="w-full"
                selectClassName="text-sm"
              >
                <option value="json_fence">{t('automation.extract_json_fence')}</option>
                <option value="full_output">{t('automation.extract_full_output')}</option>
              </DomeSelect>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: 'var(--dome-text)' }}>{t('automation.state_enabled')}</span>
                <DomeToggle
                  checked={b.enabled}
                  onChange={(v) => {
                    onDraftChange({
                      artifactBindings: draft.artifactBindings.map((row, i) =>
                        i === idx ? { ...row, enabled: v } : row,
                      ),
                    });
                  }}
                  size="sm"
                />
                <DomeButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-[var(--dome-error)]"
                  onClick={() => {
                    onDraftChange({
                      artifactBindings: draft.artifactBindings.filter((_, i) => i !== idx),
                    });
                  }}
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

          <DomeInput
            label={t('automation.bound_artifact_optional')}
            type="text"
            value={draft.boundArtifactResourceId}
            onChange={(e) => onDraftChange({ boundArtifactResourceId: e.target.value })}
            placeholder={t('automation.bound_artifact_placeholder')}
            className="w-full"
            inputClassName="text-sm font-mono text-xs"
          />
          <DomeInput
            label={t('automation.artifact_slot')}
            type="text"
            value={draft.artifactOutputSlot}
            onChange={(e) => onDraftChange({ artifactOutputSlot: e.target.value })}
            className="w-full"
            inputClassName="text-sm"
          />
        </div>
        )}

        {showPromptAndOutput && (
          <DomeSelect
            label={t('automation.output')}
            value={draft.outputMode}
            onChange={(e) => onDraftChange({ outputMode: e.target.value as AutomationOutputMode })}
            className="w-full"
            selectClassName="text-sm"
          >
            <option value="chat_only">{t('automation.output_chat_only')}</option>
            <option value="studio_output">{t('automation.studio')}</option>
            <option value="mixed">{t('automation.mixed')}</option>
          </DomeSelect>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
            {draft.enabled ? t('automation.enabled_on_save') : t('automation.paused_on_save')}
          </span>
          <DomeToggle checked={draft.enabled} onChange={(v) => onDraftChange({ enabled: v })} size="sm" />
        </div>
      </div>
  );

  if (embedded) return formFields;

  return (
    <DomeDrawerLayout
      className="border-l border-[var(--dome-border)]"
      style={{ background: 'var(--dome-bg)' }}
      header={
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-[var(--dome-border)] bg-[var(--dome-bg)]"
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
              {isNew ? t('automation.drawer_new_title') : t('automation.drawer_edit_title')}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
              {isNew ? t('automation.drawer_new_subtitle') : draft.title}
            </p>
          </div>
          <DomeButton
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onCancel}
            aria-label={t('ui.close')}
            className="text-[var(--dome-text-muted)]"
          >
            <X className="size-4" aria-hidden />
          </DomeButton>
        </div>
      }
      footer={
        <DomeSubpageFooter>
          <DomeSubpageFooter.Trailing>
            <>
              <DomeButton type="button" variant="secondary" size="sm" onClick={onCancel}>
                {t('automation.cancel')}
              </DomeButton>
              <DomeButton
                type="button"
                variant="primary"
                size="sm"
                loading={saving}
                disabled={saving || !draft.title.trim() || !draft.targetId}
                onClick={onSave}
              >
                {isNew ? t('common.create') : t('automation.save_changes')}
              </DomeButton>
            </>
          </DomeSubpageFooter.Trailing>
        </DomeSubpageFooter>
      }
    >
      {formFields}
    </DomeDrawerLayout>
  );
}

// ─── Automatizaciones Tab ────────────────────────────────────────────────────

