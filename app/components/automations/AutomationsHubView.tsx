'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Bot, Workflow, Zap, Activity, Plus, Play, Trash2, Pencil,
  Clock, CheckCircle2, XCircle, Loader2, ChevronLeft, X,
  Filter, Search,
} from 'lucide-react';
import AgentManagementView from '@/components/agents/AgentManagementView';
import AgentChatView from '@/components/agents/AgentChatView';
import AgentCanvasView from '@/components/agent-canvas/AgentCanvasView';
import WorkflowLibraryView from '@/components/agent-canvas/WorkflowLibraryView';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import ChatToolCard, { type ToolCallData } from '@/components/chat/ChatToolCard';
import {
  statusLabel as runStatusLabel,
  statusColor as runStatusColor,
  formatRunDate,
  formatDuration,
  RunProgressBar,
} from './RunLogView';
import {
  listAutomations,
  listRuns,
  getRun,
  deleteAutomation,
  deleteRun,
  runAutomationNow,
  saveAutomation,
  onRunUpdated,
  onRunStep,
  AUTOMATIONS_CHANGED_EVENT,
  type AutomationDefinition,
  type AutomationOutputMode,
  type PersistentRun,
  type PersistentRunStep,
} from '@/lib/automations/api';
import { getRunProgress } from '@/lib/automations/run-progress';
import { getManyAgents } from '@/lib/agents/api';
import { getWorkflows } from '@/lib/agent-canvas/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

type HubTab = 'agents' | 'workflows' | 'automations' | 'runs';

interface AutomationFilter {
  targetType: 'all' | 'agent' | 'workflow';
  targetId?: string;
  targetLabel?: string;
}

interface RunFilter {
  ownerType: 'all' | 'agent' | 'workflow';
  status: 'all' | 'running' | 'completed' | 'failed' | 'cancelled';
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
  initialFilter?: AutomationFilter;
  agents: ManyAgent[];
  workflows: CanvasWorkflow[];
}

function AutomationsTab({ initialFilter, agents, workflows }: AutomationsTabProps) {
  const { t } = useTranslation();
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listAutomations();
      setAutomations(all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
    } finally {
      setLoading(false);
    }
  }, []);

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
        title: draft.title.trim(),
        description: draft.description.trim(),
        targetType: draft.targetType,
        targetId: draft.targetId,
        triggerType: draft.triggerType,
        enabled: draft.enabled,
        schedule: draft.triggerType === 'schedule'
          ? { cadence: draft.cadence, hour: draft.hour, weekday: draft.cadence === 'weekly' ? draft.weekday : null, intervalMinutes: draft.cadence === 'cron-lite' ? draft.intervalMinutes : undefined }
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
        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--dome-border)' }}
        >
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
            <input
              type="text"
              placeholder={t('automation.search_automations')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full text-xs rounded-lg border pl-8 pr-3 py-1.5"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1">
            {(['all', 'agent', 'workflow'] as const).map((targetKind) => (
              <button
                key={targetKind}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, targetType: targetKind, targetId: undefined }))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
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

          {/* New button */}
          <button
            type="button"
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0"
            style={{ background: 'var(--dome-accent)', color: '#fff' }}
          >
            <Plus className="w-3.5 h-3.5" /> {t('automation.button_new')}
          </button>
        </div>

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

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
              <div className="rounded-2xl p-4" style={{ background: 'var(--dome-surface)' }}>
                <Zap className="w-8 h-8" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{t('automation.no_automations')}</p>
              <p className="text-xs max-w-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {t('automation.empty_list_hint')}
              </p>
              <button
                type="button"
                onClick={handleNew}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--dome-accent)', color: '#fff' }}
              >
                <Plus className="w-4 h-4" /> {t('automation.empty_create_cta')}
              </button>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--dome-border)' }}>
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 px-5 py-4 hover:bg-[var(--dome-surface)] transition-colors"
                >
                  {/* Icon */}
                  <div
                    className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
                    style={{ background: a.targetType === 'agent' ? '#8b5cf620' : '#3b82f620' }}
                  >
                    {a.targetType === 'agent'
                      ? <Bot className="w-4 h-4" style={{ color: '#8b5cf6' }} strokeWidth={1.5} />
                      : <Workflow className="w-4 h-4" style={{ color: '#3b82f6' }} strokeWidth={1.5} />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--dome-text)' }}>{a.title}</p>
                      <StatusBadge status={a.enabled ? 'completed' : 'cancelled'} />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                      {targetName(a)} · {triggerLabel(a.triggerType)}
                    </p>
                    {a.description && (
                      <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--dome-text-muted)' }}>{a.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5 text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                      <Clock className="w-3 h-3" />
                      {t('automation.last_run')} {formatHubDate(a.lastRunAt, t('automation.never'))}
                      {a.lastRunStatus && (
                        <span className="ml-1"><StatusBadge status={a.lastRunStatus} /></span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      title={t('automation.title_edit')}
                      onClick={() => handleEdit(a)}
                      className="rounded-lg p-1.5 hover:bg-[var(--dome-bg)] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                    </button>
                    <button
                      type="button"
                      title={t('automation.title_run_now')}
                      onClick={() => void handleRun(a.id)}
                      disabled={runningId === a.id}
                      className="rounded-lg p-1.5 hover:bg-[var(--dome-bg)] transition-colors"
                    >
                      {runningId === a.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                        : <Play className="w-3.5 h-3.5" style={{ color: 'var(--dome-accent)' }} />}
                    </button>
                    <button
                      type="button"
                      title={t('automation.title_delete')}
                      onClick={() => void handleDelete(a.id)}
                      className="rounded-lg p-1.5 hover:bg-[var(--dome-bg)] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                    </button>
                  </div>
                </div>
              ))}
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

