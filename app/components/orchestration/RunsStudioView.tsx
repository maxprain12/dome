import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  Activity01Icon as ActivityIcon,
  BotIcon as BotIcon,
  Clock01Icon as ClockIcon,
  Loading03Icon as Loader2Icon,
  SquareIcon as SquareIcon,
  Delete02Icon as Trash2Icon,
  WorkflowSquare01Icon as WorkflowIcon,
  SparklesIcon as SparklesIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  abortRun,
  deleteRun,
  getRun,
  listRuns,
  onRunStep,
  onRunUpdated,
  type PersistentRun,
} from '@/lib/automations/api';
import { getRunProgress } from '@/lib/automations/run-progress';
import { statusColor as runStatusColor } from '@/lib/automations/run-status';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import { useHubListLoader } from '@/lib/hub/useHubListLoader';
import { HUB_RUNS_CHANGED } from '@/lib/hub/hubEvents';
import { PENDING_RUN_ID_KEY } from '@/lib/hub/hubStorageKeys';
import { formatHubDate } from '@/components/hub/runs/runPresentation';
import RunDetailView from './RunDetailView';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import OrchestrationShell, { type OrchestrationStat } from './OrchestrationShell';

import { Skeleton } from '@/components/ui/skeleton';
import RunStatusBadge from '@/components/automations/RunStatusBadge';

const Bot = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BotIcon} {...props} />
);
const Workflow = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={WorkflowIcon} {...props} />
);
const Sparkles = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={SparklesIcon} {...props} />
);
type OwnerFilter = 'all' | 'agent' | 'workflow' | 'many';
type StatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'cancelled';

const ACTIVE_STATUSES = new Set(['running', 'queued', 'waiting_approval']);

function isToday(ts: number | null | undefined): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDuration(run: PersistentRun): string | null {
  const start = run.startedAt;
  if (!start) return null;
  const end = run.finishedAt ?? (ACTIVE_STATUSES.has(run.status) ? Date.now() : run.updatedAt);
  if (!end || end < start) return null;
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function mergeRunIntoList(prev: PersistentRun[], run: PersistentRun): PersistentRun[] {
  const existing = prev.find((entry) => entry.id === run.id);
  const merged = existing
    ? {
        ...existing,
        ...run,
        steps:
          Array.isArray(run.steps) && run.steps.length > 0 ? run.steps : existing.steps ?? run.steps,
        links: run.links ?? existing.links,
      }
    : run;
  const next = existing
    ? prev.map((entry) => (entry.id === run.id ? merged : entry))
    : [merged, ...prev];
  return next.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 100);
}

function mergeRunIntoSelected(prev: PersistentRun | null, run: PersistentRun): PersistentRun | null {
  return prev?.id === run.id
    ? {
        ...prev,
        ...run,
        steps: Array.isArray(run.steps) && run.steps.length > 0 ? run.steps : prev.steps,
        links: run.links ?? prev.links,
      }
    : prev;
}

