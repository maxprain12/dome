'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Bot, Workflow, Zap, Plus, Play, Trash2, Pencil,
  Clock, Loader2, X,
  Download, Upload, MoreHorizontal
} from 'lucide-react';
import {
  listAutomations,
  deleteAutomation,
  runAutomationNow,
  saveAutomation,
  AUTOMATIONS_CHANGED_EVENT,
  type AutomationDefinition,
  type AutomationOutputMode,
} from '@/lib/automations/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import {
  exportAutomationBundle,
  downloadHubBundle,
  slugExportFilenamePart,
  parseHubExportBundle,
  importAutomationBundleOnly,
} from '@/lib/hub-export/bundle';
import HubSearchField from '@/components/ui/HubSearchField';
import HubListState from '@/components/ui/HubListState';
import DomeContextMenu from '@/components/ui/DomeContextMenu';
import HubBentoCard from '@/components/ui/HubBentoCard';
import HubEntityIcon from '@/components/ui/HubEntityIcon';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
import DomeStatusBadge from '@/components/ui/DomeStatusBadge';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import DomeActiveFilterBanner from '@/components/ui/DomeActiveFilterBanner';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeSubpageFooter from '@/components/ui/DomeSubpageFooter';
import DomeDrawerLayout from '@/components/ui/DomeDrawerLayout';
import DomeButton from '@/components/ui/DomeButton';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import { DomeSelect } from '@/components/ui/DomeSelect';
import DomeToggle from '@/components/ui/DomeToggle';
import { useAppStore } from '@/lib/store/useAppStore';