// ─── Step → ToolCallData adapter ──────────────────────────────────────────────

function stepToToolCall(step: PersistentRunStep): ToolCallData {
  const meta = step.metadata || {};
  const args = (
    meta.arguments && typeof meta.arguments === 'object' ? meta.arguments :
    meta.args && typeof meta.args === 'object' ? meta.args :
    {}
  ) as Record<string, unknown>;

  let status: ToolCallData['status'];
  if (step.status === 'running') status = 'running';
  else if (step.status === 'failed' || step.status === 'error' || step.status === 'cancelled') status = 'error';
  else if (step.status === 'completed' || step.status === 'done') status = 'success';
  else if (step.status === 'pending' || step.status === 'queued' || step.status === 'waiting_approval') status = 'pending';
  else status = 'error';

  let result: unknown = step.content;
  let error: string | undefined;
  if (status === 'error') {
    error = typeof step.content === 'string' ? step.content : undefined;
    result = undefined;
  } else if (typeof step.content === 'string') {
    try { result = JSON.parse(step.content); } catch { result = step.content; }
  }

  return { id: step.id, name: step.title, arguments: args, status, result, error };
}

// ─── Run Detail Screen ────────────────────────────────────────────────────────

interface RunDetailScreenProps {
  run: PersistentRun;
  onBack: () => void;
}

