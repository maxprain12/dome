'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import ChatToolCard, { type ToolCallData } from '@/components/chat/ChatToolCard';
import {
  statusLabel as runStatusLabel,
  statusColor as runStatusColor,
  formatRunDate,
  formatDuration,
} from './RunLogView';
import {
  listAutomations,
  listRuns,
  getRun,
  deleteAutomation,
  deleteRun,
  runAutomationNow,
  saveAutomation,
  type AutomationDefinition,
  type AutomationOutputMode,
  type PersistentRun,
  type PersistentRunStep,
} from '@/lib/automations/api';
import { getManyAgents } from '@/lib/agents/api';
import { getWorkflows } from '@/lib/agent-canvas/api';
import type { ManyAgent } from '@/types';
import type { CanvasWorkflow } from '@/types/canvas';
import { showToast } from '@/lib/store/useToastStore';

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

function formatDate(ts?: number | null) {
  if (!ts) return 'Nunca';
  return new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(s: string) {
  switch (s) {
    case 'queued': return 'En cola';
    case 'running': return 'Ejecutando';
    case 'waiting_approval': return 'Aprobación';
    case 'completed': return 'Completado';
    case 'failed': return 'Fallido';
    case 'cancelled': return 'Cancelado';
    default: return s;
  }
}

function statusColor(s: string) {
  switch (s) {
    case 'completed': return '#10b981';
    case 'running': return '#3b82f6';
    case 'failed': return '#ef4444';
    case 'waiting_approval': return '#f59e0b';
    default: return '#6b7280';
  }
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: color + '20', color }}
    >
      {status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {status === 'completed' && <CheckCircle2 className="w-2.5 h-2.5" />}
      {status === 'failed' && <XCircle className="w-2.5 h-2.5" />}
      {statusLabel(status)}
    </span>
  );
}

