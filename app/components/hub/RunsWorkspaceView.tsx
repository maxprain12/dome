'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Activity, Trash2, Loader2, Clock } from 'lucide-react';
import {
  listRuns,
  getRun,
  deleteRun,
  abortRun,
  onRunUpdated,
  onRunStep,
  type PersistentRun,
} from '@/lib/automations/api';
import { getRunProgress } from '@/lib/automations/run-progress';
import { statusColor as runStatusColor } from '@/lib/automations/run-status';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import DomeButton from '@/components/ui/DomeButton';
import HubListState from '@/components/ui/HubListState';
import HubBentoCard from '@/components/ui/HubBentoCard';
import HubEntityIcon from '@/components/ui/HubEntityIcon';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
import { useEditorialHub } from '@/lib/context/EditorialHubContext';
import { useHubWorkspace } from '@/lib/context/HubWorkspaceContext';
import { useHubListLoader } from '@/lib/hub/useHubListLoader';
import { HUB_RUNS_CHANGED } from '@/lib/hub/hubEvents';
import { PENDING_RUN_ID_KEY } from '@/lib/hub/hubStorageKeys';
import DomeStatusBadge from '@/components/ui/DomeStatusBadge';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import { HubFilterBar, HubFilterRow } from '@/components/ui/HubFilterBar';

interface RunFilter {
  ownerType: 'all' | 'agent' | 'workflow';
  status: 'all' | 'running' | 'completed' | 'failed' | 'cancelled';
}

// Piezas extraídas (03/T02) — misma UI, archivos por sección.
import { formatHubDate } from './runs/runPresentation';
import RunDetailScreen from './runs/RunDetailScreen';

interface RunsTabProps {
  onRegisterSilentRefresh?: (refresh: (() => void) | null) => void;
}

