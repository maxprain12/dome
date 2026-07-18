import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
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
import { askStudioMany } from '@/components/studio-hub';
import { DomainStatChips, type DomainStat } from '@/components/shared/DomainStatChips';
import { HubHeader } from '@/components/hub/HubHeader';
import { HubSearch } from '@/components/hub/HubSearch';
import { HubSectionLabel } from '@/components/hub/HubSectionLabel';
import ListState from '@/components/shared/ListState';
import RunStatusBadge from '@/components/automations/RunStatusBadge';
import { cn } from '@/lib/utils';

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

/** Runs monitor — live queue with master–detail layout. */
export default function RunsStudioView() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

  const [allRuns, setAllRuns] = useState<PersistentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PersistentRun | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const selectedRunIdRef = useRef<string | null>(null);
  const selectSeqRef = useRef(0);
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
    let cancelled = false;
    void (async () => {
      try {
        const full = await getRun(pendingRunId);
        if (!cancelled && full) setSelectedRun(full);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
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
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          (r.title || '').toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          (r.ownerType || '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [allRuns, ownerFilter, statusFilter, query]);

  const metrics = useMemo(() => {
    const todayRuns = allRuns.filter((r) => isToday(r.updatedAt ?? r.startedAt));
    const running = allRuns.filter((r) => ACTIVE_STATUSES.has(r.status)).length;
    const completed = todayRuns.filter((r) => r.status === 'completed').length;
    const failed = todayRuns.filter((r) => r.status === 'failed').length;
    const successRate = todayRuns.length > 0 ? Math.round((completed / todayRuns.length) * 100) : 100;
    return { totalToday: todayRuns.length, running, completed, failed, successRate };
  }, [allRuns]);

  const stats: DomainStat[] = [
    {
      id: 'today',
      label: t('runLog.metrics_total_today'),
      value: metrics.totalToday,
      tone: 'success',
    },
    {
      id: 'running',
      label: t('orchestration.runs.stat_running'),
      value: metrics.running,
      tone: metrics.running > 0 ? 'info' : 'default',
      active: statusFilter === 'running',
      onClick: () => setStatusFilter((s) => (s === 'running' ? 'all' : 'running')),
    },
    {
      id: 'success',
      label: t('orchestration.runs.stat_success_rate'),
      value: `${metrics.successRate}%`,
      tone: metrics.successRate >= 80 ? 'success' : 'warning',
    },
    {
      id: 'failed',
      label: t('runLog.metrics_failed'),
      value: metrics.failed,
      tone: metrics.failed > 0 ? 'error' : 'default',
      active: statusFilter === 'failed',
      onClick: () => setStatusFilter((s) => (s === 'failed' ? 'all' : 'failed')),
    },
  ];

  const handleSelectRun = async (run: PersistentRun) => {
    const seq = ++selectSeqRef.current;
    setLoadingDetail(run.id);
    try {
      const full = await getRun(run.id);
      if (selectSeqRef.current !== seq) return;
      setSelectedRun(full ?? run);
    } catch {
      if (selectSeqRef.current !== seq) return;
      setSelectedRun(run);
    } finally {
      if (selectSeqRef.current === seq) setLoadingDetail(null);
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

  const queueBody = loading ? (
    <ListState variant="loading" />
  ) : filtered.length === 0 ? (
    <ListState
      variant="empty"
      compact
      title={t('runLog.empty_runs')}
      description={t('runLog.empty_runs_hint')}
      action={
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => askStudioMany(t('orchestration.agent_prompt_runs'))}
        >
          {t('orchestration.agent_ask_many')}
        </Button>
      }
    />
  ) : (
    <section className="flex min-h-0 flex-col gap-2">
      <HubSectionLabel>{t('orchestration.agent_queue_runs')}</HubSectionLabel>
      <div className="flex flex-col gap-0.5">
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
          const OwnerIcon =
            run.ownerType === 'agent' ? Bot : run.ownerType === 'many' ? Sparkles : Workflow;
          const ownerLabel =
            run.ownerType === 'agent'
              ? t('runLog.filter_owner_agent')
              : run.ownerType === 'many'
                ? t('runLog.filter_owner_many')
                : t('runLog.filter_owner_workflow');
          return (
            <button
              key={run.id}
              type="button"
              onClick={() => void handleSelectRun(run)}
              className={cn(
                'relative flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left',
                selectedRun?.id === run.id ? 'bg-accent' : 'hover:bg-accent',
                loadingDetail === run.id && 'opacity-60',
              )}
            >
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 w-0.5 rounded-full"
                style={{ background: runStatusColor(run.status) }}
              />
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <OwnerIcon className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {run.title || run.id}
                  </span>
                  <RunStatusBadge status={run.status} />
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{ownerLabel}</span>
                  <span className="inline-flex items-center gap-1">
                    <HugeiconsIcon icon={ClockIcon} className="size-3" />
                    {formatHubDate(run.updatedAt, t('runLog.never'))}
                  </span>
                  {duration ? <span>{duration}</span> : null}
                </span>
                {(active || progressPercent > 0) && progressPercent < 100 ? (
                  <span className="mt-0.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full origin-left rounded-full transition-transform [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out)]"
                      style={{
                        transform: `scaleX(${Math.min(1, Math.max(active && progressPercent === 0 ? 0.08 : progressPercent / 100, 0))})`,
                        background: runStatusColor(run.status),
                      }}
                    />
                  </span>
                ) : null}
              </span>
              <span
                className="flex shrink-0 items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="presentation"
              >
                {active ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={t('orchestration.runs.stop')}
                    disabled={stoppingId === run.id}
                    onClick={() => void handleStop(run.id)}
                  >
                    {stoppingId === run.id ? (
                      <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" />
                    ) : (
                      <HugeiconsIcon icon={SquareIcon} className="size-3.5 text-warning" />
                    )}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive"
                  title={t('runLog.delete_run_aria')}
                  disabled={deletingId === run.id}
                  onClick={() => void handleDelete(run.id)}
                >
                  {deletingId === run.id ? (
                    <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={Trash2Icon} className="size-3.5" />
                  )}
                </Button>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  // Full-screen audit view — side panels are too narrow for transcripts/steps.
  if (selectedRun) {
    return (
      <div key={`run-${selectedRun.id}`} className="flex h-full min-h-0 flex-col overflow-hidden studio-view-enter">
        <RunDetailView
          run={selectedRun}
          onBack={() => setSelectedRun(null)}
          onStop={
            ACTIVE_STATUSES.has(selectedRun.status)
              ? () => void handleStop(selectedRun.id)
              : undefined
          }
          onDelete={() => void handleDelete(selectedRun.id)}
          stopping={stoppingId === selectedRun.id}
          deleting={deletingId === selectedRun.id}
        />
      </div>
    );
  }

  return (
    <div
      key="library"
      className="@container/runs flex h-full min-h-0 flex-col overflow-hidden bg-background studio-view-enter"
    >
      <div className="shrink-0 space-y-3 border-b bg-card px-4 py-3 sm:px-6">
        <HubHeader
          title={t('tabs.runs')}
          description={t('automationHub.runs_subtitle')}
          actions={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => askStudioMany(t('orchestration.agent_prompt_runs'))}
            >
              {t('orchestration.agent_ask_many')}
            </Button>
          }
        />
        <HubSearch
          value={query}
          onChange={setQuery}
          placeholder={t('orchestration.agent_search')}
        />
        <DomainStatChips stats={stats} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ToggleGroup
            value={[ownerFilter]}
            onValueChange={(values) => values[0] && setOwnerFilter(values[0] as OwnerFilter)}
          >
            {ownerOptions.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} size="sm">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            value={[statusFilter]}
            onValueChange={(values) => values[0] && setStatusFilter(values[0] as StatusFilter)}
          >
            {statusOptions.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} size="sm">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">{queueBody}</div>
    </div>
  );
}