function triggerLabel(t: string) {
  if (t === 'schedule') return 'Programada';
  if (t === 'manual') return 'Manual';
  return 'Contextual';
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
  const formFields = (
    <div className={embedded ? 'flex flex-col gap-4' : 'flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4'}>

        {/* Target — only shown when creating */}
        {isNew && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Destino</label>
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
                <Bot className="w-3.5 h-3.5" /> Agente
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
                <Workflow className="w-3.5 h-3.5" /> Workflow
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
              <option value="">Selecciona {draft.targetType === 'agent' ? 'un agente' : 'un workflow'}...</option>
              {draft.targetType === 'agent'
                ? agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)
                : workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)
              }
            </select>
          </div>
        )}

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Nombre</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onDraftChange({ title: e.target.value })}
            placeholder="Ej. Briefing diario"
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Descripción</label>
          <input
            type="text"
            value={draft.description}
            onChange={(e) => onDraftChange({ description: e.target.value })}
            placeholder="Para qué sirve esta automatización"
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          />
        </div>

        {/* Trigger */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Trigger</label>
          <select
            value={draft.triggerType}
            onChange={(e) => onDraftChange({ triggerType: e.target.value as DraftState['triggerType'] })}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          >
            <option value="manual">Manual</option>
            <option value="schedule">Programada</option>
            <option value="contextual">Contextual</option>
          </select>
        </div>

        {/* Schedule options */}
        {draft.triggerType === 'schedule' && (
          <div className="flex flex-col gap-3 rounded-xl p-3" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Cadencia</label>
              <select
                value={draft.cadence}
                onChange={(e) => onDraftChange({ cadence: e.target.value as DraftState['cadence'] })}
                className="w-full text-sm rounded-lg border px-3 py-2"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)', outline: 'none' }}
              >
                <option value="daily">Diaria</option>
                <option value="weekly">Semanal</option>
                <option value="cron-lite">Cada N minutos</option>
              </select>
            </div>
            {draft.cadence !== 'cron-lite' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Hora (0-23)</label>
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
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Día</label>
                <select
                  value={draft.weekday}
                  onChange={(e) => onDraftChange({ weekday: parseInt(e.target.value) })}
                  className="w-full text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)', outline: 'none' }}
                >
                  {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((d, i) => (
                    <option key={d} value={i + 1}>{d}</option>
                  ))}
                </select>
              </div>
            )}
            {draft.cadence === 'cron-lite' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Cada (minutos)</label>
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
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Prompt base</label>
          <textarea
            rows={4}
            value={draft.prompt}
            onChange={(e) => onDraftChange({ prompt: e.target.value })}
            placeholder="Instrucciones base para la automatización…"
            className="w-full text-sm rounded-lg border px-3 py-2 resize-none"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          />
        </div>

        {/* Output mode */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Salida</label>
          <select
            value={draft.outputMode}
            onChange={(e) => onDraftChange({ outputMode: e.target.value as AutomationOutputMode })}
            className="w-full text-sm rounded-lg border px-3 py-2"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
          >
            <option value="chat_only">Solo chat</option>
            <option value="note">Nota</option>
            <option value="studio_output">Studio</option>
            <option value="mixed">Mixta</option>
          </select>
        </div>

        {/* Enabled */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className="relative w-9 h-5 rounded-full transition-colors"
            style={{ background: draft.enabled ? 'var(--dome-accent)' : 'var(--dome-border)' }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ left: draft.enabled ? '18px' : '2px' }}
            />
          </div>
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--dome-text)' }}
            onClick={() => onDraftChange({ enabled: !draft.enabled })}
          >
            {draft.enabled ? 'Activa al guardar' : 'Pausada al guardar'}
          </span>
        </label>
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
            {isNew ? 'Nueva automatización' : 'Editar automatización'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
            {isNew ? 'Elige un destino y configura el trigger' : draft.title}
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
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.title.trim() || !draft.targetId}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          style={{ background: 'var(--dome-accent)', color: '#fff' }}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isNew ? 'Crear' : 'Guardar cambios'}
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
      showToast('success', draft.id ? 'Automatización actualizada' : 'Automatización creada');
      setFormMode('hidden');
      await load();
    } catch {
      showToast('error', 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await runAutomationNow(id);
      showToast('success', 'Automatización iniciada');
      await load();
    } catch {
      showToast('error', 'Error al ejecutar');
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAutomation(id);
    showToast('success', 'Eliminada');
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
            <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>Nueva automatización</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
              Elige un destino y configura el trigger
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
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !draft.title.trim() || !draft.targetId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--dome-accent)', color: '#fff' }}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Crear automatización
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
              placeholder="Buscar automatizaciones…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full text-xs rounded-lg border pl-8 pr-3 py-1.5"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)', outline: 'none' }}
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1">
            {(['all', 'agent', 'workflow'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, targetType: t, targetId: undefined }))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: filter.targetType === t ? 'var(--dome-accent)' : 'var(--dome-surface)',
                  color: filter.targetType === t ? '#fff' : 'var(--dome-text-muted)',
                  border: '1px solid',
                  borderColor: filter.targetType === t ? 'var(--dome-accent)' : 'var(--dome-border)',
                }}
              >
                {t === 'all' ? 'Todas' : t === 'agent' ? 'Agentes' : 'Workflows'}
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
            <Plus className="w-3.5 h-3.5" /> Nueva
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
              Filtrando por: <b>{filter.targetLabel}</b>
            </span>
            <button
              type="button"
              onClick={() => setFilter({ targetType: 'all' })}
              className="ml-auto"
              style={{ color: 'var(--dome-accent)' }}
            >
              Quitar filtro
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
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>Sin automatizaciones</p>
              <p className="text-xs max-w-xs" style={{ color: 'var(--dome-text-muted)' }}>
                Crea la primera automatización con el botón "Nueva".
              </p>
              <button
                type="button"
                onClick={handleNew}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--dome-accent)', color: '#fff' }}
              >
                <Plus className="w-4 h-4" /> Nueva automatización
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
                      Último run: {formatDate(a.lastRunAt)}
                      {a.lastRunStatus && (
                        <span className="ml-1"><StatusBadge status={a.lastRunStatus} /></span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      title="Editar"
                      onClick={() => handleEdit(a)}
                      className="rounded-lg p-1.5 hover:bg-[var(--dome-bg)] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                    </button>
                    <button
                      type="button"
                      title="Ejecutar ahora"
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
                      title="Eliminar"
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
  else if (step.status === 'failed' || step.status === 'error') status = 'error';
  else if (step.status === 'completed' || step.status === 'done') status = 'success';
  else status = 'pending';

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
  const steps = run.steps ?? [];
  const toolSteps = steps.filter((s) => s.stepType === 'tool_call' || s.stepType === 'tool');
  const otherSteps = steps.filter((s) => s.stepType !== 'tool_call' && s.stepType !== 'tool');
  const isRunning = run.status === 'running' || run.status === 'queued';
  const color = runStatusColor(run.status);

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
              Iniciado: {formatRunDate(run.startedAt)}
            </span>
            {run.finishedAt && (
              <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
                Fin: {formatRunDate(run.finishedAt)}
              </span>
            )}
            <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
              Duración: {formatDuration(run.startedAt, run.finishedAt)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
              {steps.length} paso{steps.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar for running */}
      {isRunning && (
        <div className="h-0.5 w-full overflow-hidden shrink-0" style={{ background: 'var(--bg-tertiary)' }}>
          <div
            className="h-full animate-pulse"
            style={{ width: '60%', background: 'var(--accent)', transition: 'width 1s ease' }}
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Error */}
        {run.error && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--error)', background: 'color-mix(in srgb, var(--error) 8%, transparent)', color: 'var(--error)' }}
          >
            <p className="font-semibold mb-1">Error</p>
            <p className="text-xs font-mono">{run.error}</p>
          </div>
        )}

        {/* Output text */}
        {run.outputText && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--tertiary-text)' }}>
              Respuesta
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
              Herramientas usadas ({toolSteps.length})
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
              Pasos del agente ({otherSteps.length})
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
                <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>Ejecutando…</p>
              </>
            ) : (
              <p className="text-sm" style={{ color: 'var(--tertiary-text)' }}>No hay pasos registrados para este run.</p>
            )}
          </div>
        )}

        {/* Summary */}
        {run.summary && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--tertiary-text)' }}>
              Resumen
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
  const [allRuns, setAllRuns] = useState<PersistentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<PersistentRun | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunFilter>({ ownerType: 'all', status: 'all' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    let result = allRuns;
    if (filter.ownerType !== 'all') result = result.filter((r) => r.ownerType === filter.ownerType);
    if (filter.status !== 'all') result = result.filter((r) => r.status === filter.status);
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
      showToast('error', 'No se pudo eliminar el run');
    } finally {
      setDeletingId(null);
    }
  };

  const OWNER_FILTERS: { key: RunFilter['ownerType']; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'agent', label: 'Agentes' },
    { key: 'workflow', label: 'Workflows' },
  ];

  const STATUS_FILTERS: { key: RunFilter['status']; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'running', label: 'Ejecutando' },
    { key: 'completed', label: 'Completados' },
    { key: 'failed', label: 'Fallidos' },
    { key: 'cancelled', label: 'Cancelados' },
  ];

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
            {OWNER_FILTERS.map(({ key, label }) => (
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
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter((f) => ({ ...f, status: key }))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: filter.status === key ? statusColor(key === 'all' ? 'completed' : key) + '20' : 'transparent',
                  color: filter.status === key ? statusColor(key === 'all' ? 'completed' : key) : 'var(--dome-text-muted)',
                  border: '1px solid',
                  borderColor: filter.status === key ? statusColor(key === 'all' ? 'completed' : key) : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
            {filtered.length} {filtered.length === 1 ? 'run' : 'runs'}
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
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>Sin runs</p>
              <p className="text-xs max-w-xs" style={{ color: 'var(--dome-text-muted)' }}>
                Ejecuta una automatización o inicia un agente para ver los logs aquí.
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
                      {formatDate(run.updatedAt)}
                      {run.steps?.length ? ` · ${run.steps.length} pasos` : ''}
                    </p>
                  </div>

                  {/* Status + delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={run.status} />
                    <button
                      type="button"
                      onClick={(e) => void handleDelete(run.id, e)}
                      disabled={deletingId === run.id}
                      className="rounded-lg p-1 hover:bg-[var(--dome-bg)] transition-colors"
                      title="Eliminar run"
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
  const [activeTab, setActiveTab] = useState<HubTab>('agents');
  const [automationsFilter, setAutomationsFilter] = useState<AutomationFilter | undefined>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const homeSidebarSection = useAppStore((s) => s.homeSidebarSection);
  const isWorkflowCanvasActive = typeof homeSidebarSection === 'string' && homeSidebarSection.startsWith('workflow:');

  // Pre-load agents & workflows for the edit drawer
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);

  useEffect(() => {
    getManyAgents().then(setAgents).catch(() => {});
    getWorkflows().then(setWorkflows).catch(() => {});
  }, []);

  // Called from AgentManagementView / WorkflowLibraryView when user clicks "Automatizaciones"
  const handleShowAutomations = useCallback((
    targetType: 'agent' | 'workflow',
    targetId: string,
    targetLabel: string,
  ) => {
    setAutomationsFilter({ targetType, targetId, targetLabel });
    setActiveTab('automations');
  }, []);

  const TABS = [
    { id: 'agents' as HubTab, label: 'Agentes', icon: <Bot className="w-4 h-4" strokeWidth={1.5} /> },
    { id: 'workflows' as HubTab, label: 'Workflows', icon: <Workflow className="w-4 h-4" strokeWidth={1.5} /> },
    { id: 'automations' as HubTab, label: 'Automatizaciones', icon: <Zap className="w-4 h-4" strokeWidth={1.5} /> },
    { id: 'runs' as HubTab, label: 'Runs', icon: <Activity className="w-4 h-4" strokeWidth={1.5} /> },
  ];

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
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
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
              {tab.icon}
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
            key={automationsFilter?.targetId ?? 'all'}
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
