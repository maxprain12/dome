'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Bot, Workflow, Zap, Plus, Play, Trash2, Pencil,
  Clock, CheckCircle2, XCircle, Loader2, ChevronLeft, X,
  Filter, Download, Upload,
} from 'lucide-react';
import {
  statusLabel as runStatusLabel,
  statusColor as runStatusColor,
} from '@/components/automations/RunLogView';
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
import HubListItem from '@/components/ui/HubListItem';
import HubEntityIcon from '@/components/ui/HubEntityIcon';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
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

function StatusBadge({ status }: { status: string }) {
  const color = runStatusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
      }}
    >
      {status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {status === 'queued' && <Clock className="w-2.5 h-2.5" />}
      {status === 'waiting_approval' && <Clock className="w-2.5 h-2.5" />}
      {status === 'completed' && <CheckCircle2 className="w-2.5 h-2.5" />}
      {status === 'failed' && <XCircle className="w-2.5 h-2.5" />}
      {status === 'cancelled' && <XCircle className="w-2.5 h-2.5" />}
      {runStatusLabel(status)}
    </span>
  );
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
    <div className={embedded ? 'flex flex-col gap-4' : 'flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4'}>

        {/* Target — only shown when creating */}
        {isNew && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.destination')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDraftChange({ targetType: 'agent', targetId: '' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                style={{
                  borderColor: draft.targetType === 'agent' ? 'var(--dome-accent)' : 'var(--dome-border)',
                  background: draft.targetType === 'agent' ? 'var(--dome-accent)' : 'transparent',
                  color: draft.targetType === 'agent' ? '#fff' : 'var(--dome-text-muted)',
                }}
              >
                <Bot className="w-3.5 h-3.5" /> {t('automation.agent')}
              </button>
              <button
                type="button"
                onClick={() => onDraftChange({ targetType: 'workflow', targetId: '' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                style={{
                  borderColor: draft.targetType === 'workflow' ? 'var(--dome-accent)' : 'var(--dome-border)',
                  background: draft.targetType === 'workflow' ? 'var(--dome-accent)' : 'transparent',
                  color: draft.targetType === 'workflow' ? '#fff' : 'var(--dome-text-muted)',
                }}
              >
                <Workflow className="w-3.5 h-3.5" /> {t('automation.workflow')}
              </button>
            </div>
            <select
              value={draft.targetId}
              onChange={(e) => onDraftChange({ targetId: e.target.value })}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{
                borderColor: 'var(--dome-border)', background: 'var(--dome-surface)',
                color: 'var(--dome-text)', outline: 'none',
              }}
            >
              <option value="">{t('automation.select_agent_or_workflow', { type: draft.targetType === 'agent' ? t('automation.agent') : t('automation.workflow') })}</option>
              {draft.targetType === 'agent'
                ? agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)
                : workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)
              }
            </select>
          </div>
        )}

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.name')}</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onDraftChange({ title: e.target.value })}
            placeholder={t('automation.name_placeholder')}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.description')}</label>
          <input
            type="text"
            value={draft.description}
            onChange={(e) => onDraftChange({ description: e.target.value })}
            placeholder={t('automation.description_placeholder')}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          />
        </div>

        {/* Trigger */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.trigger')}</label>
          <select
            value={draft.triggerType}
            onChange={(e) => onDraftChange({ triggerType: e.target.value as DraftState['triggerType'] })}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          >
            <option value="manual">{t('automation.manual')}</option>
            <option value="schedule">{t('automation.scheduled')}</option>
            <option value="contextual">{t('automation.contextual')}</option>
          </select>
        </div>

        {draft.triggerType === 'contextual' && (
          <div
            className="flex flex-col gap-1.5 rounded-xl p-3"
            style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
          >
            <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
              {t('automation.context_tags_label')}
            </label>
            <input
              type="text"
              value={draft.contextTags}
              onChange={(e) => onDraftChange({ contextTags: e.target.value })}
              placeholder={t('automation.context_tags_placeholder')}
              className="w-full text-sm rounded-lg border px-3 py-2"
              style={{
                borderColor: 'var(--dome-border)',
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                outline: 'none',
              }}
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
              <select
                value={draft.cadence}
                onChange={(e) => onDraftChange({ cadence: e.target.value as DraftState['cadence'] })}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)', outline: 'none' }}
              >
                <option value="daily">{t('automation.daily')}</option>
                <option value="weekly">{t('automation.weekly')}</option>
                <option value="cron-lite">{t('automation.cadence_interval')}</option>
              </select>
            </div>
            {draft.cadence !== 'cron-lite' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.schedule_hour_label')}</label>
                <input
                  type="number"
                  min={0} max={23}
                  value={draft.hour}
                  onChange={(e) => onDraftChange({ hour: parseInt(e.target.value) || 0 })}
                  className="w-full text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)', outline: 'none' }}
                />
              </div>
            )}
            {draft.cadence === 'weekly' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.weekday_label')}</label>
                <select
                  value={draft.weekday}
                  onChange={(e) => onDraftChange({ weekday: parseInt(e.target.value) })}
                  className="w-full text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)', outline: 'none' }}
                >
                  {(['day_mon','day_tue','day_wed','day_thu','day_fri','day_sat','day_sun'] as const).map((dayKey, i) => (
                    <option key={dayKey} value={i + 1}>{t(`automation.${dayKey}`)}</option>
                  ))}
                </select>
              </div>
            )}
            {draft.cadence === 'cron-lite' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.interval_minutes_label')}</label>
                <input
                  type="number"
                  min={1}
                  value={draft.intervalMinutes}
                  onChange={(e) => onDraftChange({ intervalMinutes: parseInt(e.target.value) || 60 })}
                  className="w-full text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)', outline: 'none' }}
                />
              </div>
            )}
          </div>
        )}

        {/* Prompt */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.base_prompt')}</label>
          <textarea
            rows={4}
            value={draft.prompt}
            onChange={(e) => onDraftChange({ prompt: e.target.value })}
            placeholder={t('automation.base_prompt_placeholder')}
            className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          />
        </div>

        {/* Output mode */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.output')}</label>
          <select
            value={draft.outputMode}
            onChange={(e) => onDraftChange({ outputMode: e.target.value as AutomationOutputMode })}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          >
            <option value="chat_only">{t('automation.output_chat_only')}</option>
            <option value="studio_output">{t('automation.studio')}</option>
            <option value="mixed">{t('automation.mixed')}</option>
          </select>
        </div>

        {/* Enabled — whole row + switch are clickable (previously only the label text toggled) */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          role="switch"
          aria-checked={draft.enabled}
          tabIndex={0}
          onClick={() => onDraftChange({ enabled: !draft.enabled })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onDraftChange({ enabled: !draft.enabled });
            }
          }}
        >
          <div
            className="relative w-9 h-5 rounded-full transition-colors shrink-0 pointer-events-none"
            style={{ background: draft.enabled ? 'var(--dome-accent)' : 'var(--dome-border)' }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ left: draft.enabled ? '18px' : '2px' }}
            />
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
            {draft.enabled ? t('automation.enabled_on_save') : t('automation.paused_on_save')}
          </span>
        </div>
      </div>
  );

  if (embedded) return formFields;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--dome-bg)', borderLeft: '1px solid var(--dome-border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
            {isNew ? t('automation.drawer_new_title') : t('automation.drawer_edit_title')}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
            {isNew ? t('automation.drawer_new_subtitle') : draft.title}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-[var(--dome-surface)]">
          <X className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
        </button>
      </div>

      {formFields}

      {/* Footer */}
      <div
        className="shrink-0 flex items-center justify-end gap-2 px-5 py-3"
        style={{ borderTop: '1px solid var(--dome-border)' }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'var(--dome-surface)', color: 'var(--dome-text)' }}
        >
          {t('automation.cancel')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.title.trim() || !draft.targetId}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{ background: 'var(--dome-accent)', color: '#fff' }}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isNew ? t('common.create') : t('automation.save_changes')}
        </button>
      </div>
    </div>
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
      <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
        >
          <button
            type="button"
            onClick={() => setFormMode('hidden')}
            className="rounded-lg p-1.5 hover:bg-[var(--dome-surface)] shrink-0"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>{t('automation.new_page_title')}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
              {t('automation.new_page_subtitle')}
            </p>
          </div>
        </div>
        {/* Form body */}
        <div className="flex-1 overflow-y-auto">
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
        </div>
        {/* Footer */}
        <div
          className="shrink-0 flex items-center justify-end gap-2 px-6 py-3"
          style={{ borderTop: '1px solid var(--dome-border)' }}
        >
          <button
            type="button"
            onClick={() => setFormMode('hidden')}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'var(--dome-surface)', color: 'var(--dome-text)' }}
          >
            {t('automation.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !draft.title.trim() || !draft.targetId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--dome-accent)', color: '#fff' }}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('automation.create_footer')}
          </button>
        </div>
      </div>
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
              <button
                type="button"
                disabled={importingAutomationBundle}
                onClick={() => handlePickAutomationImport()}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors shrink-0 disabled:opacity-50"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
              >
                <Upload className="w-3 h-3" />
                {t('hubExport.import_automation')}
              </button>
              <div className="flex items-center gap-0.5">
                {(['all', 'agent', 'workflow'] as const).map((targetKind) => (
                  <button
                    key={targetKind}
                    type="button"
                    onClick={() => setFilter((f) => ({ ...f, targetType: targetKind, targetId: undefined }))}
                    className="px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
                    style={{
                      background: filter.targetType === targetKind ? 'var(--dome-accent)' : 'var(--dome-surface)',
                      color: filter.targetType === targetKind ? '#fff' : 'var(--dome-text-muted)',
                      border: '1px solid',
                      borderColor: filter.targetType === targetKind ? 'var(--dome-accent)' : 'var(--dome-border)',
                    }}
                  >
                    {targetKind === 'all'
                      ? t('automation.filter_target_all')
                      : targetKind === 'agent'
                        ? t('automation.filter_target_agent')
                        : t('automation.filter_target_workflow')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleNew}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors shrink-0"
                style={{ background: 'var(--dome-accent)', color: '#fff' }}
              >
                <Plus className="w-3 h-3" /> {t('automation.button_new')}
              </button>
            </>
          }
        />

        {/* Active filter label */}
        {filter.targetId && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-xs"
            style={{ background: 'var(--dome-accent)10', borderBottom: '1px solid var(--dome-border)' }}
          >
            <Filter className="w-3 h-3" style={{ color: 'var(--dome-accent)' }} />
            <span style={{ color: 'var(--dome-text)' }}>
              {t('automation.filter_by')} <b>{filter.targetLabel}</b>
            </span>
            <button
              type="button"
              onClick={() => setFilter({ targetType: 'all' })}
              className="ml-auto"
              style={{ color: 'var(--dome-accent)' }}
            >
              {t('automation.clear_filter')}
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="p-4">
              <div
                className="flex flex-col rounded-lg border overflow-hidden"
                style={{ borderColor: 'var(--dome-border)' }}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[76px] border-b shrink-0 motion-reduce:animate-none animate-pulse"
                    style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <HubListState
              variant="empty"
              compact
              icon={<Zap className="w-7 h-7" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} />}
              title={t('automation.no_automations')}
              description={t('automation.empty_list_hint')}
              action={
                <button
                  type="button"
                  onClick={handleNew}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium mt-1"
                  style={{ background: 'var(--dome-accent)', color: '#fff' }}
                >
                  <Plus className="w-3.5 h-3.5" /> {t('automation.empty_create_cta')}
                </button>
              }
            />
          ) : (
            <div className="p-4">
              <div
                className="flex flex-col rounded-lg border overflow-hidden"
                role="list"
                style={{ borderColor: 'var(--dome-border)' }}
              >
                {filtered.map((a) => {
                  const desc = (a.description || '').trim();
                  const targetLine = `${targetName(a)} · ${triggerLabel(a.triggerType)}`;
                  return (
                    <HubListItem
                      key={a.id}
                      className="!px-3"
                      icon={
                        <HubEntityIcon kind={a.targetType === 'agent' ? 'agent' : 'workflow'} size="md" />
                      }
                      title={
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-xs font-semibold truncate" style={{ color: 'var(--dome-text)' }}>
                            {a.title}
                          </span>
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md max-w-[140px] truncate"
                            title={t('automation.project_scope_tooltip')}
                            style={{
                              background: 'var(--dome-bg-hover)',
                              color: 'var(--dome-text-muted)',
                              border: '1px solid var(--dome-border)',
                            }}
                          >
                            {t('automation.project_row_badge', { name: scopeProjectName ?? a.projectId ?? projectId })}
                          </span>
                          <StatusBadge status={a.enabled ? 'completed' : 'cancelled'} />
                        </div>
                      }
                      subtitle={
                        desc ? (
                          <span className="line-clamp-2" title={desc}>
                            {desc}
                          </span>
                        ) : (
                          <span className="line-clamp-1 text-[10px]">{targetLine}</span>
                        )
                      }
                      meta={
                        <div
                          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] mt-1"
                          style={{ color: 'var(--dome-text-muted)' }}
                        >
                          {desc ? <span>{targetLine}</span> : null}
                          <span className="inline-flex items-center gap-0.5 shrink-0">
                            {desc ? <span aria-hidden>·</span> : null}
                            <Clock className="w-3 h-3 shrink-0" aria-hidden />
                            {t('automation.last_run')} {formatHubDate(a.lastRunAt, t('automation.never'))}
                          </span>
                          {a.lastRunStatus ? (
                            <span className="inline-flex items-center shrink-0">
                              <span aria-hidden className="mx-0.5">
                                ·
                              </span>
                              <StatusBadge status={a.lastRunStatus} />
                            </span>
                          ) : null}
                        </div>
                      }
                      trailing={
                        <>
                          <button
                            type="button"
                            title={t('hubExport.title_export_automation')}
                            onClick={() => void handleExportAutomation(a)}
                            className="p-1 rounded-md hover:bg-[var(--dome-bg)] transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                          </button>
                          <button
                            type="button"
                            title={t('automation.title_edit')}
                            onClick={() => handleEdit(a)}
                            className="p-1 rounded-md hover:bg-[var(--dome-bg)] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                          </button>
                          <button
                            type="button"
                            title={t('automation.title_run_now')}
                            onClick={() => void handleRun(a.id)}
                            disabled={runningId === a.id}
                            className="p-1 rounded-md hover:bg-[var(--dome-bg)] transition-colors disabled:opacity-50"
                          >
                            {runningId === a.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                            ) : (
                              <Play className="w-3.5 h-3.5" style={{ color: 'var(--dome-accent)' }} />
                            )}
                          </button>
                          <button
                            type="button"
                            title={t('automation.title_delete')}
                            onClick={() => void handleDelete(a.id)}
                            className="p-1 rounded-md hover:bg-[var(--dome-bg)] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--error)' }} />
                          </button>
                        </>
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