/** Runs section — redesigned execution monitor with live KPIs and status rails. */
export default function RunsStudioView() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const [allRuns, setAllRuns] = useState<PersistentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PersistentRun | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const selectedRunIdRef = useRef<string | null>(null);
  const detailRefreshTimeoutRef = useRef<number | null>(null);
  const pendingRunHandledRef = useRef(false);

  useEffect(() => {
    selectedRunIdRef.current = selectedRun?.id ?? null;
  }, [selectedRun]);

  const fetchListData = useCallback(async () => {
    const all = await listRuns({ limit: 100, projectId });
    setAllRuns(all);
  }, [projectId]);

  const { initialLoading: loading } = useHubListLoader(fetchListData, [projectId], {
    eventName: HUB_RUNS_CHANGED,
  });

  // Deep link: an automation "run now" stores the run id before opening this tab.
  useEffect(() => {
    if (pendingRunHandledRef.current) return;
    let pendingRunId: string | null = null;
    try {
      pendingRunId = sessionStorage.getItem(PENDING_RUN_ID_KEY);
      if (pendingRunId) sessionStorage.removeItem(PENDING_RUN_ID_KEY);
    } catch {
      /* ignore */
    }
    if (!pendingRunId) return;
    pendingRunHandledRef.current = true;
    void (async () => {
      try {
        const full = await getRun(pendingRunId);
        if (full) setSelectedRun(full);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const scheduleRefreshSelectedRun = useCallback((runId: string) => {
    if (typeof window === 'undefined') return;
    if (detailRefreshTimeoutRef.current) window.clearTimeout(detailRefreshTimeoutRef.current);
    detailRefreshTimeoutRef.current = window.setTimeout(() => {
      void getRun(runId)
        .then((full) => {
          if (!full || selectedRunIdRef.current !== runId) return;
          setSelectedRun(full);
        })
        .catch(() => {})
        .finally(() => {
          detailRefreshTimeoutRef.current = null;
        });
    }, 150);
  }, []);

  // Live updates: merge run/step events into the list and the open detail.
  useEffect(() => {
    const unsubUpdated = onRunUpdated(({ run }) => {
      setAllRuns((prev) => mergeRunIntoList(prev, run));
      if (selectedRunIdRef.current === run.id) {
        setSelectedRun((prev) => mergeRunIntoSelected(prev, run));
        scheduleRefreshSelectedRun(run.id);
      }
    });

    const unsubStep = onRunStep(({ step }) => {
      if (selectedRunIdRef.current === step.runId) scheduleRefreshSelectedRun(step.runId);
      setAllRuns((prev) =>
        prev.map((run) => (run.id === step.runId ? { ...run, updatedAt: step.updatedAt ?? Date.now() } : run)),
      );
    });

    return () => {
      unsubUpdated();
      unsubStep();
      if (typeof window !== 'undefined' && detailRefreshTimeoutRef.current != null) {
        window.clearTimeout(detailRefreshTimeoutRef.current);
        detailRefreshTimeoutRef.current = null;
      }
    };
  }, [scheduleRefreshSelectedRun]);

  const filtered = useMemo(() => {
    let result = allRuns;
    if (ownerFilter !== 'all') result = result.filter((r) => r.ownerType === ownerFilter);
    if (statusFilter !== 'all') {
      result = result.filter((r) =>
        statusFilter === 'running' ? ACTIVE_STATUSES.has(r.status) : r.status === statusFilter,
      );
    }
    return result;
  }, [allRuns, ownerFilter, statusFilter]);

  const metrics = useMemo(() => {
    const todayRuns = allRuns.filter((r) => isToday(r.updatedAt ?? r.startedAt));
    const running = allRuns.filter((r) => ACTIVE_STATUSES.has(r.status)).length;
    const completed = todayRuns.filter((r) => r.status === 'completed').length;
    const failed = todayRuns.filter((r) => r.status === 'failed').length;
    const successRate = todayRuns.length > 0 ? Math.round((completed / todayRuns.length) * 100) : 100;
    return { totalToday: todayRuns.length, running, completed, failed, successRate };
  }, [allRuns]);

  const stats: OrchestrationStat[] = [
    { label: t('runLog.metrics_total_today'), value: metrics.totalToday, tone: 'success' },
    {
      label: t('orchestration.runs.stat_running'),
      value: metrics.running,
      tone: metrics.running > 0 ? 'info' : 'default',
      sub:
        metrics.running > 0
          ? t('runLog.metrics_in_progress', { count: metrics.running })
          : t('runLog.metrics_in_progress_zero'),
    },
    {
      label: t('orchestration.runs.stat_success_rate'),
      value: `${metrics.successRate}%`,
      tone: metrics.successRate >= 80 ? 'success' : 'warning',
      sub: t('runLog.metrics_success_rate', { rate: metrics.successRate }),
    },
    {
      label: t('runLog.metrics_failed'),
      value: metrics.failed,
      tone: metrics.failed > 0 ? 'error' : 'default',
      sub:
        metrics.failed === 0
          ? t('runLog.metrics_no_errors_today')
          : t('runLog.metrics_errors_today', { count: metrics.failed }),
    },
  ];

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

  const handleStop = async (runId: string) => {
    setStoppingId(runId);
    try {
      await abortRun(runId);
      const full = await getRun(runId);
      if (full) {
        setAllRuns((prev) => prev.map((r) => (r.id === runId ? full : r)));
        if (selectedRunIdRef.current === runId) setSelectedRun(full);
      }
    } catch {
      showToast('error', t('toast.run_stop_error'));
    } finally {
      setStoppingId(null);
    }
  };

  const handleDelete = async (runId: string) => {
    setDeletingId(runId);
    try {
      const run = allRuns.find((r) => r.id === runId) ?? selectedRun;
      if (run && ACTIVE_STATUSES.has(run.status)) await abortRun(runId);
      await deleteRun(runId);
      if (selectedRunIdRef.current === runId) setSelectedRun(null);
      setAllRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch {
      showToast('error', t('toast.run_delete_error'));
    } finally {
      setDeletingId(null);
    }
  };

  if (selectedRun) {
    return (
      <RunDetailView
        run={selectedRun}
        onBack={() => setSelectedRun(null)}
        onStop={ACTIVE_STATUSES.has(selectedRun.status) ? () => void handleStop(selectedRun.id) : undefined}
        onDelete={() => void handleDelete(selectedRun.id)}
        stopping={stoppingId === selectedRun.id}
        deleting={deletingId === selectedRun.id}
      />
    );
  }

  const ownerOptions: Array<{ value: OwnerFilter; label: string }> = [
    { value: 'all', label: t('runLog.filter_owner_all') },
    { value: 'agent', label: t('runLog.filter_owner_agent') },
    { value: 'workflow', label: t('runLog.filter_owner_workflow') },
    { value: 'many', label: t('runLog.filter_owner_many') },
  ];
  const statusOptions: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: t('runLog.filter_status_all') },
    { value: 'running', label: t('runLog.filter_status_running') },
    { value: 'completed', label: t('runLog.filter_status_completed') },
    { value: 'failed', label: t('runLog.filter_status_failed') },
    { value: 'cancelled', label: t('runLog.filter_status_cancelled') },
  ];

  return (
    <OrchestrationShell
      section="runs"
      title={t('tabs.runs')}
      subtitle={t('automationHub.runs_subtitle')}
      stats={stats}
      toolbar={
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {t('runLog.filter_group_type')}
            </span>
            <ToggleGroup value={[ownerFilter]} onValueChange={(values) => values[0] && setOwnerFilter(values[0] as OwnerFilter)}>
              {ownerOptions.map((option) => <ToggleGroupItem key={option.value} value={option.value} size="sm">{option.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {t('runLog.filter_group_status')}
            </span>
            <ToggleGroup value={[statusFilter]} onValueChange={(values) => values[0] && setStatusFilter(values[0] as StatusFilter)}>
              {statusOptions.map((option) => <ToggleGroupItem key={option.value} value={option.value} size="sm">{option.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="p-6">
          <output className="flex w-full max-w-full flex-col gap-3" aria-live="polite">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </output>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6">
          <div
            className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl px-8 py-10 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex size-14 items-center justify-center rounded-2xl"
              style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
            >
              <HugeiconsIcon icon={ActivityIcon} className="size-7" strokeWidth={1.5} />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {t('runLog.empty_runs')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('runLog.empty_runs_hint')}
            </p>
          </div>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-6">
          {filtered.map((run) => {
            const progress = getRunProgress(run);
            const active = ACTIVE_STATUSES.has(run.status);
            const progressPercent =
              progress?.mode === 'determinate'
                ? (progress.percent ?? 0)
                : run.status === 'completed'
                  ? 100
                  : 0;
            const duration = formatDuration(run);
            const OwnerIcon = run.ownerType === 'agent' ? Bot : run.ownerType === 'many' ? Sparkles : Workflow;
            const ownerLabel =
              run.ownerType === 'agent'
                ? t('runLog.filter_owner_agent')
                : run.ownerType === 'many'
                  ? t('runLog.filter_owner_many')
                  : t('runLog.filter_owner_workflow');
            return (
              <li key={run.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => void handleSelectRun(run)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleSelectRun(run);
                    }
                  }}
                  className="relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl py-3 pl-5 pr-4 transition-colors hover:bg-accent"
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    opacity: loadingDetail === run.id ? 0.6 : 1,
                  }}
                >
                  {/* Status rail */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ background: runStatusColor(run.status) }}
                  />
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'var(--accent)', color: 'var(--muted-foreground)' }}
                  >
                    <OwnerIcon className="size-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="min-w-0 truncate text-sm font-semibold text-foreground"
                        title={run.title || run.id}
                      >
                        {run.title || run.id}
                      </span>
                      <RunStatusBadge status={run.status} />
                    </div>
                    <div
                      className="mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-muted-foreground"
                    >
                      <span>{ownerLabel}</span>
                      <span className="inline-flex items-center gap-1">
                        <HugeiconsIcon icon={ClockIcon} className="size-3" aria-hidden />
                        {formatHubDate(run.updatedAt, t('runLog.never'))}
                      </span>
                      {duration ? <span>{t('orchestration.runs.duration', { duration })}</span> : null}
                      {run.steps?.length ? (
                        <span>
                          {run.steps.length === 1
                            ? t('runLog.step_singular')
                            : t('runLog.step_plural', { count: run.steps.length })}
                        </span>
                      ) : null}
                    </div>
                    {(active || progressPercent > 0) && progressPercent < 100 ? (
                      <div
                        className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-accent"
                        aria-hidden
                      >
                        <div
                          className="h-full rounded-full transition-transform duration-200 ease-[var(--ease-out)]"
                          style={{
                            width: `${Math.min(100, Math.max(active && progressPercent === 0 ? 8 : progressPercent, 0))}%`,
                            background: runStatusColor(run.status),
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    {active ? (
                      <Button variant="ghost" title={t('orchestration.runs.stop')} aria-label={t('orchestration.runs.stop')} disabled={stoppingId === run.id} onClick={() => void handleStop(run.id)} size="icon-xs">
                        {stoppingId === run.id ? (
                          <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <HugeiconsIcon icon={SquareIcon} className="size-3.5 text-[var(--warning)]" />
                        )}
                      </Button>
                    ) : null}
                    <Button variant="ghost" title={t('runLog.delete_run_aria')} aria-label={t('runLog.delete_run_aria')} disabled={deletingId === run.id} className="!text-destructive hover:!bg-[color-mix(in srgb, var(--destructive) 12%, transparent)] disabled:!opacity-50" onClick={() => void handleDelete(run.id)} size="icon-xs">
                      {deletingId === run.id ? (
                        <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <HugeiconsIcon icon={Trash2Icon} className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </OrchestrationShell>
  );
}
