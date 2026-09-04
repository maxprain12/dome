import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
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
import {
  isAutomationLinkedRun,
  type PersistentRun,
  type PersistentRunStep,
  type PersistentRunUsage,
} from '@/lib/automations/api';
import { cn } from '@/lib/utils';
import ListState from '@/components/shared/ListState';
import {
  buildTranscriptRows,
  buildWorkflowStepGroups,
  formatIntToken,
  isWorkflowRun,
  AGENT_LANE_PALETTE,
  type TranscriptRow,
  type WorkflowStepGroup,
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

// Helpers (pure) extracted to reduce cognitive complexity of the view.

function ownerTargetLabel(run: PersistentRun, t: (key: string) => string): string | null {
  if (!isAutomationLinkedRun(run)) return null;
  if (run.ownerType === 'automation') return null;
  if (run.ownerType === 'agent') return t('runLog.detail_target_agent');
  if (run.ownerType === 'workflow') return t('runLog.detail_target_workflow');
  return t('runLog.detail_target_many');
}

function getRunDetailEndTimestamp(
  run: PersistentRun,
  sortedSteps: PersistentRunStep[],
): number {
  return (
    run.finishedAt ??
    sortedSteps[sortedSteps.length - 1]?.updatedAt ??
    sortedSteps[sortedSteps.length - 1]?.createdAt ??
    Date.now()
  );
}

function getUsageShortLabel(usage: PersistentRunUsage | null, language: string): string | null {
  if (!usage) return null;
  if (usage.inputTokens <= 0 && usage.outputTokens <= 0) return null;
  return `${formatIntToken(usage.inputTokens, language)} / ${formatIntToken(usage.outputTokens, language)}`;
}

function getModelLabel(providerLabel: string | undefined, modelId: string | undefined): string {
  return [providerLabel, modelId].filter(Boolean).join(' · ') || '';
}

function getListStateProps(isRunning: boolean, t: (key: string) => string) {
  return {
    variant: (isRunning ? 'loading' : 'empty') as 'loading' | 'empty',
    loadingLabel: t('runLog.executing'),
    title: isRunning ? undefined : t('runLog.no_steps'),
  };
}

type TranscriptListEntry =
  | { kind: 'header'; groupKey: string }
  | { kind: 'step'; step: PersistentRunStep; next: PersistentRunStep | undefined };

function buildTranscriptListEntries(transcriptRows: TranscriptRow[]): TranscriptListEntry[] {
  const stepsOnly = transcriptRows
    .filter((r): r is Extract<TranscriptRow, { type: 'step' }> => r.type === 'step')
    .map((r) => r.step);
  let si = 0;
  return transcriptRows.map((row) => {
    if (row.type === 'header') return { kind: 'header' as const, groupKey: row.groupKey };
    const cur = row.step;
    const next = stepsOnly[si + 1];
    si += 1;
    return { kind: 'step' as const, step: cur, next };
  });
}

interface ListEntryRenderCtx {
  groupByKey: Map<string, WorkflowStepGroup>;
  agentColorByGroupKey: Map<string, string>;
  selectedStepId: string | null;
  onSelect: (id: string) => void;
  stepOrdinalById: Map<string, number>;
  runEndAt: number;
  runStartedAt: number;
  sortedStepsLength: number;
  runIsTerminal: boolean;
}

function renderTranscriptEntry(
  entry: TranscriptListEntry,
  idx: number,
  ctx: ListEntryRenderCtx,
): ReactNode {
  if (entry.kind === 'header') {
    const g = ctx.groupByKey.get(entry.groupKey);
    if (!g) return null;
    return (
      <WorkflowGroupHeader
        key={`h-${entry.groupKey}-${idx}`}
        group={g}
        accentColor={ctx.agentColorByGroupKey.get(entry.groupKey)}
      />
    );
  }
  return (
    <StepListItem
      key={entry.step.id}
      step={entry.step}
      selected={ctx.selectedStepId === entry.step.id}
      onSelect={() => ctx.onSelect(entry.step.id)}
      nextStep={entry.next}
      runEndAt={ctx.runEndAt}
      runStartedAt={ctx.runStartedAt}
      stepOrdinal={ctx.stepOrdinalById.get(entry.step.id) ?? 0}
      totalSteps={ctx.sortedStepsLength}
      runIsTerminal={ctx.runIsTerminal}
    />
  );
}

interface DetailHeaderActionsProps {
  isRunning: boolean;
  onStop?: () => void;
  onDelete?: () => void;
  stopping?: boolean;
  deleting?: boolean;
  t: (key: string) => string;
}

function DetailHeaderActions({
  isRunning,
  onStop,
  onDelete,
  stopping,
  deleting,
  t,
}: DetailHeaderActionsProps) {
  const showStop = isRunning && Boolean(onStop);
  const stopLabel = stopping ? t('chat.stop') : t('runLog.stop_run');
  const deleteAria = t('runLog.delete_run_aria');
  return (
    <div className="flex shrink-0 items-center gap-2">
      {showStop && onStop ? (
        <Button
          type="button"
          variant="secondary"
          disabled={stopping || deleting}
          onClick={onStop}
          size="xs"
        >
          {stopping ? (
            <HugeiconsIcon icon={Loader2Icon} className="size-3 animate-spin" />
          ) : (
            <HugeiconsIcon icon={SquareIcon} className="size-3" />
          )}
          {stopLabel}
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          type="button"
          variant="ghost"
          title={deleteAria}
          aria-label={deleteAria}
          disabled={deleting || stopping}
          className="!text-destructive hover:!bg-[color-mix(in srgb, var(--destructive) 12%, transparent)] disabled:!opacity-50"
          onClick={onDelete}
          size="icon-xs"
        >
          {deleting ? (
            <HugeiconsIcon
              icon={Loader2Icon}
              className="size-3.5 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : (
            <HugeiconsIcon icon={Trash2Icon} className="size-3.5" aria-hidden />
          )}
        </Button>
      ) : null}
    </div>
  );
}

interface DetailKpiStripProps {
  run: PersistentRun;
  sortedStepsLength: number;
  usageShort: string | null;
  costUsd: number | null;
  costLabel: string;
  providerLabel: string | undefined;
  modelId: string | undefined;
  t: (key: string) => string;
}

function DetailKpiStrip({
  run,
  sortedStepsLength,
  usageShort,
  costUsd,
  costLabel,
  providerLabel,
  modelId,
  t,
}: DetailKpiStripProps) {
  const modelLabel = getModelLabel(providerLabel, modelId);
  const costValue =
    costUsd != null && Number.isFinite(costUsd) ? `~${costLabel}` : '—';
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <HeaderStat label={t('runLog.started')} value={formatRunDate(run.startedAt)} />
      <HeaderStat
        label={t('runLog.duration')}
        value={formatDuration(run.startedAt, run.finishedAt)}
      />
      <HeaderStat
        label={t('orchestration.run_detail.stat_steps')}
        value={String(sortedStepsLength)}
      />
      <HeaderStat
        label={t('orchestration.run_detail.stat_tokens')}
        value={usageShort ?? '—'}
        title={t('orchestration.run_detail.stat_tokens_hint')}
      />
      <HeaderStat
        label={t('orchestration.run_detail.stat_cost')}
        value={costValue}
      />
      <HeaderStat
        label={t('orchestration.run_detail.stat_model')}
        value={modelLabel || '—'}
        title={modelLabel || undefined}
      />
    </div>
  );
}