export interface AutomationFilter {
  targetType: 'all' | 'agent' | 'workflow';
  targetId?: string;
  targetLabel?: string;
}
type DraftState = {
  id?: string;
  title: string;
  description: string;
  targetType: 'agent' | 'workflow';
  targetId: string;
  triggerType: 'manual' | 'schedule' | 'contextual';
  enabled: boolean;
  cadence: 'daily' | 'weekly' | 'cron-lite';
  hour: number;
  weekday: number;
  intervalMinutes: number;
  outputMode: AutomationOutputMode;
  prompt: string;
  /** Comma-separated context tags when trigger is contextual (e.g. resource_opened) */
  contextTags: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHubDate(ts: number | undefined | null, neverLabel: string) {
  if (!ts) return neverLabel;
  return new Date(ts).toLocaleString(getDateTimeLocaleTag(), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const EMPTY_DRAFT: DraftState = {
  title: '',
  description: '',
  targetType: 'agent',
  targetId: '',
  triggerType: 'manual',
  enabled: true,
  cadence: 'daily',
  hour: 8,
  weekday: 1,
  intervalMinutes: 60,
  outputMode: 'chat_only',
  prompt: '',
  contextTags: 'resource_opened',
};

// ─── Automation Edit Drawer ───────────────────────────────────────────────────

interface AutomationEditDrawerProps {
  draft: DraftState;
  agents: ManyAgent[];
  workflows: CanvasWorkflow[];
  isNew: boolean;
  saving: boolean;
  onDraftChange: (partial: Partial<DraftState>) => void;
  onSave: () => void;
  onCancel: () => void;
  /** When true, renders only the form fields — no header, no footer, no outer wrapper */
  embedded?: boolean;
}

function AutomationEditDrawer({
  draft, agents, workflows, isNew, saving, onDraftChange, onSave, onCancel, embedded,
}: AutomationEditDrawerProps) {
  const { t } = useTranslation();
  const formFields = (
    <div className={embedded ? 'flex flex-col gap-4' : 'px-5 py-5 flex flex-col gap-4'}>

        {/* Target — only shown when creating */}
        {isNew ? (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.destination')}</label>
            <DomeSegmentedControl
              size="sm"
              aria-label={t('automation.destination')}
              options={[
                { value: 'agent', label: t('automation.agent'), icon: <Bot className="w-3.5 h-3.5" aria-hidden /> },
                { value: 'workflow', label: t('automation.workflow'), icon: <Workflow className="w-3.5 h-3.5" aria-hidden /> },
              ]}
              value={draft.targetType}
              onChange={(v) => onDraftChange({ targetType: v as 'agent' | 'workflow', targetId: '' })}
            />
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

        {/* Prompt */}
        <DomeTextarea
          label={t('automation.base_prompt')}
          rows={4}
          value={draft.prompt}
          onChange={(e) => onDraftChange({ prompt: e.target.value })}
          placeholder={t('automation.base_prompt_placeholder')}
          className="w-full"
          textareaClassName="text-sm resize-none"
        />

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
            <X className="w-4 h-4" aria-hidden />
          </DomeButton>
        </div>
      }
      footer={
        <DomeSubpageFooter
          trailing={
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
          }
        />
      }
    >
      {formFields}
    </DomeDrawerLayout>
  );
}

// ─── Automatizaciones Tab ────────────────────────────────────────────────────

interface AutomationsTabProps {
  projectId: string;
  initialFilter?: AutomationFilter;
  agents: ManyAgent[];
  workflows: CanvasWorkflow[];
}

function AutomationsTab({ projectId, initialFilter, agents, workflows }: AutomationsTabProps) {
  const { t } = useTranslation();
  const appProject = useAppStore((s) => s.currentProject);
  const [scopeProjectName, setScopeProjectName] = useState<string | null>(null);
  const automationImportInputRef = useRef<HTMLInputElement>(null);
  const [importingAutomationBundle, setImportingAutomationBundle] = useState(false);
  const triggerLabel = useCallback(
    (trigger: string) =>
      trigger === 'schedule'
        ? t('automation.scheduled')
        : trigger === 'manual'
          ? t('automation.manual')
          : t('automation.contextual'),
    [t],
  );
  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AutomationFilter>(initialFilter ?? { targetType: 'all' });
  // 'hidden' = list, 'new' = full-screen create page, 'edit' = side drawer (editing existing)
  const [formMode, setFormMode] = useState<'hidden' | 'new' | 'edit'>('hidden');
  const [draft, setDraft] = useState<DraftState>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  // Update filter when initialFilter changes (from clicking "Automatizaciones" on an agent/workflow)
  useEffect(() => {
    if (initialFilter) setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (appProject?.id === projectId) {
      setScopeProjectName(appProject.name ?? null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await window.electron?.db?.projects?.getById(projectId);
        if (!cancelled && res?.success && res.data?.name) setScopeProjectName(res.data.name);
        else if (!cancelled) setScopeProjectName(null);
      } catch {
        if (!cancelled) setScopeProjectName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, appProject?.id, appProject?.name]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listAutomations({ projectId });
      setAutomations(all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const handler = () => { void load(); };
    window.addEventListener(AUTOMATIONS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AUTOMATIONS_CHANGED_EVENT, handler);
  }, [load]);

  const filtered = useMemo(() => {
    let result = automations;
    if (filter.targetType !== 'all') result = result.filter((a) => a.targetType === filter.targetType);
    if (filter.targetId) result = result.filter((a) => a.targetId === filter.targetId);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter((a) => a.title.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q));
    }
    return result;
  }, [automations, filter, searchText]);

  const handleEdit = (a: AutomationDefinition) => {
    setDraft({
      id: a.id,
      title: a.title,
      description: a.description ?? '',
      targetType: a.targetType as 'agent' | 'workflow',
      targetId: a.targetId,
      triggerType: a.triggerType,
      enabled: a.enabled,
      cadence: a.schedule?.cadence ?? 'daily',
      hour: a.schedule?.hour ?? 8,
      weekday: a.schedule?.weekday ?? 1,
      intervalMinutes: a.schedule?.intervalMinutes ?? 60,
      outputMode: a.outputMode ?? 'chat_only',
      prompt: a.inputTemplate?.prompt ?? '',
      contextTags: (a.schedule?.contextTags ?? ['resource_opened']).join(', '),
    });
    setFormMode('edit');
  };

  const handleNew = () => {
    const defaultTarget = filter.targetType !== 'all'
      ? { targetType: filter.targetType as 'agent' | 'workflow', targetId: filter.targetId ?? '' }
      : { targetType: 'agent' as const, targetId: '' };
    setDraft({ ...EMPTY_DRAFT, ...defaultTarget });
    setFormMode('new');
  };

  const handleSave = async () => {
    if (!draft.title.trim() || !draft.targetId) return;
    setSaving(true);
    try {
      await saveAutomation({
        id: draft.id,
        projectId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        targetType: draft.targetType,
        targetId: draft.targetId,
        triggerType: draft.triggerType,
        enabled: draft.enabled,
        schedule:
          draft.triggerType === 'schedule'
            ? {
                cadence: draft.cadence,
                hour: draft.hour,
                weekday: draft.cadence === 'weekly' ? draft.weekday : null,
                intervalMinutes: draft.cadence === 'cron-lite' ? draft.intervalMinutes : undefined,
              }
            : draft.triggerType === 'contextual'
              ? {
                  contextTags: draft.contextTags
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : null,
        inputTemplate: { prompt: draft.prompt.trim() },
        outputMode: draft.outputMode,
      });
      showToast('success', draft.id ? t('toast.automation_updated') : t('toast.automation_created'));
      setFormMode('hidden');
      await load();
    } catch {
      showToast('error', t('toast.automation_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await runAutomationNow(id);
      showToast('success', t('toast.automation_started'));
      await load();
    } catch {
      showToast('error', t('toast.automation_run_error'));
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAutomation(id);
    showToast('success', t('toast.automation_deleted'));
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  };

  const handleExportAutomation = async (a: AutomationDefinition) => {
    const built = await exportAutomationBundle(a.id);
    if (!built.success) {
      showToast('error', built.error ?? t('hubExport.error_export'));
      return;
    }
    const name = `dome-automation-${slugExportFilenamePart(a.title)}-${new Date().toISOString().slice(0, 10)}.json`;
    downloadHubBundle(name, built.bundle);
    showToast('success', t('hubExport.export_done'));
  };

  const handlePickAutomationImport = () => automationImportInputRef.current?.click();

  const handleAutomationImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingAutomationBundle(true);
    try {
      const text = await file.text();
      const parsed = parseHubExportBundle(text);
      if (!parsed.success) {
        showToast('error', parsed.error ?? t('hubExport.invalid_bundle'));
        return;
      }
      const result = await importAutomationBundleOnly(parsed.data, projectId);
      if (!result.success) {
        showToast('error', result.error ?? t('hubExport.error_import'));
        return;
      }
      showToast(
        'success',
        t('hubExport.import_done_automation', {
          automations: result.summary.automationsCreated,
          workflows: result.summary.workflowsCreated,
          agents: result.summary.agentsCreated,
        }),
      );
      window.dispatchEvent(new CustomEvent('dome:agents-changed'));
      window.dispatchEvent(new CustomEvent('dome:workflows-changed'));
      window.dispatchEvent(new CustomEvent(AUTOMATIONS_CHANGED_EVENT));
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('hubExport.error_import'));
    } finally {
      setImportingAutomationBundle(false);
    }
  };

  // Target name resolvers
  const agentName = useCallback((id: string) => agents.find((a) => a.id === id)?.name ?? id, [agents]);
  const workflowName = useCallback((id: string) => workflows.find((w) => w.id === id)?.name ?? id, [workflows]);
  const targetName = (a: AutomationDefinition) =>
    a.targetType === 'agent' ? agentName(a.targetId) : workflowName(a.targetId);

  // Full-screen creation page — replaces the list entirely
  if (formMode === 'new') {
    return (
      <DomeDrawerLayout
        className="bg-[var(--dome-bg)]"
        header={
          <DomeSubpageHeader
            title={t('automation.new_page_title')}
            subtitle={t('automation.new_page_subtitle')}
            onBack={() => setFormMode('hidden')}
            backLabel={t('common.back')}
            className="border-[var(--dome-border)] bg-[var(--dome-bg)]"
          />
        }
        footer={
          <DomeSubpageFooter
            className="px-6 border-[var(--dome-border)] bg-[var(--dome-bg)]"
            trailing={
              <>
                <DomeButton type="button" variant="secondary" size="sm" onClick={() => setFormMode('hidden')}>
                  {t('automation.cancel')}
                </DomeButton>
                <DomeButton
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={saving}
                  disabled={saving || !draft.title.trim() || !draft.targetId}
                  onClick={() => void handleSave()}
                >
                  {t('automation.create_footer')}
                </DomeButton>
              </>
            }
          />
        }
      >
        <div className="max-w-2xl mx-auto px-6 py-6">
          <AutomationEditDrawer
            draft={draft}
            agents={agents}
            workflows={workflows}
            isNew={true}
            saving={saving}
            onDraftChange={(partial) => setDraft((prev) => ({ ...prev, ...partial }))}
            onSave={() => void handleSave()}
            onCancel={() => setFormMode('hidden')}
            embedded
          />
        </div>
      </DomeDrawerLayout>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* List pane */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <input
          ref={automationImportInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(ev) => void handleAutomationImportFile(ev)}
        />
        <HubToolbar
          dense
          leading={
            <HubTitleBlock
              icon={Zap}
              title={t('automationHub.tab_automations')}
              subtitle={(() => {
                const base =
                  automations.length === 0
                    ? t('automation.no_automations')
                    : automations.length === 1
                      ? t('automationHub.automations_list_one', { count: automations.length })
                      : t('automationHub.automations_list_other', { count: automations.length });
                return base + t('automation.project_scope_suffix', { name: scopeProjectName ?? projectId });
              })()}
            />
          }
          center={
            <HubSearchField
              value={searchText}
              onChange={setSearchText}
              placeholder={t('automation.search_automations')}
            />
          }
          trailing={
            <>
              <DomeButton
                type="button"
                variant="outline"
                size="xs"
                disabled={importingAutomationBundle}
                onClick={() => handlePickAutomationImport()}
                className="shrink-0 border-[var(--dome-border)] text-[var(--dome-text)]"
                leftIcon={<Upload className="w-3 h-3" aria-hidden />}
              >
                {t('hubExport.import_automation')}
              </DomeButton>
              <DomeFilterChipGroup
                dense
                options={[
                  { value: 'all' as const, label: t('automation.filter_target_all'), selectedColor: 'var(--dome-accent)' },
                  { value: 'agent' as const, label: t('automation.filter_target_agent'), selectedColor: 'var(--dome-accent)' },
                  { value: 'workflow' as const, label: t('automation.filter_target_workflow'), selectedColor: 'var(--dome-accent)' },
                ]}
                value={filter.targetType}
                onChange={(targetKind) => setFilter((f) => ({ ...f, targetType: targetKind, targetId: undefined }))}
              />
              <DomeButton
                type="button"
                variant="primary"
                size="xs"
                onClick={handleNew}
                className="shrink-0 !bg-[var(--dome-accent)] hover:!brightness-110"
                leftIcon={<Plus className="w-3 h-3" aria-hidden />}
              >
                {t('automation.button_new')}
              </DomeButton>
            </>
          }
        />

        {/* Active filter label */}
        {filter.targetId && (
          <DomeActiveFilterBanner
            label={
              <>
                {t('automation.filter_by')} <b>{filter.targetLabel}</b>
              </>
            }
            clearLabel={t('automation.clear_filter')}
            onClear={() => setFilter({ targetType: 'all' })}
            className="px-5"
          />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="p-4">
              <DomeSkeletonGrid count={8} />
            </div>
          ) : filtered.length === 0 ? (
            <HubListState
              variant="empty"
              compact
              icon={<Zap className="w-7 h-7" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} />}
              title={t('automation.no_automations')}
              description={t('automation.empty_list_hint')}
              action={
                <DomeButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleNew}
                  className="mt-1 !bg-[var(--dome-accent)]"
                  leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden />}
                >
                  {t('automation.empty_create_cta')}
                </DomeButton>
              }
            />
          ) : (
            <div className="p-4">
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                role="list"
              >
                {filtered.map((a) => {
                  const desc = (a.description || '').trim();
                  const targetLine = `${targetName(a)} · ${triggerLabel(a.triggerType)}`;
                  return (
                    <HubBentoCard
                      key={a.id}
                      icon={
                        <HubEntityIcon kind={a.targetType === 'agent' ? 'agent' : 'workflow'} size="md" />
                      }
                      title={
                        <div className="flex items-start gap-2 min-w-0 flex-wrap">
                          <span
                            className="text-sm font-semibold min-w-0 break-words line-clamp-2 flex-1"
                            style={{ color: 'var(--dome-text)' }}
                            title={a.title}
                          >
                            {a.title}
                          </span>
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md max-w-[140px] break-words line-clamp-2"
                            title={t('automation.project_scope_tooltip')}
                            style={{
                              background: 'var(--dome-bg-hover)',
                              color: 'var(--dome-text-muted)',
                              border: '1px solid var(--dome-border)',
                            }}
                          >
                            {t('automation.project_row_badge', { name: scopeProjectName ?? a.projectId ?? projectId })}
                          </span>
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                            style={{
                              background: a.enabled ? 'color-mix(in srgb, var(--dome-accent) 12%, transparent)' : 'var(--dome-bg-hover)',
                              color: a.enabled ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                              border: '1px solid var(--dome-border)',
                            }}
                          >
                            {a.enabled ? t('automation.state_enabled') : t('automation.state_disabled')}
                          </span>
                        </div>
                      }
                      subtitle={
                        desc ? (
                          <span className="line-clamp-3 break-words" title={desc}>
                            {desc}
                          </span>
                        ) : (
                          <span className="line-clamp-2 text-[11px] break-words">{targetLine}</span>
                        )
                      }
                      meta={
                        <div
                          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] mt-1 min-w-0"
                          style={{ color: 'var(--dome-text-muted)' }}
                        >
                          {desc ? <span className="min-w-0 break-words">{targetLine}</span> : null}
                          <span className="inline-flex items-center gap-1 shrink-0 min-w-0 flex-wrap">
                            {desc ? <span aria-hidden>·</span> : null}
                            <Clock className="w-3 h-3 shrink-0" aria-hidden />
                            <span className="break-words">
                              {t('automation.last_run')} {formatHubDate(a.lastRunAt, t('automation.never'))}
                            </span>
                            {a.lastRunStatus ? (
                              <>
                                <span aria-hidden className="mx-0.5">
                                  ·
                                </span>
                                <DomeStatusBadge status={a.lastRunStatus} />
                              </>
                            ) : null}
                          </span>
                        </div>
                      }
                      trailing={
                        <DomeContextMenu
                          align="end"
                          trigger={
                            <button
                              type="button"
                              className="p-1.5 rounded-md hover:bg-[var(--dome-bg)] transition-colors"
                              title={t('ui.options')}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
                            </button>
                          }
                          items={[
                            {
                              label: t('hubExport.title_export_automation'),
                              icon: (
                                <Download className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
                              ),
                              onClick: () => void handleExportAutomation(a),
                            },
                            {
                              label: t('automation.title_edit'),
                              icon: <Pencil className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />,
                              onClick: () => handleEdit(a),
                            },
                            {
                              label: t('automation.title_run_now'),
                              icon:
                                runningId === a.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                                ) : (
                                  <Play className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />
                                ),
                              onClick: () => void handleRun(a.id),
                              disabled: runningId === a.id,
                            },
                            {
                              separator: true,
                              label: t('automation.title_delete'),
                              icon: <Trash2 className="w-4 h-4" />,
                              variant: 'danger' as const,
                              onClick: () => void handleDelete(a.id),
                            },
                          ]}
                        />
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit drawer — only for editing existing automations */}
      {formMode === 'edit' && (
        <div
          className="shrink-0 overflow-y-auto"
          style={{ width: 340, minWidth: 320 }}
        >
          <AutomationEditDrawer
            draft={draft}
            agents={agents}
            workflows={workflows}
            isNew={false}
            saving={saving}
            onDraftChange={(partial) => setDraft((prev) => ({ ...prev, ...partial }))}
            onSave={() => void handleSave()}
            onCancel={() => setFormMode('hidden')}
          />
        </div>
      )}
    </div>
  );
}
export default AutomationsTab;