function RunsTab({ onRegisterSilentRefresh }: RunsTabProps) {
  const { t } = useTranslation();
  const editorialHub = useEditorialHub();
  const hubCardVariant = editorialHub ? 'editorial' : 'card';
  const hubListClass = editorialHub
    ? 'hub-list-stack hub-list-stack--runs w-full max-w-full'
    : 'flex w-full max-w-full flex-col gap-3';
  const hubWorkspace = useHubWorkspace();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [allRuns, setAllRuns] = useState<PersistentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PersistentRun | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunFilter>({ ownerType: 'all', status: 'all' });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const selectedRunIdRef = useRef<string | null>(null);
  const detailRefreshTimeoutRef = useRef<number | null>(null);
  const pendingRunHandledRef = useRef(false);

  useEffect(() => {
    selectedRunIdRef.current = selectedRun?.id ?? null;
    hubWorkspace?.reportRunsDetailActive(selectedRun != null);
  }, [selectedRun, hubWorkspace]);

  useEffect(() => {
    return () => {
      hubWorkspace?.reportRunsDetailActive(false);
    };
  }, [hubWorkspace]);

  const fetchListData = useCallback(async () => {
    const all = await listRuns({ limit: 100, projectId });
    setAllRuns(all.filter((r) => r.ownerType !== 'many'));
  }, [projectId]);

  const { initialLoading: loading, reload: load } = useHubListLoader(fetchListData, [projectId], {
    eventName: HUB_RUNS_CHANGED,
  });

  useEffect(() => {
    if (!onRegisterSilentRefresh) return;
    onRegisterSilentRefresh(() => {
      void load({ silent: true });
    });
    return () => onRegisterSilentRefresh(null);
  }, [load, onRegisterSilentRefresh]);

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
  const scheduleRefreshSelectedRunRef = useRef(scheduleRefreshSelectedRun);
  scheduleRefreshSelectedRunRef.current = scheduleRefreshSelectedRun;

  useEffect(() => {
    const unsubUpdated = onRunUpdated(({ run }) => {
      if (run.ownerType === 'many') return;
      setAllRuns((prev) => {
        const filteredPrev = prev.filter((entry) => entry.ownerType !== 'many');
        const existing = filteredPrev.find((entry) => entry.id === run.id);
        const merged = existing
          ? {
              ...existing,
              ...run,
              steps:
                Array.isArray(run.steps) && run.steps.length > 0
                  ? run.steps
                  : existing.steps ?? run.steps,
              links: run.links ?? existing.links,
            }
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
            ? {
                ...prev,
                ...run,
                steps:
                  Array.isArray(run.steps) && run.steps.length > 0
                    ? run.steps
                    : prev.steps,
                links: run.links ?? prev.links,
              }
            : prev,
        );
        scheduleRefreshSelectedRunRef.current(run.id);
      }
    });

    const unsubStep = onRunStep(({ step }) => {
      if (selectedRunIdRef.current === step.runId) {
        scheduleRefreshSelectedRunRef.current(step.runId);
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
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- clear pending detail refresh on unmount only
  useEffect(() => {
    return () => {
      const pending = detailRefreshTimeoutRef.current;
      if (typeof window !== 'undefined' && pending != null) {
        window.clearTimeout(pending);
        detailRefreshTimeoutRef.current = null;
      }
    };
  }, []);

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

  const runsMetrics = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 86_400_000;
    const todayRuns = allRuns.filter((r) => {
      const ts = r.updatedAt ?? r.startedAt;
      return ts >= startOfDay && ts < endOfDay;
    });
    const running = todayRuns.filter(
      (r) =>
        r.status === 'running' || r.status === 'queued' || r.status === 'waiting_approval',
    ).length;
    const completed = todayRuns.filter((r) => r.status === 'completed').length;
    const failed = todayRuns.filter((r) => r.status === 'failed').length;
    const successRate =
      todayRuns.length > 0 ? Math.round((completed / todayRuns.length) * 100) : 100;
    return { totalToday: todayRuns.length, running, completed, failed, successRate };
  }, [allRuns]);

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
        if (selectedRun?.id === runId) setSelectedRun(full);
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
      if (
        run &&
        (run.status === 'running' ||
          run.status === 'queued' ||
          run.status === 'waiting_approval')
      ) {
        await abortRun(runId);
      }
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
        onStop={
          selectedRun.status === 'running' ||
          selectedRun.status === 'queued' ||
          selectedRun.status === 'waiting_approval'
            ? () => void handleStop(selectedRun.id)
            : undefined
        }
        onDelete={() => void handleDelete(selectedRun.id)}
        stopping={stoppingId === selectedRun.id}
        deleting={deletingId === selectedRun.id}
      />
    );
  }

  const countLabel =
    filtered.length === 1
      ? t('runLog.runs_count_one', { count: filtered.length })
      : t('runLog.runs_count_other', { count: filtered.length });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {!editorialHub ? (
        <HubToolbar dense>
          <HubToolbar.Leading>
            <HubTitleBlock
              icon={Activity}
              title={t('automationHub.tab_runs')}
              subtitle={countLabel}
            />
          </HubToolbar.Leading>
        </HubToolbar>
      ) : null}
      {editorialHub ? (
        <div className="hub-runs-metrics" aria-label={t('runLog.metrics_total_today')}>
          <div className="hub-runs-metric-card">
            <span className="label">{t('runLog.metrics_total_today')}</span>
            <span className="value">{runsMetrics.totalToday}</span>
            <span className="sub">
              {runsMetrics.running > 0
                ? t('runLog.metrics_in_progress', { count: runsMetrics.running })
                : t('runLog.metrics_in_progress_zero')}
            </span>
          </div>
          <div className="hub-runs-metric-card">
            <span className="label">{t('runLog.metrics_completed')}</span>
            <span className="value is-success">{runsMetrics.completed}</span>
            <span className="sub">{t('runLog.metrics_success_rate', { rate: runsMetrics.successRate })}</span>
          </div>
          <div className="hub-runs-metric-card">
            <span className="label">{t('runLog.metrics_failed')}</span>
            <span className={cn('value', runsMetrics.failed > 0 && 'is-error')}>{runsMetrics.failed}</span>
            <span className="sub">
              {runsMetrics.failed === 0
                ? t('runLog.metrics_no_errors_today')
                : t('runLog.metrics_errors_today', { count: runsMetrics.failed })}
            </span>
          </div>
        </div>
      ) : null}
      {editorialHub ? (
        <HubFilterBar aria-label={t('runLog.filter_group_type')}>
          <HubFilterRow label={t('runLog.filter_group_type')}>
            <DomeFilterChipGroup
              variant="editorial"
              options={ownerFilters.map(({ key, label }) => ({
                value: key,
                label,
              }))}
              value={filter.ownerType}
              onChange={(key) => setFilter((f) => ({ ...f, ownerType: key }))}
            />
          </HubFilterRow>
          <HubFilterRow label={t('runLog.filter_group_status')}>
            <DomeFilterChipGroup
              variant="editorial"
              options={statusFilters.map(({ key, label }) => ({
                value: key,
                label,
              }))}
              value={filter.status}
              onChange={(key) => setFilter((f) => ({ ...f, status: key }))}
            />
          </HubFilterRow>
        </HubFilterBar>
      ) : (
        <div
          className="flex flex-col gap-2 px-4 py-2 shrink-0"
          style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              {t('runLog.filter_group_type')}
            </span>
            <DomeFilterChipGroup
              dense
              options={ownerFilters.map(({ key, label }) => ({
                value: key,
                label,
                selectedColor: 'var(--dome-accent)',
              }))}
              value={filter.ownerType}
              onChange={(key) => setFilter((f) => ({ ...f, ownerType: key }))}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              {t('runLog.filter_group_status')}
            </span>
            <DomeFilterChipGroup
              dense
              options={statusFilters.map(({ key, label }) => ({
                value: key,
                label,
                selectedColor: runStatusColor(key === 'all' ? 'completed' : key),
              }))}
              value={filter.status}
              onChange={(key) => setFilter((f) => ({ ...f, status: key }))}
            />
          </div>
        </div>
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
            icon={<Activity className="size-7" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} />}
            title={t('runLog.empty_runs')}
            description={t('runLog.empty_runs_hint')}
          />
        ) : (
          <div className={editorialHub ? '' : 'p-4'}>
            <ul className={`${hubListClass} list-none m-0 p-0`}>
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
                const progressPercent =
                  progress?.mode === 'determinate' ? (progress.percent ?? 0) : run.status === 'completed' ? 100 : 0;
                return (
                  <li key={run.id} className="list-none">
                  <HubBentoCard
                    variant={hubCardVariant}
                    onClick={() => void handleSelectRun(run)}
                    disabled={loadingDetail === run.id}
                  >
                    <HubBentoCard.Icon>
                      <HubEntityIcon kind={run.ownerType === 'agent' ? 'agent' : 'workflow'} size="md" />
                    </HubBentoCard.Icon>
                    <HubBentoCard.Title>
                      <div className="flex items-start gap-2 min-w-0 flex-wrap">
                        <span
                          className={cn('min-w-0 flex-1 break-words', !editorialHub && 'text-sm font-semibold')}
                          style={editorialHub ? undefined : { color: 'var(--dome-text)' }}
                          title={run.title || run.id}
                        >
                          {run.title || run.id}
                        </span>
                        <DomeStatusBadge status={run.status} />
                        {editorialHub ? (
                          <span
                            className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                            style={{
                              background: 'var(--dome-bg-hover)',
                              color: 'var(--dome-text-muted)',
                              border: '1px solid var(--dome-border)',
                            }}
                          >
                            {ownerLabel}
                          </span>
                        ) : null}
                      </div>
                    </HubBentoCard.Title>
                    <HubBentoCard.Subtitle>
                      <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0 break-words">
                        {!editorialHub ? <span>{ownerLabel}</span> : null}
                        {!editorialHub ? <span aria-hidden>·</span> : null}
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="size-3 shrink-0" aria-hidden />
                          {formatHubDate(run.updatedAt, t('runLog.never'))}
                        </span>
                        {editorialHub && (progress?.mode === 'determinate' || run.status === 'completed') ? (
                          <>
                            <span aria-hidden>·</span>
                            <span style={{ color: 'var(--dome-accent)' }}>
                              {progressPercent}% · {progress?.completed ?? 1}/{progress?.total ?? 1}
                            </span>
                          </>
                        ) : null}
                        {!editorialHub && stepLine ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{stepLine}</span>
                          </>
                        ) : null}
                      </span>
                    </HubBentoCard.Subtitle>
                    <HubBentoCard.Meta>
                      {editorialHub ? (
                        <div className="hub-run-progress" aria-hidden>
                          <div
                            className="hub-run-progress-fill"
                            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                          />
                        </div>
                      ) : progress?.mode === 'determinate' ? (
                        <p className="text-[11px] font-medium mt-1" style={{ color: 'var(--dome-accent)' }}>
                          {progress.percent ?? 0}% · {progress.completed}/{progress.total}
                        </p>
                      ) : null}
                    </HubBentoCard.Meta>
                    <HubBentoCard.Trailing>
                      <DomeButton
                        type="button"
                        variant="ghost"
                        size="xs"
                        iconOnly
                        title={t('runLog.delete_run_aria')}
                        aria-label={t('runLog.delete_run_aria')}
                        disabled={deletingId === run.id}
                        className="!text-[var(--error)] hover:!bg-[var(--error-bg)] disabled:!opacity-50"
                        onClick={() => void handleDelete(run.id)}
                      >
                        {deletingId === run.id ? (
                          <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                        ) : (
                          <Trash2 className="size-3.5" aria-hidden />
                        )}
                      </DomeButton>
                    </HubBentoCard.Trailing>
                  </HubBentoCard>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
export default RunsTab;
