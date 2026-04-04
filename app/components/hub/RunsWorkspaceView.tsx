'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Activity, Trash2, Loader2, ChevronLeft,
  Filter, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import ChatToolCard, { type ToolCallData } from '@/components/chat/ChatToolCard';
import {
  statusLabel as runStatusLabel,
  statusColor as runStatusColor,
  formatRunDate,
  formatDuration,
  RunProgressBar,
} from '@/components/automations/RunLogView';
import {
  listRuns,
  getRun,
  deleteRun,
  onRunUpdated,
  onRunStep,
  type PersistentRun,
  type PersistentRunStep,
} from '@/lib/automations/api';
import { getRunProgress } from '@/lib/automations/run-progress';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import HubListState from '@/components/ui/HubListState';
import HubListItem from '@/components/ui/HubListItem';
import HubEntityIcon from '@/components/ui/HubEntityIcon';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';

interface RunFilter {
  ownerType: 'all' | 'agent' | 'workflow';
  status: 'all' | 'running' | 'completed' | 'failed' | 'cancelled';
}

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
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 hover:bg-[var(--dome-surface)] shrink-0 mt-0.5"
          style={{ color: 'var(--dome-text-muted)' }}
          aria-label={t('common.back')}
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--dome-text)' }}>
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
            <span className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
              {t('runLog.started')} {formatRunDate(run.startedAt)}
            </span>
            {run.finishedAt && (
              <span className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                {t('runLog.finished')} {formatRunDate(run.finishedAt)}
              </span>
            )}
            <span className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
              {t('runLog.duration')} {formatDuration(run.startedAt, run.finishedAt)}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
              {steps.length === 1 ? t('runLog.step_singular') : t('runLog.step_plural', { count: steps.length })}
            </span>
            {progress?.mode === 'determinate' && (
              <span className="text-[10px] font-medium" style={{ color: 'var(--dome-accent)' }}>
                {progress.percent ?? 0}% · {progress.completed}/{progress.total}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar for running */}
      {isRunning && <RunProgressBar run={run} />}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Error */}
        {run.error && (
          <div
            className="rounded-lg border px-3 py-2.5 text-sm"
            style={{ borderColor: 'var(--error)', background: 'color-mix(in srgb, var(--error) 8%, transparent)', color: 'var(--error)' }}
          >
            <p className="font-semibold mb-1 text-xs">{t('runLog.error_title')}</p>
            <p className="text-[11px] font-mono">{run.error}</p>
          </div>
        )}

        {/* Output text */}
        {run.outputText && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--dome-text-muted)' }}>
              {t('runLog.response')}
            </p>
            <div
              className="rounded-lg border p-4 text-sm"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
            >
              <MarkdownRenderer content={run.outputText} />
            </div>
          </div>
        )}

        {/* Tool calls */}
        {toolSteps.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--dome-text-muted)' }}>
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
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--dome-text-muted)' }}>
              {t('runLog.agent_steps', { count: otherSteps.length })}
            </p>
            <div className="flex flex-col gap-2">
              {otherSteps.map((step) => (
                <div
                  key={step.id}
                  className="rounded-lg px-3 py-2.5 text-sm"
                  style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
                >
                  {step.title && (
                    <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--dome-text-muted)' }}>
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
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {isRunning ? (
              <>
                <Loader2 size={28} className="animate-spin mb-2" style={{ color: 'var(--dome-accent)' }} />
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('runLog.executing')}</p>
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>{t('runLog.no_steps')}</p>
            )}
          </div>
        )}

        {/* Summary */}
        {run.summary && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
              {t('runLog.summary')}
            </p>
            <p className="text-sm" style={{ color: 'var(--dome-text)' }}>{run.summary}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="shrink-0 px-4 py-2"
        style={{ borderTop: '1px solid var(--dome-border)', background: 'var(--dome-surface)' }}
      >
        <span className="text-[10px] font-mono" style={{ color: 'var(--dome-text-muted)' }}>
          ID: {run.id}
        </span>
      </div>
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────────────────────

function RunsTab() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
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
      const all = await listRuns({ limit: 100, projectId });
      // Exclude many — those are the user's own chat conversations, not automated flows
      setAllRuns(all.filter((r) => r.ownerType !== 'many'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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

  const countLabel =
    filtered.length === 1
      ? t('runLog.runs_count_one', { count: filtered.length })
      : t('runLog.runs_count_other', { count: filtered.length });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <HubToolbar
        dense
        leading={
          <HubTitleBlock
            icon={Activity}
            title={t('automationHub.tab_runs')}
            subtitle={countLabel}
          />
        }
        center={null}
        trailing={null}
      />
      <div
        className="flex flex-col gap-1.5 px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
          {ownerFilters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter((f) => ({ ...f, ownerType: key }))}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
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
          <div className="w-px h-3 mx-0.5" style={{ background: 'var(--dome-border)' }} />
          {statusFilters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter((f) => ({ ...f, status: key }))}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
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
      </div>

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
            icon={<Activity className="w-7 h-7" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} />}
            title={t('runLog.empty_runs')}
            description={t('runLog.empty_runs_hint')}
          />
        ) : (
          <div className="p-4">
            <div
              className="flex flex-col rounded-lg border overflow-hidden"
              role="list"
              style={{ borderColor: 'var(--dome-border)' }}
            >
              {filtered.map((run) => {
                const progress = getRunProgress(run);
                const ownerLabel =
                  run.ownerType === 'agent'
                    ? t('runLog.filter_owner_agent')
                    : t('runLog.filter_owner_workflow');
                const stepLine = run.steps?.length
                  ? run.steps.length === 1
                    ? t('runLog.step_singular')
                    : t('runLog.step_plural', { count: run.steps.length })
                  : '';
                return (
                  <HubListItem
                    key={run.id}
                    className="!px-3"
                    onClick={() => void handleSelectRun(run)}
                    disabled={loadingDetail === run.id}
                    icon={<HubEntityIcon kind={run.ownerType === 'agent' ? 'agent' : 'workflow'} size="md" />}
                    title={
                      <span className="text-xs font-semibold truncate" style={{ color: 'var(--dome-text)' }}>
                        {run.title || run.id}
                      </span>
                    }
                    subtitle={
                      <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
                        <span>{ownerLabel}</span>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="w-3 h-3 shrink-0" aria-hidden />
                          {formatHubDate(run.updatedAt, t('runLog.never'))}
                        </span>
                        {stepLine ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{stepLine}</span>
                          </>
                        ) : null}
                      </span>
                    }
                    meta={
                      progress?.mode === 'determinate' ? (
                        <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--dome-accent)' }}>
                          {progress.percent ?? 0}% · {progress.completed}/{progress.total}
                        </p>
                      ) : null
                    }
                    trailing={
                      <>
                        <StatusBadge status={run.status} />
                        <button
                          type="button"
                          onClick={(e) => void handleDelete(run.id, e)}
                          disabled={deletingId === run.id}
                          className="p-1 rounded-md hover:bg-[var(--dome-bg)] transition-colors"
                          title={t('runLog.delete_run_aria')}
                        >
                          {deletingId === run.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--error)' }} />
                          )}
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
  );
}
export default RunsTab;