interface DetailOwnerTitleProps {
  run: PersistentRun;
  ownerKindLabel: string;
  t: (key: string) => string;
}

function DetailOwnerTitle({ run, ownerKindLabel, t }: DetailOwnerTitleProps) {
  const targetLabel = ownerTargetLabel(run, t);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 break-words text-base font-semibold leading-tight text-foreground">
          {run.title || run.id}
        </h1>
        <RunStatusBadge status={run.status} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {ownerKindLabel}
        {targetLabel ? (
          <>
            <span aria-hidden className="px-1">
              ·
            </span>
            <span>{targetLabel}</span>
          </>
        ) : null}
        <span aria-hidden className="px-1">
          ·
        </span>
        <span className="break-all font-mono">{run.id}</span>
      </p>
    </div>
  );
}

type OwnerIconWrapper = (
  props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>,
) => ReactElement;

interface DetailHeaderProps {
  run: PersistentRun;
  onBack: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  stopping?: boolean;
  deleting?: boolean;
  isRunning: boolean;
  ownerKindLabel: string;
  ownerIcon: OwnerIconWrapper;
  sortedStepsLength: number;
  usageShort: string | null;
  costUsd: number | null;
  costLabel: string;
  providerLabel: string | undefined;
  modelId: string | undefined;
  t: (key: string) => string;
}

