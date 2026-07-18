import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft02Icon as ArrowLeftIcon,
  BotIcon as BotIcon,
  Loading03Icon as Loader2Icon,
  SparklesIcon as SparklesIcon,
  SquareIcon as SquareIcon,
  Delete02Icon as Trash2Icon,
  WorkflowSquare01Icon as WorkflowIcon,
  ZapIcon as ZapIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { formatRunDate, formatDuration } from '@/lib/automations/run-log-format';
import { RunProgressBar } from '@/lib/automations/run-log-ui';
import {
  estimateRunCostUsd,
  formatUsdEstimate,
  getRunUsageFromRunMetadata,
} from '@/lib/automations/run-cost';
import { getRunProgress } from '@/lib/automations/run-progress';
import { isAutomationLinkedRun, type PersistentRun } from '@/lib/automations/api';
import { cn } from '@/lib/utils';
import ListState from '@/components/shared/ListState';
import {
  buildTranscriptRows,
  buildWorkflowStepGroups,
  formatIntToken,
  isWorkflowRun,
  AGENT_LANE_PALETTE,
  type TranscriptRow,
} from '@/components/hub/runs/runPresentation';
import {
  RunTimelineBar,
  StepDetailPanel,
  StepListItem,
  WorkflowAgentTabBar,
  WorkflowGroupHeader,
} from '@/components/hub/runs/RunStepBits';
import RunRightOverview from '@/components/hub/runs/RunRightOverview';

import RunStatusBadge from '@/components/automations/RunStatusBadge';

const Bot = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BotIcon} {...props} />
);
const Sparkles = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={SparklesIcon} {...props} />
);
const Workflow = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={WorkflowIcon} {...props} />
);
const Zap = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={ZapIcon} {...props} />
);
interface RunDetailViewProps {
  run: PersistentRun;
  onBack: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  stopping?: boolean;
  deleting?: boolean;
}

function HeaderStat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-2" title={title}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function ownerPresentation(run: PersistentRun, t: (key: string) => string) {
  if (isAutomationLinkedRun(run)) {
    return { Icon: Zap, label: t('runLog.detail_owner_automation') };
  }
  switch (run.ownerType) {
    case 'agent':
      return { Icon: Bot, label: t('runLog.detail_owner_agent') };
    case 'workflow':
      return { Icon: Workflow, label: t('runLog.detail_owner_workflow') };
    case 'many':
      return { Icon: Sparkles, label: t('runLog.detail_owner_other') };
    case 'automation':
      return { Icon: Zap, label: t('runLog.detail_owner_automation') };
    default: {
      const _exhaustive: never = run.ownerType;
      return _exhaustive;
    }
  }
}

/**
 * Redesigned execution detail: hero header with owner icon, status and KPI
 * strip (start, duration, steps, tokens, cost, model), the visual timeline,
 * then the step transcript + expandable step detail. Reuses the deep step
 * rendering (RunStepBits) so tool calls, workflow lanes and outputs keep
 * their full fidelity.
 */