function RunDetailScreen({ run, onBack }: RunDetailScreenProps) {
  const { t } = useTranslation();
  const steps = run.steps ?? [];
  const toolSteps = steps.filter((s) => s.stepType === 'tool_call' || s.stepType === 'tool');
  const otherSteps = steps.filter((s) => s.stepType !== 'tool_call' && s.stepType !== 'tool');
  const isRunning = run.status === 'running' || run.status === 'queued';
  const color = runStatusColor(run.status);
  const progress = getRunProgress(run);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-5 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)] shrink-0 mt-0.5"
          style={{ color: 'var(--tertiary-text)' }}
          aria-label={t('common.back')}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold truncate" style={{ color: 'var(--primary-text)' }}>
              {run.title || run.id}
            </h2>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                color,
              }}
            >
              {runStatusLabel(run.status)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
              {t('runLog.started')} {formatRunDate(run.startedAt)}
            </span>
            {run.finishedAt && (
              <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
                {t('runLog.finished')} {formatRunDate(run.finishedAt)}
              </span>
            )}
            <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
              {t('runLog.duration')} {formatDuration(run.startedAt, run.finishedAt)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
              {steps.length === 1 ? t('runLog.step_singular') : t('runLog.step_plural', { count: steps.length })}
            </span>
            {progress?.mode === 'determinate' && (
              <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
                {progress.percent ?? 0}% · {progress.completed}/{progress.total}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar for running */}
      {isRunning && <RunProgressBar run={run} />}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Error */}
        {run.error && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--error)', background: 'color-mix(in srgb, var(--error) 8%, transparent)', color: 'var(--error)' }}
          >
            <p className="font-semibold mb-1">{t('runLog.error_title')}</p>
            <p className="text-xs font-mono">{run.error}</p>
          </div>
        )}

        {/* Output text */}
        {run.outputText && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--tertiary-text)' }}>
              {t('runLog.response')}
            </p>
            <div
              className="rounded-xl border p-5 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
            >
              <MarkdownRenderer content={run.outputText} />
            </div>
          </div>
        )}

        {/* Tool calls */}
        {toolSteps.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--tertiary-text)' }}>
              {t('runLog.tools_used', { count: toolSteps.length })}
            </p>
            <div className="flex flex-col gap-1">
              {toolSteps.map((step) => (
                <ChatToolCard key={step.id} toolCall={stepToToolCall(step)} />
              ))}
            </div>
          </div>
        )}

        {/* Other steps (thinking, messages) */}
        {otherSteps.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--tertiary-text)' }}>
              {t('runLog.agent_steps', { count: otherSteps.length })}
            </p>
            <div className="flex flex-col gap-2">
              {otherSteps.map((step) => (
                <div
                  key={step.id}
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  {step.title && (
                    <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--tertiary-text)' }}>
                      {step.title}
                    </p>
                  )}
                  {step.content && (
                    <MarkdownRenderer content={typeof step.content === 'string' ? step.content : JSON.stringify(step.content)} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {steps.length === 0 && !run.outputText && !run.error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {isRunning ? (
              <>
                <Loader2 size={32} className="animate-spin mb-3" style={{ color: 'var(--accent)' }} />
                <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>{t('runLog.executing')}</p>
              </>
            ) : (
              <p className="text-sm" style={{ color: 'var(--tertiary-text)' }}>{t('runLog.no_steps')}</p>
            )}
          </div>
        )}

        {/* Summary */}
        {run.summary && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--tertiary-text)' }}>
              {t('runLog.summary')}
            </p>
            <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>{run.summary}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="shrink-0 px-5 py-3"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
      >
        <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
          ID: {run.id}
        </span>
      </div>
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────────────────────

function RunsTab() {
  const { t } = useTranslation();
  const [allRuns, setAllRuns] = useState<PersistentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<PersistentRun | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunFilter>({ ownerType: 'all', status: 'all' });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selectedRunIdRef = useRef<string | null>(null);
  const detailRefreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    selectedRunIdRef.current = selectedRun?.id ?? null;
  }, [selectedRun]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listRuns({ limit: 100 });
      // Exclude many — those are the user's own chat conversations, not automated flows
      setAllRuns(all.filter((r) => r.ownerType !== 'many'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const scheduleRefreshSelectedRun = useCallback((runId: string) => {
    if (typeof window === 'undefined') return;
    if (detailRefreshTimeoutRef.current) {
      window.clearTimeout(detailRefreshTimeoutRef.current);
    }
    detailRefreshTimeoutRef.current = window.setTimeout(() => {
      void getRun(runId)
        .then((full) => {
          if (!full || selectedRunIdRef.current !== runId) return;
          setSelectedRun(full);
        })
        .catch(() => {
          // Keep the last live snapshot if hydration fails.
        })
        .finally(() => {
          detailRefreshTimeoutRef.current = null;
        });
    }, 150);
  }, []);

  useEffect(() => {
    const unsubUpdated = onRunUpdated(({ run }) => {
      if (run.ownerType === 'many') return;
      setAllRuns((prev) => {
        const filteredPrev = prev.filter((entry) => entry.ownerType !== 'many');
        const existing = filteredPrev.find((entry) => entry.id === run.id);
        const merged = existing
          ? { ...existing, ...run, steps: existing.steps ?? run.steps, links: existing.links ?? run.links }
          : run;
        const next = existing
          ? filteredPrev.map((entry) => (entry.id === run.id ? merged : entry))
          : [merged, ...filteredPrev];
        return next
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .slice(0, 100);
      });

      if (selectedRunIdRef.current === run.id) {
        setSelectedRun((prev) =>
          prev?.id === run.id
            ? { ...prev, ...run, steps: prev.steps, links: prev.links }
            : prev,
        );
        scheduleRefreshSelectedRun(run.id);
      }
    });

    const unsubStep = onRunStep(({ step }) => {
      if (selectedRunIdRef.current === step.runId) {
        scheduleRefreshSelectedRun(step.runId);
      }
      setAllRuns((prev) =>
        prev.map((run) =>
          run.id === step.runId
            ? { ...run, updatedAt: step.updatedAt ?? Date.now() }
            : run,
        ),
      );
    });

    return () => {
      unsubUpdated();
      unsubStep();
      if (detailRefreshTimeoutRef.current && typeof window !== 'undefined') {
        window.clearTimeout(detailRefreshTimeoutRef.current);
        detailRefreshTimeoutRef.current = null;
      }
    };
  }, [scheduleRefreshSelectedRun]);

  const filtered = useMemo(() => {
    let result = allRuns;
    if (filter.ownerType !== 'all') result = result.filter((r) => r.ownerType === filter.ownerType);
    if (filter.status !== 'all') {
      result = result.filter((r) => {
        if (filter.status === 'running') {
          return r.status === 'running' || r.status === 'queued' || r.status === 'waiting_approval';
        }
        return r.status === filter.status;
      });
    }
    return result;
  }, [allRuns, filter]);

  const handleSelectRun = async (run: PersistentRun) => {
    setLoadingDetail(run.id);
    try {
      const full = await getRun(run.id);
      setSelectedRun(full ?? run);
    } catch {
      setSelectedRun(run);
    } finally {
      setLoadingDetail(null);
    }
  };

  const handleDelete = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(runId);
    try {
      await deleteRun(runId);
      if (selectedRun?.id === runId) setSelectedRun(null);
      setAllRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch {
      showToast('error', t('toast.run_delete_error'));
    } finally {
      setDeletingId(null);
    }
  };

  const ownerFilters = useMemo(
    () =>
      (['all', 'agent', 'workflow'] as const).map((key) => ({
        key,
        label:
          key === 'all'
            ? t('runLog.filter_owner_all')
            : key === 'agent'
              ? t('runLog.filter_owner_agent')
              : t('runLog.filter_owner_workflow'),
      })),
    [t],
  );

  const statusFilters = useMemo(
    () =>
      (['all', 'running', 'completed', 'failed', 'cancelled'] as const).map((key) => ({
        key,
        label:
          key === 'all'
            ? t('runLog.filter_status_all')
            : key === 'running'
              ? t('runLog.filter_status_running')
              : key === 'completed'
                ? t('runLog.filter_status_completed')
                : key === 'failed'
                  ? t('runLog.filter_status_failed')
                  : t('runLog.filter_status_cancelled'),
      })),
    [t],
  );

  // When a run is selected, show full-screen detail view
  if (selectedRun) {
    return (
      <RunDetailScreen
        run={selectedRun}
        onBack={() => setSelectedRun(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Filter bar */}
        <div
          className="flex flex-col gap-2 px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--dome-border)' }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
            {ownerFilters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, ownerType: key }))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: filter.ownerType === key ? 'var(--dome-accent)' : 'var(--dome-surface)',
                  color: filter.ownerType === key ? '#fff' : 'var(--dome-text-muted)',
                  border: '1px solid',
                  borderColor: filter.ownerType === key ? 'var(--dome-accent)' : 'var(--dome-border)',
                }}
              >
                {label}
              </button>
            ))}
            <div className="w-px h-4 mx-1" style={{ background: 'var(--dome-border)' }} />
            {statusFilters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, status: key }))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background:
                    filter.status === key
                      ? `color-mix(in srgb, ${runStatusColor(key === 'all' ? 'completed' : key)} 22%, transparent)`
                      : 'transparent',
                  color:
                    filter.status === key
                      ? runStatusColor(key === 'all' ? 'completed' : key)
                      : 'var(--dome-text-muted)',
                  border: '1px solid',
                  borderColor:
                    filter.status === key
                      ? runStatusColor(key === 'all' ? 'completed' : key)
                      : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
            {filtered.length === 1
              ? t('runLog.runs_count_one', { count: filtered.length })
              : t('runLog.runs_count_other', { count: filtered.length })}
          </p>
        </div>

        {/* Run list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
              <div className="rounded-2xl p-4" style={{ background: 'var(--dome-surface)' }}>
                <Activity className="w-8 h-8" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{t('runLog.empty_runs')}</p>
              <p className="text-xs max-w-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {t('runLog.empty_runs_hint')}
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--dome-border)' }}>
              {filtered.map((run) => (
                <div
                  key={run.id}
                  onClick={() => void handleSelectRun(run)}
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[var(--dome-surface)] transition-colors"
                  style={{ background: selectedRun?.id === run.id ? 'var(--dome-surface)' : undefined, opacity: loadingDetail === run.id ? 0.6 : 1 }}
                >
                  {/* Type icon */}
                  <div
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: run.ownerType === 'agent' ? '#8b5cf620' : '#3b82f620' }}
                  >
                    {run.ownerType === 'agent'
                      ? <Bot className="w-3.5 h-3.5" style={{ color: '#8b5cf6' }} strokeWidth={1.5} />
                      : <Workflow className="w-3.5 h-3.5" style={{ color: '#3b82f6' }} strokeWidth={1.5} />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                      {run.title || run.id}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                      {formatHubDate(run.updatedAt, t('runLog.never'))}
                      {run.steps?.length
                        ? ` · ${run.steps.length === 1 ? t('runLog.step_singular') : t('runLog.step_plural', { count: run.steps.length })}`
                        : ''}
                    </p>
                    {(() => {
                      const progress = getRunProgress(run);
                      if (progress?.mode !== 'determinate') return null;
                      return (
                        <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--accent)' }}>
                          {progress.percent ?? 0}% · {progress.completed}/{progress.total}
                        </p>
                      );
                    })()}
                  </div>

                  {/* Status + delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={run.status} />
                    <button
                      type="button"
                      onClick={(e) => void handleDelete(run.id, e)}
                      disabled={deletingId === run.id}
                      className="rounded-lg p-1 hover:bg-[var(--dome-bg)] transition-colors"
                      title={t('runLog.delete_run_aria')}
                    >
                      {deletingId === run.id
                        ? <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                        : <Trash2 className="w-3 h-3" style={{ color: '#ef444480' }} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  );
}

// ─── Main Hub ─────────────────────────────────────────────────────────────────

interface AutomationsHubViewProps {
  onAgentSelect?: (agentId: string) => void;
}

export default function AutomationsHubView({ onAgentSelect }: AutomationsHubViewProps) {
  const { t } = useTranslation();
  const hubTabs = useMemo(
    () =>
      [
        { id: 'agents' as HubTab, label: t('automationHub.tab_agents'), icon: Bot },
        { id: 'workflows' as HubTab, label: t('automationHub.tab_workflows'), icon: Workflow },
        { id: 'automations' as HubTab, label: t('automationHub.tab_automations'), icon: Zap },
        { id: 'runs' as HubTab, label: t('automationHub.tab_runs'), icon: Activity },
      ] as const,
    [t],
  );
  const [activeTab, setActiveTab] = useState<HubTab>('agents');
  const [automationsFilter, setAutomationsFilter] = useState<AutomationFilter | undefined>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [automationsListEpoch, setAutomationsListEpoch] = useState(0);

  const activeShellTabId = useTabStore((s) => s.activeTabId);
  const shellTabs = useTabStore((s) => s.tabs);
  const agentsShellTabId = shellTabs.find((t) => t.type === 'agents')?.id;
  const agentsShellVisible = agentsShellTabId != null && activeShellTabId === agentsShellTabId;

  const prevAgentsShellVisible = useRef<boolean | null>(null);

  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const isWorkflowCanvasActive = typeof homeSidebarSection === 'string' && homeSidebarSection.startsWith('workflow:');

  // Pre-load agents & workflows for the edit drawer
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);

  useEffect(() => {
    const refreshMeta = () => {
      getManyAgents().then(setAgents).catch(() => {});
      getWorkflows().then(setWorkflows).catch(() => {});
    };
    refreshMeta();
    window.addEventListener('dome:agents-changed', refreshMeta);
    window.addEventListener('dome:workflows-changed', refreshMeta);
    return () => {
      window.removeEventListener('dome:agents-changed', refreshMeta);
      window.removeEventListener('dome:workflows-changed', refreshMeta);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'automations') return;
    getManyAgents().then(setAgents).catch(() => {});
    getWorkflows().then(setWorkflows).catch(() => {});
  }, [activeTab]);

  // Persistent shell tab: AutomationsTab stays mounted while hidden; remount list when shell is shown again.
  useEffect(() => {
    const prev = prevAgentsShellVisible.current;
    const becameVisible = prev === false && agentsShellVisible;
    prevAgentsShellVisible.current = agentsShellVisible;
    if (becameVisible && activeTab === 'automations') {
      setAutomationsListEpoch((n) => n + 1);
    }
  }, [agentsShellVisible, activeTab]);

  // Called from AgentManagementView / WorkflowLibraryView when user clicks "Automatizaciones"
  const handleShowAutomations = useCallback((
    targetType: 'agent' | 'workflow',
    targetId: string,
    targetLabel: string,
  ) => {
    setAutomationsFilter({ targetType, targetId, targetLabel });
    setActiveTab('automations');
  }, []);

  const handleTabChange = useCallback((tab: HubTab) => {
    setActiveTab(tab);
    setSelectedAgentId(null);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Secondary nav bar */}
      <div
        className="flex items-center gap-0 shrink-0 px-2"
        style={{ borderBottom: '1px solid var(--dome-border)', height: 44 }}
      >
        {hubTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className="flex items-center gap-2 px-4 h-full text-xs font-medium transition-colors relative"
              style={{
                color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                background: 'transparent',
                borderBottom: isActive ? '2px solid var(--dome-accent)' : '2px solid transparent',
              }}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'agents' && (
          <div className="h-full min-h-0 flex flex-col overflow-hidden">
            {selectedAgentId ? (
              <AgentChatView
                agentId={selectedAgentId}
                onBack={() => setSelectedAgentId(null)}
              />
            ) : (
              <AgentManagementView
                onAgentSelect={(id) => { setSelectedAgentId(id); onAgentSelect?.(id); }}
                onShowAutomations={(id, label) => handleShowAutomations('agent', id, label)}
              />
            )}
          </div>
        )}
        {activeTab === 'workflows' && (
          <div className="h-full min-h-0 flex flex-col overflow-hidden relative">
            {isWorkflowCanvasActive ? (
              <AgentCanvasView />
            ) : (
              <WorkflowLibraryView
                onShowAutomations={(id, label) => handleShowAutomations('workflow', id, label)}
              />
            )}
          </div>
        )}
        {activeTab === 'automations' && (
          <AutomationsTab
            key={`${automationsFilter?.targetId ?? 'all'}:${automationsListEpoch}`}
            initialFilter={automationsFilter}
            agents={agents}
            workflows={workflows}
          />
        )}
        {activeTab === 'runs' && <RunsTab />}
      </div>
    </div>
  );
}
