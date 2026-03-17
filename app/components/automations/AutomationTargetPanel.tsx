'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, RefreshCw, Save, Trash2, ExternalLink } from 'lucide-react';
import {
  deleteAutomation,
  getRun,
  listAutomations,
  listRuns,
  runAutomationNow,
  saveAutomation,
  startWorkflowRun,
  type AutomationDefinition,
  type AutomationOutputMode,
  type AutomationTargetType,
  type PersistentRun,
} from '@/lib/automations/api';
import { showToast } from '@/lib/store/useToastStore';
import RunLogView from './RunLogView';

interface AutomationTargetPanelProps {
  targetType: AutomationTargetType;
  targetId: string;
  targetLabel: string;
  defaultPrompt?: string;
  defaultToolIds?: string[];
  defaultMcpServerIds?: string[];
  allowDirectWorkflowRun?: boolean;
}

function formatDate(ts?: number | null) {
  if (!ts) return 'Nunca';
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string) {
  switch (status) {
    case 'queued':
      return 'En cola';
    case 'running':
      return 'Ejecutando';
    case 'waiting_approval':
      return 'Esperando aprobación';
    case 'completed':
      return 'Completado';
    case 'failed':
      return 'Fallido';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}

export default function AutomationTargetPanel({
  targetType,
  targetId,
  targetLabel,
  defaultPrompt,
  defaultToolIds,
  defaultMcpServerIds,
  allowDirectWorkflowRun = false,
}: AutomationTargetPanelProps) {
  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [runs, setRuns] = useState<PersistentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PersistentRun | null>(null);
  const [showLogView, setShowLogView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    triggerType: 'schedule' as AutomationDefinition['triggerType'],
    enabled: true,
    cadence: 'daily' as 'daily' | 'weekly' | 'cron-lite',
    hour: 8,
    weekday: 1,
    intervalMinutes: 60,
    outputMode: 'chat_only' as AutomationOutputMode,
    prompt: defaultPrompt || '',
  });

  const resetDraft = useCallback(() => {
    setDraft({
      title: '',
      description: '',
      triggerType: 'schedule',
      enabled: true,
      cadence: 'daily',
      hour: 8,
      weekday: 1,
      intervalMinutes: 60,
      outputMode: 'chat_only',
      prompt: defaultPrompt || '',
    });
  }, [defaultPrompt]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextAutomations, nextRuns] = await Promise.all([
        listAutomations({ targetType, targetId }),
        listRuns({ ownerType: targetType === 'many' ? 'many' : targetType, ownerId: targetId, limit: 8 }),
      ]);
      setAutomations(nextAutomations);
      setRuns(nextRuns);
    } catch (error) {
      console.error('[AutomationTargetPanel] refresh error:', error);
      showToast('error', error instanceof Error ? error.message : 'Error cargando automatizaciones');
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType]);

  useEffect(() => {
    void refresh();
    resetDraft();
    setSelectedRun(null);
  }, [refresh, resetDraft]);

  const canSave = useMemo(() => draft.title.trim().length > 0, [draft.title]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveAutomation({
        title: draft.title.trim(),
        description: draft.description.trim(),
        targetType,
        targetId,
        triggerType: draft.triggerType,
        enabled: draft.enabled,
        schedule: draft.triggerType === 'schedule'
          ? {
              cadence: draft.cadence,
              hour: draft.hour,
              weekday: draft.cadence === 'weekly' ? draft.weekday : null,
              intervalMinutes: draft.cadence === 'cron-lite' ? draft.intervalMinutes : undefined,
            }
          : null,
        inputTemplate: {
          prompt: draft.prompt.trim(),
          toolIds: defaultToolIds,
          mcpServerIds: defaultMcpServerIds,
        },
        outputMode: draft.outputMode,
      });
      showToast('success', 'Automatización guardada');
      resetDraft();
      await refresh();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [canSave, defaultMcpServerIds, defaultToolIds, draft, refresh, resetDraft, targetId, targetType]);

  const handleRunAutomation = useCallback(async (automationId: string) => {
    try {
      const run = await runAutomationNow(automationId);
      setSelectedRun(run);
      await refresh();
      showToast('success', 'Automatización lanzada');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo ejecutar');
    }
  }, [refresh]);

  const handleDeleteAutomation = useCallback(async (automationId: string) => {
    try {
      await deleteAutomation(automationId);
      setSelectedRun(null);
      await refresh();
      showToast('success', 'Automatización eliminada');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo eliminar');
    }
  }, [refresh]);

  const handleSelectRun = useCallback(async (runId: string) => {
    try {
      const run = await getRun(runId);
      setSelectedRun(run);
      setShowLogView(true);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo abrir el log');
    }
  }, []);

  const handleRunWorkflowNow = useCallback(async () => {
    try {
      const run = await startWorkflowRun({
        workflowId: targetId,
        title: `${targetLabel} · Manual`,
        inputTemplate: {
          prompt: draft.prompt.trim() || defaultPrompt || '',
        },
        outputMode: draft.outputMode,
      });
      setSelectedRun(run);
      await refresh();
      showToast('success', 'Workflow lanzado');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo lanzar el workflow');
    }
  }, [defaultPrompt, draft.outputMode, draft.prompt, refresh, targetId, targetLabel]);

  return (
    <>
    <div
      className="rounded-2xl border p-4"
      style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
            Automatizaciones de {targetLabel}
          </h3>
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            Triggers, ejecución manual y últimos runs persistentes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg p-2 transition-colors hover:bg-[var(--dome-bg)]"
          title="Refrescar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--dome-text-muted)' }} />
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span style={{ color: 'var(--dome-text-muted)' }}>Título</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
                placeholder="Briefing diario"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span style={{ color: 'var(--dome-text-muted)' }}>Trigger</span>
              <select
                value={draft.triggerType}
                onChange={(event) => setDraft((prev) => ({ ...prev, triggerType: event.target.value as AutomationDefinition['triggerType'] }))}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
              >
                <option value="manual">Manual</option>
                <option value="schedule">Programado</option>
                <option value="contextual">Contextual</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span style={{ color: 'var(--dome-text-muted)' }}>Descripción</span>
            <input
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
              placeholder="Qué hace y cuándo debería correr"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span style={{ color: 'var(--dome-text-muted)' }}>Prompt / input base</span>
            <textarea
              value={draft.prompt}
              onChange={(event) => setDraft((prev) => ({ ...prev, prompt: event.target.value }))}
              className="min-h-[92px] rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
              placeholder="Prompt inicial o parámetros base"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span style={{ color: 'var(--dome-text-muted)' }}>Salida</span>
              <select
                value={draft.outputMode}
                onChange={(event) => setDraft((prev) => ({ ...prev, outputMode: event.target.value as AutomationOutputMode }))}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
              >
                <option value="chat_only">Chat</option>
                <option value="note">Nota</option>
                <option value="mixed">Mixto</option>
                <option value="studio_output">Studio</option>
              </select>
            </label>
            {draft.triggerType === 'schedule' && (
              <>
                <label className="flex flex-col gap-1 text-xs">
                  <span style={{ color: 'var(--dome-text-muted)' }}>Cadencia</span>
                  <select
                    value={draft.cadence}
                    onChange={(event) => setDraft((prev) => ({ ...prev, cadence: event.target.value as 'daily' | 'weekly' | 'cron-lite' }))}
                    className="rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
                  >
                    <option value="daily">Diaria</option>
                    <option value="weekly">Semanal</option>
                    <option value="cron-lite">Cada X min</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span style={{ color: 'var(--dome-text-muted)' }}>{draft.cadence === 'cron-lite' ? 'Intervalo' : 'Hora'}</span>
                  <input
                    type="number"
                    min={draft.cadence === 'cron-lite' ? 1 : 0}
                    max={draft.cadence === 'cron-lite' ? 1440 : 23}
                    value={draft.cadence === 'cron-lite' ? draft.intervalMinutes : draft.hour}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        intervalMinutes: Number(event.target.value),
                        hour: Number(event.target.value),
                      }))
                    }
                    className="rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
                  />
                </label>
              </>
            )}
          </div>

          {draft.triggerType === 'schedule' && draft.cadence === 'weekly' && (
            <label className="flex flex-col gap-1 text-xs">
              <span style={{ color: 'var(--dome-text-muted)' }}>Día de la semana</span>
              <select
                value={draft.weekday}
                onChange={(event) => setDraft((prev) => ({ ...prev, weekday: Number(event.target.value) }))}
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
              >
                <option value={1}>Lunes</option>
                <option value={2}>Martes</option>
                <option value={3}>Miércoles</option>
                <option value={4}>Jueves</option>
                <option value={5}>Viernes</option>
                <option value={6}>Sábado</option>
                <option value={7}>Domingo</option>
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--dome-text)' }}>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            Activada al guardar
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-60"
              style={{ background: 'var(--dome-accent)', color: 'white' }}
            >
              <Save className="h-4 w-4" />
              Guardar automatización
            </button>
            {allowDirectWorkflowRun && (
              <button
                type="button"
                onClick={() => void handleRunWorkflowNow()}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
                style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
              >
                <Play className="h-4 w-4" />
                Ejecutar workflow ahora
              </button>
            )}
          </div>

          <div className="space-y-3">
            {automations.length === 0 ? (
              <div className="rounded-xl border border-dashed p-3 text-xs" style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}>
                Todavía no hay automatizaciones para este destino.
              </div>
            ) : automations.map((automation) => (
              <div
                key={automation.id}
                className="rounded-xl border p-3"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      {automation.title}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                      {automation.triggerType} · {automation.enabled ? 'Activa' : 'Pausada'} · último run: {formatDate(automation.lastRunAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRunAutomation(automation.id)}
                      className="rounded-lg p-2 transition-colors hover:bg-[var(--dome-surface)]"
                      title="Ejecutar ahora"
                    >
                      <Play className="h-4 w-4" style={{ color: 'var(--dome-accent)' }} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteAutomation(automation.id)}
                      className="rounded-lg p-2 transition-colors hover:bg-[var(--error-bg)]"
                      title="Eliminar automatización"
                    >
                      <Trash2 className="h-4 w-4" style={{ color: 'var(--error)' }} />
                    </button>
                  </div>
                </div>
                {automation.description ? (
                  <p className="mt-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    {automation.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}>
            <p className="mb-3 text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
              Últimos runs
            </p>
            <div className="space-y-2">
              {runs.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  No hay runs todavía.
                </p>
              ) : runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => void handleSelectRun(run.id)}
                  className="w-full rounded-xl border px-3 py-2 text-left"
                  style={{ borderColor: 'var(--dome-border)', background: selectedRun?.id === run.id ? 'var(--dome-accent-bg)' : 'transparent' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      {run.title || run.id}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                      {statusLabel(run.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    {formatDate(run.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {selectedRun && (
            <div
              className="rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-[var(--dome-surface)] transition-colors"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
              onClick={() => setShowLogView(true)}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
                  {selectedRun.title || selectedRun.id}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                  {statusLabel(selectedRun.status)} · {formatDate(selectedRun.updatedAt)} · {(selectedRun.steps ?? []).length} pasos
                </p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
            </div>
          )}
        </div>
      </div>
    </div>

      {showLogView && selectedRun && (
        <RunLogView
          run={selectedRun}
          onClose={() => setShowLogView(false)}
        />
      )}
    </>
  );
}