function DetailHeader(props: DetailHeaderProps) {
  const { run, onBack, isRunning, ownerKindLabel, ownerIcon: OwnerIcon, t } = props;
  return (
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
          <DetailOwnerTitle run={run} ownerKindLabel={ownerKindLabel} t={t} />
        </div>
        <DetailHeaderActions
          isRunning={isRunning}
          onStop={props.onStop}
          onDelete={props.onDelete}
          stopping={props.stopping}
          deleting={props.deleting}
          t={t}
        />
      </div>
      <DetailKpiStrip
        run={run}
        sortedStepsLength={props.sortedStepsLength}
        usageShort={props.usageShort}
        costUsd={props.costUsd}
        costLabel={props.costLabel}
        providerLabel={props.providerLabel}
        modelId={props.modelId}
        t={t}
      />
      {isRunning ? (
        <div className="mt-2">
          <RunProgressBar run={run} />
        </div>
      ) : null}
    </header>
  );
}

interface DetailTimelineSectionProps {
  run: PersistentRun;
  sortedSteps: PersistentRunStep[];
  stepGroups: WorkflowStepGroup[];
  showAgentTabs: boolean;
  agentTabGroups: WorkflowStepGroup[];
  transcriptFilter: string;
  onTranscriptFilterChange: (value: string) => void;
  t: (key: string) => string;
}

function DetailTimelineSection({
  run,
  sortedSteps,
  stepGroups,
  showAgentTabs,
  agentTabGroups,
  transcriptFilter,
  onTranscriptFilterChange,
  t,
}: DetailTimelineSectionProps) {
  return (
    <>
      <div className="shrink-0 border-b px-5 pt-2 pb-3 border-border">
        <p className="mb-1.5 text-[11px] text-muted-foreground">
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
          onChange={onTranscriptFilterChange}
          totalStepCount={sortedSteps.length}
        />
      ) : null}
    </>
  );
}

interface DetailEmptyStateProps {
  sortedStepsLength: number;
  isRunning: boolean;
  t: (key: string) => string;
}

function DetailEmptyState({ sortedStepsLength, isRunning, t }: DetailEmptyStateProps) {
  if (sortedStepsLength !== 0) return null;
  return (
    <ListState
      {...getListStateProps(isRunning, t)}
      compact
    />
  );
}

interface DetailListFeedLabelProps {
  sortedStepsLength: number;
  t: (key: string) => string;
}

function DetailListFeedLabel({ sortedStepsLength, t }: DetailListFeedLabelProps) {
  if (sortedStepsLength <= 0) return null;
  return (
    <p className="mb-1.5 text-[11px] text-muted-foreground">
      {t('runLog.detail_transcript_feed')}
    </p>
  );
}

interface DetailTranscriptListProps {
  sortedStepsLength: number;
  isRunning: boolean;
  listEntries: TranscriptListEntry[];
  renderCtx: ListEntryRenderCtx;
  t: (key: string) => string;
}

