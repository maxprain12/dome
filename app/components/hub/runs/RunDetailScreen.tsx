/** Full-page run detail (03/T02 — extracted from RunsWorkspaceView.tsx). */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { formatRunDate, formatDuration, RunProgressBar } from '@/components/automations/RunLogView';
import {
  estimateRunCostUsd,
  formatUsdEstimate,
  getRunUsageFromRunMetadata,
} from '@/lib/automations/run-cost';
import { getRunProgress } from '@/lib/automations/run-progress';
import type { PersistentRun } from '@/lib/automations/api';
import { cn } from '@/lib/utils';
import DomeButton from '@/components/ui/DomeButton';
import DomeStatusBadge from '@/components/ui/DomeStatusBadge';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeSubpageFooter from '@/components/ui/DomeSubpageFooter';
import DomeListState from '@/components/ui/DomeListState';
import {
  buildTranscriptRows,
  buildWorkflowStepGroups,
  formatIntToken,
  isWorkflowRun,
  AGENT_LANE_PALETTE,
  type TranscriptRow,
} from './runPresentation';
import {
  RunTimelineBar,
  StepDetailPanel,
  StepListItem,
  WorkflowAgentTabBar,
  WorkflowGroupHeader,
} from './RunStepBits';
import RunRightOverview from './RunRightOverview';

interface RunDetailScreenProps {
  run: PersistentRun;
  onBack: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  stopping?: boolean;
  deleting?: boolean;
}

