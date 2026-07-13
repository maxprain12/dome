/**
 * Run step/timeline visual pieces (03/T02 — extracted from RunsWorkspaceView.tsx):
 * stat rows, workflow group headers, timeline bar, agent tab bar, step list
 * items and the step detail panel.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  CheckmarkCircle02Icon as CheckCircle2Icon,
  Clock01Icon as ClockIcon,
  Loading03Icon as Loader2Icon,
  CancelCircleIcon as XCircleIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { formatRunDate } from '@/lib/automations/run-log-format';
import { JsonPrettyPrinterRoot } from '@/lib/chat/jsonPrettyPrinter';
import type { PersistentRun, PersistentRunStep } from '@/lib/automations/api';
import { cn } from '@/lib/utils';
import CollapsibleRow from '@/components/shared/CollapsibleRow';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  extractWorkflowToolShortName,
  findWorkflowAgentAncestor,
  formatSessionClock,
  getOverviewSegmentColor,
  getStepAccent,
  getStepBadgeLabel,
  getStepDurationSec,
  getStepListSummary,
  getStepUsageShort,
  getStepVisualKind,
  getToolArgs,
  getToolDisplayTitle,
  isWorkflowRun,
  parseStepContentJson,
  AGENT_LANE_PALETTE,
  type WorkflowStepGroup,
} from './runPresentation';

export function RunOverviewStatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <p className="text-[10px] leading-tight text-muted-foreground">
        {label}
      </p>
      <div className="text-xs min-w-0 break-words leading-snug text-foreground">
        {value}
      </div>
    </div>
  );
}

// ─── Run detail transcript helpers ───────────────────────────────────────────


export function WorkflowGroupHeader({ group, accentColor }: { group: WorkflowStepGroup; accentColor?: string }) {
  const { t } = useTranslation();
  const toolSteps = group.steps.filter((s) => s.stepType === 'tool_call' || s.stepType === 'tool');
  const toolNames = [...new Set(toolSteps.map((s) => extractWorkflowToolShortName(s)).filter(Boolean))];
  const accent = accentColor ?? 'var(--border)';

  return (
    <div
      className="sticky top-0 z-[1] mb-1.5 border-b border-border bg-background py-2 pl-1 pr-2"
    >
      <div className="flex min-w-0 gap-2">
        <div className="w-0.5 shrink-0 self-stretch rounded-full" style={{ background: accent }} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium leading-snug break-words text-foreground">
            {group.label}
            <span className="font-normal tabular-nums text-muted-foreground">
              {' '}
              · {group.steps.length}
            </span>
          </p>
          {group.sectionKind === 'agent' && toolSteps.length > 0 ? (
            <p className="text-[11px] leading-relaxed break-words text-muted-foreground">
              {toolNames.length > 0 ? (
                <>
                  {toolNames.slice(0, 12).join(' · ')}
                  {toolNames.length > 12 ? ` · +${toolNames.length - 12}` : ''}
                </>
              ) : (
                t('runLog.detail_workflow_tools_used', { count: toolSteps.length })
              )}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}


export function RunTimelineBar({
  run,
  steps,
  stepGroups,
}: {
  run: PersistentRun;
  steps: PersistentRunStep[];
  stepGroups?: WorkflowStepGroup[];
}) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;
  const t0 = run.startedAt;
  const lastTs = steps[steps.length - 1]?.updatedAt ?? steps[steps.length - 1]?.createdAt ?? t0;
  const tEnd = run.finishedAt ?? lastTs;
  const total = Math.max(tEnd - t0, 1000);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const agents = (stepGroups ?? []).filter((g) => g.sectionKind === 'agent');
  const agentColorByKey = new Map<string, string>();
  agents.forEach((g, i) => {
    agentColorByKey.set(g.key, AGENT_LANE_PALETTE[i % AGENT_LANE_PALETTE.length]);
  });

  const segments = steps.map((step, i) => {
    const next = steps[i + 1];
    const segStart = step.createdAt;
    const segEnd = next ? next.createdAt : tEnd;
    const rawPct = ((segEnd - segStart) / total) * 100;
    const widthPct = Math.max(0.35, rawPct);
    const rel = Math.max(0, Math.round((step.createdAt - t0) / 1000));
    const title = `${getStepListSummary(step)} · ${t('runLog.detail_relative_time', { seconds: rel })}`;
    const color =
      agents.length > 1 ? getOverviewSegmentColor(step, byId, agentColorByKey) : getStepAccent(step);
    return { step, widthPct, title, color };
  });
  const sum = segments.reduce((a, s) => a + s.widthPct, 0);

  return (
    <div className="shrink-0 space-y-1.5">
      <figure
        className="flex h-1 w-full min-w-0 overflow-hidden rounded-sm bg-border"
        aria-label={t('runLog.detail_timeline')}
      >
        {segments.map(({ step, widthPct, title, color }) => (
          <div
            key={step.id}
            title={title}
            className="h-full min-w-px shrink-0"
            style={{
              width: `${(widthPct / sum) * 100}%`,
              background: color,
            }}
          />
        ))}
      </figure>

      {agents.length > 1 ? (
        <div className="space-y-1 pl-0">
          {agents.map((g) => {
            const laneColor = agentColorByKey.get(g.key) ?? AGENT_LANE_PALETTE[0];
            const laneSteps = g.steps;
            return (
              <div key={g.key} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-[5.5rem] sm:w-36 md:w-44 shrink-0 truncate text-[10px] leading-tight text-muted-foreground"
                  title={g.label}
                >
                  {g.label}
                </span>
                <div
                  className="relative h-1 min-w-0 flex-1 rounded-sm overflow-hidden"
                  style={{ background: 'color-mix(in srgb, var(--border) 55%, transparent)' }}
                >
                  {laneSteps.map((step, idx) => {
                    const next = laneSteps[idx + 1];
                    const segEnd = next ? next.createdAt : tEnd;
                    const left = ((step.createdAt - t0) / total) * 100;
                    const w = Math.max(0.25, ((segEnd - step.createdAt) / total) * 100);
                    const rel = Math.max(0, Math.round((step.createdAt - t0) / 1000));
                    return (
                      <div
                        key={step.id}
                        title={`${getStepListSummary(step)} · ${t('runLog.detail_relative_time', { seconds: rel })}`}
                        className="absolute top-0 h-full rounded-sm"
                        style={{
                          left: `${left}%`,
                          width: `${w}%`,
                          background: laneColor,
                          minWidth: 2,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}


export function WorkflowAgentTabBar({
  agentGroups,
  value,
  onChange,
  totalStepCount,
}: {
  agentGroups: WorkflowStepGroup[];
  value: string;
  onChange: (next: string) => void;
  totalStepCount: number;
}) {
  const { t } = useTranslation();
  if (agentGroups.length === 0) return null;
  const options = [
    {
      value: 'all',
      label: `${t('runLog.detail_transcript_all')} (${totalStepCount})`,
      selectedColor: 'var(--primary)',
    },
    ...agentGroups.map((g) => ({
      value: g.key,
      label: `${g.label} (${g.steps.length})`,
      selectedColor: 'var(--primary)',
    })),
  ];
  return (
    <div
      className="shrink-0 overflow-x-auto border-b scroll-smooth"
      style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
    >
      <div className="px-3 sm:px-4 py-2 min-w-0" aria-label={t('runLog.detail_transcript_tabs')}>
        <ToggleGroup value={[value]} onValueChange={(values) => values[0] && onChange(values[0])}>
          {options.map((option) => <ToggleGroupItem key={option.value} value={option.value} size="sm">{option.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
    </div>
  );
}


export function StepStatusIcon({
  step,
  runIsTerminal = false,
}: {
  step: PersistentRunStep;
  runIsTerminal?: boolean;
}) {
  const muted = 'var(--muted-foreground)';
  if (step.status === 'failed' || step.status === 'error' || getStepVisualKind(step) === 'error') {
    return <HugeiconsIcon icon={XCircleIcon} className="size-3 shrink-0 text-destructive" aria-hidden />;
  }
  if (step.status === 'cancelled') {
    return <HugeiconsIcon icon={XCircleIcon} className="size-3 shrink-0 opacity-60" style={{ color: muted }} aria-hidden />;
  }
  if (step.status === 'waiting_approval') {
    return <HugeiconsIcon icon={ClockIcon} className="size-3 shrink-0 opacity-80" style={{ color: muted }} aria-hidden />;
  }
  if (step.status === 'running') {
    if (runIsTerminal) {
      return <HugeiconsIcon icon={CheckCircle2Icon} className="size-3 shrink-0 opacity-70" style={{ color: muted }} aria-hidden />;
    }
    return <HugeiconsIcon icon={Loader2Icon} className="size-3 shrink-0 animate-spin" style={{ color: muted }} aria-hidden />;
  }
  if (step.status === 'completed' || step.status === 'done') {
    return <HugeiconsIcon icon={CheckCircle2Icon} className="size-3 shrink-0 opacity-70" style={{ color: muted }} aria-hidden />;
  }
  return null;
}


export function StepListItem({
  step,
  selected,
  onSelect,
  nextStep,
  runEndAt,
  runStartedAt,
  stepOrdinal,
  totalSteps,
  runIsTerminal = false,
}: {
  step: PersistentRunStep;
  selected: boolean;
  onSelect: () => void;
  nextStep?: PersistentRunStep | null;
  runEndAt: number;
  runStartedAt: number;
  stepOrdinal: number;
  totalSteps: number;
  runIsTerminal?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const durSec = getStepDurationSec(step, nextStep ?? undefined, runEndAt);
  const clock = formatSessionClock(step.createdAt, runStartedAt);
  const usageLine = getStepUsageShort(step, i18n.language);

  return (
    <Button
      type="button"
      variant={selected ? 'secondary' : 'outline'}
      onClick={onSelect}
      aria-label={t('runLog.detail_trace_step_of', { current: stepOrdinal, total: totalSteps })}
      className={cn(
        'group h-auto w-full min-w-0 items-start justify-start gap-2 border-l-2 py-1.5 pl-2 pr-2 text-left',
        selected && 'border-l-primary',
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
          <span
            className="w-6 shrink-0 text-right text-[10px] font-medium tabular-nums leading-none text-muted-foreground"
          >
            {stepOrdinal}
          </span>
          <span className="text-[10px] leading-none text-muted-foreground">
            {getStepBadgeLabel(step, t)}
          </span>
        </div>
        <p className="w-full min-w-0 text-xs font-normal leading-snug break-words text-foreground">
          {getStepListSummary(step)}
        </p>
      </div>
      <div
        className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] tabular-nums text-right min-w-[3.25rem] sm:min-w-[6.5rem] text-muted-foreground"
      >
        {usageLine ? <span className="max-w-[6.5rem] sm:max-w-[7rem] truncate">{usageLine}</span> : null}
        <span className="whitespace-nowrap">
          {durSec}s · {clock}
        </span>
        <StepStatusIcon step={step} runIsTerminal={runIsTerminal} />
      </div>
    </Button>
  );
}


export function StepDetailPanel({
  step,
  run,
  stepOrdinal,
  totalSteps,
}: {
  step: PersistentRunStep;
  run: PersistentRun;
  stepOrdinal: number;
  totalSteps: number;
}) {
  const { t } = useTranslation();
  const [argsOpen, setArgsOpen] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const isTool = step.stepType === 'tool_call' || step.stepType === 'tool';
  const toolArgs = useMemo(() => (isTool ? getToolArgs(step) : {}), [isTool, step]);
  const hasArgs = isTool && Object.keys(toolArgs).length > 0;
  const parsedContent = useMemo(() => parseStepContentJson(step.content), [step.content]);

  const workflowAgentCtx = useMemo(() => {
    if (!isWorkflowRun(run)) return null;
    const byId = new Map((run.steps ?? []).map((s) => [s.id, s]));
    const agent = findWorkflowAgentAncestor(step, byId);
    if (!agent || agent.id === step.id) return null;
    return agent.title || t('runLog.detail_workflow_agent_fallback');
  }, [run, step, t]);

  const headerTitle = isTool
    ? extractWorkflowToolShortName(step) || getToolDisplayTitle(step)
    : step.title || step.stepType;
  const offsetSec = Math.max(0, Math.round((step.createdAt - run.startedAt) / 1000));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="shrink-0 border-b px-4 py-2.5"
        style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {t('runLog.detail_trace_step_of', { current: stepOrdinal, total: totalSteps })}
            </span>
            <span aria-hidden>·</span>
            <span>{getStepBadgeLabel(step, t)}</span>
          </div>
          <h2 className="text-sm font-medium break-words leading-snug text-foreground">
            {headerTitle}
          </h2>
        </div>
        {workflowAgentCtx ? (
          <p className="mt-1.5 text-[11px] break-words text-muted-foreground">
            {t('runLog.detail_workflow_under_agent', { name: workflowAgentCtx })}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] break-words text-muted-foreground">
          {formatRunDate(step.createdAt)}
          {' · '}
          {t('runLog.detail_relative_time', { seconds: offsetSec })}
          {step.updatedAt !== step.createdAt ? (
            <>
              {' · '}
              {formatRunDate(step.updatedAt)}
            </>
          ) : null}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {hasArgs ? (
          <CollapsibleRow
            expanded={argsOpen}
            onExpandedChange={setArgsOpen}
            triggerClassName="px-0 py-1 bg-transparent hover:bg-transparent"
            trigger={
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-foreground">
                {t('runLog.detail_args')}
              </p>
            }
          >
            <div
              className="mt-1 rounded-lg border p-2.5 text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto"
              style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
            >
              <JsonPrettyPrinterRoot value={toolArgs} />
            </div>
          </CollapsibleRow>
        ) : null}

        {isTool && step.content ? (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-foreground">
                {t('runLog.detail_result')}
              </p>
              <Button type="button"
  variant="outline"
  onClick={() => setShowRaw(!showRaw)}
  size="xs">
                {showRaw ? t('runLog.view_pretty') : t('runLog.view_raw')}
              </Button>
            </div>
            {showRaw ? (
              <pre
                className="rounded-lg border p-3 text-[11px] font-mono overflow-auto max-h-72 whitespace-pre-wrap break-all"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              >
                {typeof step.content === 'string' ? step.content : JSON.stringify(step.content, null, 2)}
              </pre>
            ) : parsedContent !== null && typeof parsedContent === 'object' ? (
              <div
                className="rounded-lg border p-3 text-[11px] font-mono overflow-auto max-h-72"
                style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
              >
                <JsonPrettyPrinterRoot value={parsedContent} />
              </div>
            ) : (
              <div
                className="rounded-lg border p-3 text-sm overflow-auto max-h-72 break-words"
                style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
              >
                <MarkdownRenderer content={String(step.content)} />
              </div>
            )}
          </div>
        ) : null}

        {!isTool && step.content ? (
          <div
            className="rounded-lg border p-3 text-sm min-w-0 overflow-x-auto"
            style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
          >
            <MarkdownRenderer
              content={typeof step.content === 'string' ? step.content : JSON.stringify(step.content, null, 2)}
            />
          </div>
        ) : null}

        {!step.content && !hasArgs ? (
          <p className="text-xs text-muted-foreground">
            {t('runLog.detail_select_hint')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