function DetailTranscriptList({
  sortedStepsLength,
  isRunning,
  listEntries,
  renderCtx,
  t,
}: DetailTranscriptListProps) {
  if (sortedStepsLength === 0) {
    return <DetailEmptyState sortedStepsLength={sortedStepsLength} isRunning={isRunning} t={t} />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {listEntries.map((entry, idx) => renderTranscriptEntry(entry, idx, renderCtx))}
    </div>
  );
}

interface DetailRightPanelProps {
  selectedStep: PersistentRunStep | null;
  run: PersistentRun;
  stepOrdinalById: Map<string, number>;
  sortedStepsLength: number;
  ownerKindLabel: string;
  progress: ReturnType<typeof getRunProgress>;
  usage: PersistentRunUsage | null;
  costLabel: string;
  providerLabel: string | undefined;
  modelId: string | undefined;
  t: (key: string) => string;
}

function DetailRightPanel(props: DetailRightPanelProps) {
  const { selectedStep, run, stepOrdinalById, sortedStepsLength, ownerKindLabel, progress,
    usage, costLabel, providerLabel, modelId, t } = props;
  if (selectedStep) {
    return (
      <StepDetailPanel
        step={selectedStep}
        run={run}
        stepOrdinal={stepOrdinalById.get(selectedStep.id) ?? 1}
        totalSteps={sortedStepsLength}
      />
    );
  }
  return (
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
  );
}

interface DetailMobileBackButtonProps {
  onBackToList: () => void;
  t: (key: string) => string;
}

function DetailMobileBackButton({ onBackToList, t }: DetailMobileBackButtonProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b p-2 lg:hidden border-border">
      <Button
        type="button"
        variant="ghost"
        className="gap-1"
        onClick={onBackToList}
        size="sm"
      >
        <HugeiconsIcon icon={ArrowLeftIcon} className="size-4" aria-hidden />
        {t('runLog.detail_back_list')}
      </Button>
    </div>
  );
}

function useSyncMobileDetailOpen(
  selectedStepId: string | null,
  setMobileDetailOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    setMobileDetailOpen(selectedStepId !== null);
  }, [selectedStepId, setMobileDetailOpen]);
}

function useResetSelectionOnRunChange(
  runId: string,
  setSelectedStepId: (id: string | null) => void,
  setMobileDetailOpen: (open: boolean) => void,
  setTranscriptFilter: (value: string) => void,
) {
  useEffect(() => {
    setSelectedStepId(null);
    setMobileDetailOpen(false);
    setTranscriptFilter('all');
  }, [runId, setSelectedStepId, setMobileDetailOpen, setTranscriptFilter]);
}

function toggleStepId(prev: string | null, id: string): string | null {
  return prev === id ? null : id;
}

function getListPanelVisibility(mobileDetailOpen: boolean): string {
  return mobileDetailOpen ? 'hidden lg:flex' : 'flex flex-1 lg:flex-none';
}

function getDetailPanelVisibility(mobileDetailOpen: boolean): string {
  return mobileDetailOpen ? 'flex' : 'hidden lg:flex';
}