export default function RunDetailScreen({ run, onBack, onStop, onDelete, stopping, deleting }: RunDetailScreenProps) {
  const { t, i18n } = useTranslation();
  const steps = useMemo(() => run.steps ?? [], [run.steps]);
  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => a.createdAt - b.createdAt),
    [steps],
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [transcriptFilter, setTranscriptFilter] = useState<string>('all');

  useEffect(() => {
    setSelectedStepId(null);
    setMobileDetailOpen(false);
    setTranscriptFilter('all');
  }, [run.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    setMobileDetailOpen(selectedStepId !== null);
  }, [selectedStepId]);

  const isRunning = run.status === 'running' || run.status === 'queued';
  const runIsTerminal =
    run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  const progress = getRunProgress(run);

  const meta = useMemo(() => (run.metadata ?? {}) as Record<string, unknown>, [run.metadata]);
  const usage = useMemo(() => getRunUsageFromRunMetadata(meta), [meta]);
  const modelId = typeof meta.model === 'string' ? meta.model : undefined;
  const providerLabel = typeof meta.provider === 'string' ? meta.provider : undefined;
  const costUsd = useMemo(
    () => estimateRunCostUsd(modelId, meta.usage),
    [modelId, meta],
  );
  const costLabel = formatUsdEstimate(costUsd, i18n.language);

  const ownerKindLabel =
    run.ownerType === 'agent'
      ? t('runLog.detail_owner_agent')
      : run.ownerType === 'workflow'
        ? t('runLog.detail_owner_workflow')
        : t('runLog.detail_owner_other');

  const selectedStep = useMemo(
    () => sortedSteps.find((s) => s.id === selectedStepId) ?? null,
    [sortedSteps, selectedStepId],
  );

  const stepGroups = useMemo(() => {
    if (sortedSteps.length === 0) return [];
    if (isWorkflowRun(run)) {
      return buildWorkflowStepGroups(sortedSteps, t);
    }
    return [{ key: '_flat', label: '', sectionKind: 'other' as const, steps: sortedSteps }];
  }, [run, sortedSteps, t]);

  const groupByKey = useMemo(() => new Map(stepGroups.map((g) => [g.key, g])), [stepGroups]);
  const agentTabGroups = useMemo(
    () => stepGroups.filter((g) => g.sectionKind === 'agent'),
    [stepGroups],
  );
  const showAgentTabs = isWorkflowRun(run) && agentTabGroups.length >= 1;

  const transcriptRows = useMemo(
    () => buildTranscriptRows(sortedSteps, transcriptFilter, isWorkflowRun(run), t),
    [sortedSteps, transcriptFilter, run, t],
  );

  const listEntries = useMemo(() => {
    const stepsOnly = transcriptRows
      .filter((r): r is Extract<TranscriptRow, { type: 'step' }> => r.type === 'step')
      .map((r) => r.step);
    let si = 0;
    return transcriptRows.map((row) => {
      if (row.type === 'header') {
        return { kind: 'header' as const, groupKey: row.groupKey };
      }
      const next = stepsOnly[si + 1];
      const cur = row.step;
      si += 1;
      return { kind: 'step' as const, step: cur, next };
    });
  }, [transcriptRows]);

  const runEndAt =
    run.finishedAt ??
    sortedSteps[sortedSteps.length - 1]?.updatedAt ??
    sortedSteps[sortedSteps.length - 1]?.createdAt ??
    Date.now();

  const stepOrdinalById = useMemo(() => {
    const m = new Map<string, number>();
    sortedSteps.forEach((s, i) => {
      m.set(s.id, i + 1);
    });
    return m;
  }, [sortedSteps]);

  const agentColorByGroupKey = useMemo(() => {
    const m = new Map<string, string>();
    agentTabGroups.forEach((g, i) => {
      m.set(g.key, AGENT_LANE_PALETTE[i % AGENT_LANE_PALETTE.length]);
    });
    return m;
  }, [agentTabGroups]);

  const hasExecutionContent =
    Boolean(run.outputText) || sortedSteps.length > 0 || Boolean(run.error);

  const usageShort =
    usage && (usage.inputTokens > 0 || usage.outputTokens > 0)
      ? `${formatIntToken(usage.inputTokens, i18n.language)} in / ${formatIntToken(usage.outputTokens, i18n.language)} out`
      : null;

  const metaParts: ReactNode[] = [
    <span key="s" className="tabular-nums">
      {t('runLog.started')} {formatRunDate(run.startedAt)}
    </span>,
    <span key="d" className="tabular-nums">
      {t('runLog.duration')} {formatDuration(run.startedAt, run.finishedAt)}
    </span>,
    <span key="n">
      {sortedSteps.length === 1 ? t('runLog.step_singular') : t('runLog.step_plural', { count: sortedSteps.length })}
    </span>,
  ];
  if (usageShort) {
    metaParts.push(
      <span key="u" className="tabular-nums">
        {usageShort}
      </span>,
    );
  }
  if (costUsd != null && Number.isFinite(costUsd)) {
    metaParts.push(
      <span key="c" className="tabular-nums">
        ~{costLabel}
      </span>,
    );
  }
  if (providerLabel || modelId) {
    metaParts.push(
      <span key="p" className="min-w-0 break-all" title={[providerLabel, modelId].filter(Boolean).join(' · ')}>
        {[providerLabel, modelId].filter(Boolean).join(' · ')}
      </span>,
    );
  }

  const metadataStrip = (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 border-b border-[var(--dome-border)] bg-[var(--dome-bg)] text-[11px]"
      style={{ color: 'var(--dome-text-muted)' }}
    >
      {metaParts.map((node, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <span aria-hidden className="select-none px-0.5 text-[var(--dome-border)]">
              ·
            </span>
          ) : null}
          {node}
        </Fragment>
      ))}
    </div>
  );

  const handleSelectStep = (id: string) => {
    setSelectedStepId((prev) => (prev === id ? null : id));
  };

  const handleMobileBackToList = () => {
    setSelectedStepId(null);
    setMobileDetailOpen(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <DomeSubpageHeader
        title={<span className="break-words">{run.title || run.id}</span>}
        onBack={onBack}
        backLabel={t('common.back')}
        trailing={
          <div className="flex items-center gap-2">
            {isRunning && onStop ? (
              <DomeButton
                type="button"
                variant="secondary"
                size="xs"
                disabled={stopping || deleting}
                onClick={onStop}
              >
                {stopping ? t('chat.stop') : t('runLog.stop_run')}
              </DomeButton>
            ) : null}
            {onDelete ? (
              <DomeButton
                type="button"
                variant="ghost"
                size="xs"
                iconOnly
                title={t('runLog.delete_run_aria')}
                aria-label={t('runLog.delete_run_aria')}
                disabled={deleting || stopping}
                className="!text-[var(--error)] hover:!bg-[var(--error-bg)] disabled:!opacity-50"
                onClick={onDelete}
              >
                {deleting ? (
                  <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden />
                )}
              </DomeButton>
            ) : null}
            <DomeStatusBadge status={run.status} />
          </div>
        }
        className="px-4 py-3 border-[var(--dome-border)] bg-[var(--dome-bg)] shrink-0"
        subtitle={null}
      />

      {metadataStrip}

      {isRunning ? (
        <div className="shrink-0 border-b px-4 py-2" style={{ borderColor: 'var(--dome-border)' }}>
          <RunProgressBar run={run} />
        </div>
      ) : null}

      <div
        className="shrink-0 border-b px-4 pt-2 pb-3"
        style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
      >
        <p className="text-[11px] mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
          {t('runLog.detail_timeline')}
        </p>
        <RunTimelineBar
          run={run}
          steps={sortedSteps}
          stepGroups={isWorkflowRun(run) ? stepGroups : undefined}
        />
      </div>

           {showAgentTabs ? (
        <WorkflowAgentTabBar
          agentGroups={agentTabGroups}
          value={transcriptFilter}
          onChange={setTranscriptFilter}
          totalStepCount={sortedSteps.length}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Step list column */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-col border-[var(--dome-border)] lg:w-[40%] lg:max-w-xl lg:shrink-0 lg:border-r',
            mobileDetailOpen ? 'hidden lg:flex' : 'flex flex-1 lg:flex-none',
          )}
          style={{ background: 'var(--dome-bg)' }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-3 lg:max-h-full">
            {sortedSteps.length > 0 ? (
              <p className="text-[11px] mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                {t('runLog.detail_transcript_feed')}
              </p>
            ) : null}
            {sortedSteps.length === 0 ? (
              <DomeListState
                variant={isRunning ? 'loading' : 'empty'}
                loadingLabel={t('runLog.executing')}
                title={isRunning ? undefined : t('runLog.no_steps')}
                compact
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                {listEntries.map((entry, idx) => {
                  if (entry.kind === 'header') {
                    const g = groupByKey.get(entry.groupKey);
                    return g ? (
                      <WorkflowGroupHeader
                        key={`h-${entry.groupKey}-${idx}`}
                        group={g}
                        accentColor={agentColorByGroupKey.get(entry.groupKey)}
                      />
                    ) : null;
                  }
                  return (
                    <StepListItem
                      key={entry.step.id}
                      step={entry.step}
                      selected={selectedStepId === entry.step.id}
                      onSelect={() => handleSelectStep(entry.step.id)}
                      nextStep={entry.next}
                      runEndAt={runEndAt}
                      runStartedAt={run.startedAt}
                      stepOrdinal={stepOrdinalById.get(entry.step.id) ?? 0}
                      totalSteps={sortedSteps.length}
                      runIsTerminal={runIsTerminal}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobile: overview below list */}
          <div className="shrink-0 border-t lg:hidden" style={{ borderColor: 'var(--dome-border)' }}>
            <div className="max-h-[45vh] overflow-y-auto p-3">
              {!hasExecutionContent && sortedSteps.length === 0 ? null : (
                <RunRightOverview
                  run={run}
                  ownerKindLabel={ownerKindLabel}
                  progress={progress}
                  usage={usage}
                  costLabel={costLabel}
                  providerLabel={providerLabel}
                  modelId={modelId}
                />
              )}
            </div>
          </div>
        </div>

        {/* Detail column */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            mobileDetailOpen ? 'flex' : 'hidden lg:flex',
          )}
          style={{ background: 'var(--dome-bg)' }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b p-2 lg:hidden" style={{ borderColor: 'var(--dome-border)' }}>
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={handleMobileBackToList}
            >
              <ArrowLeft className="size-4" aria-hidden />
              {t('runLog.detail_back_list')}
            </DomeButton>
          </div>

          {selectedStep ? (
            <StepDetailPanel
              step={selectedStep}
              run={run}
              stepOrdinal={stepOrdinalById.get(selectedStep.id) ?? 1}
              totalSteps={sortedSteps.length}
            />
          ) : (
            <>
              <div
                className="shrink-0 border-b px-4 py-2 lg:block hidden"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
              >
                <p className="text-[11px] font-semibold" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('runLog.detail_run_overview')}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('runLog.detail_select_hint')}
                </p>
              </div>
              <RunRightOverview
                run={run}
                ownerKindLabel={ownerKindLabel}
                progress={progress}
                usage={usage}
                costLabel={costLabel}
                providerLabel={providerLabel}
                modelId={modelId}
              />
            </>
          )}
        </div>
      </div>

      <DomeSubpageFooter
        className="px-4 py-2 bg-[var(--dome-surface)] border-[var(--dome-border)] shrink-0"
        leading={
          <span className="text-[10px] font-mono text-[var(--dome-text-muted)] break-all">ID: {run.id}</span>
        }
      />
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────────────────────