export default function RunDetailView({ run, onBack, onStop, onDelete, stopping, deleting }: RunDetailViewProps) {
  const { t, i18n } = useTranslation();
  const steps = useMemo(() => run.steps ?? [], [run.steps]);
  const sortedSteps = useMemo(() => [...steps].sort((a, b) => a.createdAt - b.createdAt), [steps]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [transcriptFilter, setTranscriptFilter] = useState<string>('all');
  const prevRunIdRef = useRef(run.id);
  if (run.id !== prevRunIdRef.current) {
    prevRunIdRef.current = run.id;
    setSelectedStepId(null);
    setMobileDetailOpen(false);
    setTranscriptFilter('all');
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    setMobileDetailOpen(selectedStepId !== null);
  }, [selectedStepId]);

  const isRunning = run.status === 'running' || run.status === 'queued';
  const runIsTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  const progress = getRunProgress(run);

  const meta = useMemo(() => (run.metadata ?? {}) as Record<string, unknown>, [run.metadata]);
  const usage = useMemo(() => getRunUsageFromRunMetadata(meta), [meta]);
  const modelId = typeof meta.model === 'string' ? meta.model : undefined;
  const providerLabel = typeof meta.provider === 'string' ? meta.provider : undefined;
  const costUsd = useMemo(() => estimateRunCostUsd(modelId, meta.usage), [modelId, meta]);
  const costLabel = formatUsdEstimate(costUsd, i18n.language);

  const { Icon: OwnerIcon, label: ownerKindLabel } = ownerPresentation(run, t);

  const selectedStep = useMemo(
    () => sortedSteps.find((s) => s.id === selectedStepId) ?? null,
    [sortedSteps, selectedStepId],
  );

  const stepGroups = useMemo(() => {
    if (sortedSteps.length === 0) return [];
    if (isWorkflowRun(run)) return buildWorkflowStepGroups(sortedSteps, t);
    return [{ key: '_flat', label: '', sectionKind: 'other' as const, steps: sortedSteps }];
  }, [run, sortedSteps, t]);

  const groupByKey = useMemo(() => new Map(stepGroups.map((g) => [g.key, g])), [stepGroups]);
  const agentTabGroups = useMemo(() => stepGroups.filter((g) => g.sectionKind === 'agent'), [stepGroups]);
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
      if (row.type === 'header') return { kind: 'header' as const, groupKey: row.groupKey };
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
    sortedSteps.forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [sortedSteps]);

  const agentColorByGroupKey = useMemo(() => {
    const m = new Map<string, string>();
    agentTabGroups.forEach((g, i) => m.set(g.key, AGENT_LANE_PALETTE[i % AGENT_LANE_PALETTE.length]));
    return m;
  }, [agentTabGroups]);

  const usageShort =
    usage && (usage.inputTokens > 0 || usage.outputTokens > 0)
      ? `${formatIntToken(usage.inputTokens, i18n.language)} / ${formatIntToken(usage.outputTokens, i18n.language)}`
      : null;

  const handleSelectStep = (id: string) => {
    setSelectedStepId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* Hero header */}
      <header className="shrink-0 border-b border-border bg-muted/40 px-4 pt-3 pb-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              aria-label={t('common.back')}
              size="icon-sm"
            >
              <HugeiconsIcon icon={ArrowLeftIcon} className="size-4" />
            </Button>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-mint text-primary">
              <OwnerIcon className="size-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words text-base font-semibold leading-tight text-foreground">
                  {run.title || run.id}
                </h1>
                <RunStatusBadge status={run.status} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {ownerKindLabel}
                {isAutomationLinkedRun(run) && run.ownerType !== 'automation' ? (
                  <>
                    <span aria-hidden className="px-1">
                      ·
                    </span>
                    <span>
                      {run.ownerType === 'agent'
                        ? t('runLog.detail_target_agent')
                        : run.ownerType === 'workflow'
                          ? t('runLog.detail_target_workflow')
                          : t('runLog.detail_target_many')}
                    </span>
                  </>
                ) : null}
                <span aria-hidden className="px-1">
                  ·
                </span>
                <span className="break-all font-mono">{run.id}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isRunning && onStop ? (
              <Button type="button"
  variant="secondary"
  disabled={stopping || deleting}
  onClick={onStop}
  size="xs">{stopping ? <HugeiconsIcon icon={Loader2Icon} className="size-3 animate-spin" /> : <HugeiconsIcon icon={SquareIcon} className="size-3" />}
                {stopping ? t('chat.stop') : t('runLog.stop_run')}
              </Button>
            ) : null}
            {onDelete ? (
              <Button type="button"
  variant="ghost"
  title={t('runLog.delete_run_aria')}
  aria-label={t('runLog.delete_run_aria')}
  disabled={deleting || stopping}
  className="!text-destructive hover:!bg-[color-mix(in srgb, var(--destructive) 12%, transparent)] disabled:!opacity-50"
  onClick={onDelete}
  size="icon-xs">
                {deleting ? (
                  <HugeiconsIcon icon={Loader2Icon} className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <HugeiconsIcon icon={Trash2Icon} className="size-3.5" aria-hidden />
                )}
              </Button>
            ) : null}
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <HeaderStat label={t('runLog.started')} value={formatRunDate(run.startedAt)} />
          <HeaderStat label={t('runLog.duration')} value={formatDuration(run.startedAt, run.finishedAt)} />
          <HeaderStat
            label={t('orchestration.run_detail.stat_steps')}
            value={String(sortedSteps.length)}
          />
          <HeaderStat
            label={t('orchestration.run_detail.stat_tokens')}
            value={usageShort ?? '—'}
            title={t('orchestration.run_detail.stat_tokens_hint')}
          />
          <HeaderStat
            label={t('orchestration.run_detail.stat_cost')}
            value={costUsd != null && Number.isFinite(costUsd) ? `~${costLabel}` : '—'}
          />
          <HeaderStat
            label={t('orchestration.run_detail.stat_model')}
            value={[providerLabel, modelId].filter(Boolean).join(' · ') || '—'}
            title={[providerLabel, modelId].filter(Boolean).join(' · ') || undefined}
          />
        </div>

        {isRunning ? (
          <div className="mt-2">
            <RunProgressBar run={run} />
          </div>
        ) : null}
      </header>

      {/* Visual timeline */}
      <div className="shrink-0 border-b px-5 pt-2 pb-3 border-border">
        <p className="mb-1.5 text-[11px] text-muted-foreground">
          {t('runLog.detail_timeline')}
        </p>
        <RunTimelineBar run={run} steps={sortedSteps} stepGroups={isWorkflowRun(run) ? stepGroups : undefined} />
      </div>

      {showAgentTabs ? (
        <WorkflowAgentTabBar
          agentGroups={agentTabGroups}
          value={transcriptFilter}
          onChange={setTranscriptFilter}
          totalStepCount={sortedSteps.length}
        />
      ) : null}

      {/* Transcript + detail */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-col border-border lg:w-[min(28rem,38%)] lg:shrink-0 lg:border-r',
            mobileDetailOpen ? 'hidden lg:flex' : 'flex flex-1 lg:flex-none',
          )}
          style={{ background: 'var(--background)' }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-3 lg:max-h-full">
            {sortedSteps.length > 0 ? (
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                {t('runLog.detail_transcript_feed')}
              </p>
            ) : null}
            {sortedSteps.length === 0 ? (
              <ListState
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
          <div className="shrink-0 border-t lg:hidden border-border">
            <div className="max-h-[45vh] overflow-y-auto p-3">
              <RunRightOverview
                run={run}
                ownerKindLabel={ownerKindLabel}
                progress={progress}
                usage={usage}
                costLabel={costLabel}
                providerLabel={providerLabel}
                modelId={modelId}
              />
            </div>
          </div>
        </div>

        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            mobileDetailOpen ? 'flex' : 'hidden lg:flex',
          )}
          style={{ background: 'var(--background)' }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b p-2 lg:hidden border-border">
            <Button type="button"
  variant="ghost"
  className="gap-1"
  onClick={() => {
                setSelectedStepId(null);
                setMobileDetailOpen(false);
              }}
  size="sm">
              <HugeiconsIcon icon={ArrowLeftIcon} className="size-4" aria-hidden />
              {t('runLog.detail_back_list')}
            </Button>
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
                className="hidden shrink-0 border-b px-4 py-2 lg:block"
                style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
              >
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {t('runLog.detail_run_overview')}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
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
    </div>
  );
}