function buildStepGroups(
  sortedSteps: PersistentRunStep[],
  run: PersistentRun,
  t: (key: string) => string,
): WorkflowStepGroup[] {
  if (sortedSteps.length === 0) return [];
  if (isWorkflowRun(run)) return buildWorkflowStepGroups(sortedSteps, t);
  return [{ key: '_flat', label: '', sectionKind: 'other' as const, steps: sortedSteps }];
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
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [transcriptFilter, setTranscriptFilter] = useState<string>('all');

  useResetSelectionOnRunChange(
    run.id,
    setSelectedStepId,
    setMobileDetailOpen,
    setTranscriptFilter,
  );
  useSyncMobileDetailOpen(selectedStepId, setMobileDetailOpen);

  const steps = useMemo(() => run.steps ?? [], [run.steps]);
  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => a.createdAt - b.createdAt),
    [steps],
  );

  const isRunning = run.status === 'running' || run.status === 'queued';
  const runIsTerminal =
    run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  const progress = getRunProgress(run);

  const meta = useMemo(
    () => (run.metadata ?? {}) as Record<string, unknown>,
    [run.metadata],
  );
  const usage = useMemo(() => getRunUsageFromRunMetadata(meta), [meta]);
  const modelId = typeof meta.model === 'string' ? meta.model : undefined;
  const providerLabel = typeof meta.provider === 'string' ? meta.provider : undefined;
  const costUsd = useMemo(
    () => estimateRunCostUsd(modelId, meta.usage),
    [modelId, meta],
  );
  const costLabel = formatUsdEstimate(costUsd, i18n.language);

  const { Icon: OwnerIcon, label: ownerKindLabel } = ownerPresentation(run, t);

  const selectedStep = useMemo(
    () => sortedSteps.find((s) => s.id === selectedStepId) ?? null,
    [sortedSteps, selectedStepId],
  );

  const stepGroups = useMemo(
    () => buildStepGroups(sortedSteps, run, t),
    [sortedSteps, run, t],
  );
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

  const listEntries = useMemo(
    () => buildTranscriptListEntries(transcriptRows),
    [transcriptRows],
  );
  const runEndAt = getRunDetailEndTimestamp(run, sortedSteps);

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

  const usageShort = getUsageShortLabel(usage, i18n.language);

  const handleSelectStep = (id: string) => {
    setSelectedStepId((prev) => toggleStepId(prev, id));
  };
  const handleBackToList = () => {
    setSelectedStepId(null);
    setMobileDetailOpen(false);
  };

  const listPanelClass = getListPanelVisibility(mobileDetailOpen);
  const detailPanelClass = getDetailPanelVisibility(mobileDetailOpen);

  const renderCtx: ListEntryRenderCtx = {
    groupByKey,
    agentColorByGroupKey,
    selectedStepId,
    onSelect: handleSelectStep,
    stepOrdinalById,
    runEndAt,
    runStartedAt: run.startedAt,
    sortedStepsLength: sortedSteps.length,
    runIsTerminal,
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <DetailHeader
        run={run}
        onBack={onBack}
        onStop={onStop}
        onDelete={onDelete}
        stopping={stopping}
        deleting={deleting}
        isRunning={isRunning}
        ownerKindLabel={ownerKindLabel}
        ownerIcon={OwnerIcon}
        sortedStepsLength={sortedSteps.length}
        usageShort={usageShort}
        costUsd={costUsd}
        costLabel={costLabel}
        providerLabel={providerLabel}
        modelId={modelId}
        t={t}
      />

      <DetailTimelineSection
        run={run}
        sortedSteps={sortedSteps}
        stepGroups={stepGroups}
        showAgentTabs={showAgentTabs}
        agentTabGroups={agentTabGroups}
        transcriptFilter={transcriptFilter}
        onTranscriptFilterChange={setTranscriptFilter}
        t={t}
      />

      {/* Transcript + detail */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-col border-border lg:w-[min(28rem,38%)] lg:shrink-0 lg:border-r',
            listPanelClass,
          )}
          style={{ background: 'var(--background)' }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-3 lg:max-h-full">
            <DetailListFeedLabel sortedStepsLength={sortedSteps.length} t={t} />
            <DetailTranscriptList
              sortedStepsLength={sortedSteps.length}
              isRunning={isRunning}
              listEntries={listEntries}
              renderCtx={renderCtx}
              t={t}
            />
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
            detailPanelClass,
          )}
          style={{ background: 'var(--background)' }}
        >
          <DetailMobileBackButton onBackToList={handleBackToList} t={t} />
          <DetailRightPanel
            selectedStep={selectedStep}
            run={run}
            stepOrdinalById={stepOrdinalById}
            sortedStepsLength={sortedSteps.length}
            ownerKindLabel={ownerKindLabel}
            progress={progress}
            usage={usage}
            costLabel={costLabel}
            providerLabel={providerLabel}
            modelId={modelId}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}
