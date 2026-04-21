'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment, type ReactNode } from 'react';
import {
  Activity,
  Trash2,
  Loader2,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { statusColor as runStatusColor } from '@/lib/automations/run-status';
import { formatRunDate, formatDuration, RunProgressBar, JsonPrettyPrinter } from '@/components/automations/RunLogView';
import {
  listRuns,
  getRun,
  deleteRun,
  onRunUpdated,
  onRunStep,
  type PersistentRun,
  type PersistentRunStep,
} from '@/lib/automations/api';
import {
  estimateRunCostUsd,
  formatUsdEstimate,
  getRunUsageFromRunMetadata,
} from '@/lib/automations/run-cost';
import { getRunProgress } from '@/lib/automations/run-progress';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import i18n, { getDateTimeLocaleTag } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import DomeCollapsibleRow from '@/components/ui/DomeCollapsibleRow';
import DomeButton from '@/components/ui/DomeButton';
import HubListState from '@/components/ui/HubListState';
import HubBentoCard from '@/components/ui/HubBentoCard';
import HubEntityIcon from '@/components/ui/HubEntityIcon';
import HubToolbar from '@/components/ui/HubToolbar';
import HubTitleBlock from '@/components/ui/HubTitleBlock';
import DomeStatusBadge from '@/components/ui/DomeStatusBadge';
import DomeSkeletonGrid from '@/components/ui/DomeSkeletonGrid';
import DomeFilterChipGroup from '@/components/ui/DomeFilterChipGroup';
import DomeDivider from '@/components/ui/DomeDivider';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeSubpageFooter from '@/components/ui/DomeSubpageFooter';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeListState from '@/components/ui/DomeListState';

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

function formatIntToken(n: number, locale: string) {
  return new Intl.NumberFormat(locale).format(n);
}

function RunOverviewStatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <p className="text-[10px] leading-tight" style={{ color: 'var(--dome-text-muted)' }}>
        {label}
      </p>
      <div className="text-xs min-w-0 break-words leading-snug" style={{ color: 'var(--dome-text)' }}>
        {value}
      </div>
    </div>
  );
}

// ─── Run detail transcript helpers ───────────────────────────────────────────

type StepVisualKind = 'tool' | 'message' | 'thinking' | 'error' | 'agent' | 'other';

function parseStepContentJson(raw: unknown): unknown {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function getStepVisualKind(step: PersistentRunStep): StepVisualKind {
  if (step.stepType === 'error' || step.status === 'failed' || step.status === 'error') return 'error';
  if (step.stepType === 'workflow_agent') return 'agent';
  if (step.stepType === 'tool_call' || step.stepType === 'tool') return 'tool';
  if (step.stepType === 'thinking') return 'thinking';
  if (step.stepType === 'message' || step.stepType === 'output') return 'message';
  return 'other';
}

/** Muted accent for timelines / status (minimal UI). */
function getStepAccent(step: PersistentRunStep): string {
  const k = getStepVisualKind(step);
  if (k === 'error') return 'var(--error)';
  return 'color-mix(in srgb, var(--dome-text) 26%, var(--dome-border))';
}

function getStepBadgeLabel(
  step: PersistentRunStep,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const kind = getStepVisualKind(step);
  switch (kind) {
    case 'tool':
      return t('runLog.detail_badge_tool');
    case 'agent':
      return t('runLog.detail_badge_agent');
    case 'message':
      return t('runLog.detail_badge_message');
    case 'thinking':
      return t('runLog.detail_badge_thinking');
    case 'error':
      return t('runLog.detail_badge_error');
    default:
      return t('runLog.detail_badge_step');
  }
}

function getToolDisplayTitle(step: PersistentRunStep): string {
  if (step.stepType !== 'tool_call' && step.stepType !== 'tool') {
    return step.title || step.stepType;
  }
  const name = step.title || '';
  const key = `runLog.tools.${name}`;
  const translated = i18n.t(key);
  if (translated !== key) return translated;
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || name;
}

function getStepListSummary(step: PersistentRunStep): string {
  const isTool = step.stepType === 'tool_call' || step.stepType === 'tool';
  if (isTool) {
    const short = extractWorkflowToolShortName(step);
    if (short) return short;
    return getToolDisplayTitle(step);
  }
  if (step.title?.trim()) return step.title;
  const c = step.content;
  if (typeof c === 'string' && c.trim()) {
    const oneLine = c.replace(/\s+/g, ' ').trim();
    return oneLine.length > 72 ? `${oneLine.slice(0, 72)}…` : oneLine;
  }
  return step.stepType;
}

function getToolArgs(step: PersistentRunStep): Record<string, unknown> {
  const meta = step.metadata || {};
  if (meta.arguments && typeof meta.arguments === 'object') {
    return meta.arguments as Record<string, unknown>;
  }
  if (meta.args && typeof meta.args === 'object') {
    return meta.args as Record<string, unknown>;
  }
  return {};
}

function isWorkflowRun(run: PersistentRun): boolean {
  if (run.ownerType === 'workflow') return true;
  const kind = run.metadata && (run.metadata as Record<string, unknown>).kind;
  return kind === 'workflow';
}

function findWorkflowAgentAncestor(
  step: PersistentRunStep,
  byId: Map<string, PersistentRunStep>,
): PersistentRunStep | null {
  let current: PersistentRunStep | undefined = step;
  const visited = new Set<string>();
  while (current?.parentStepId) {
    if (visited.has(current.parentStepId)) break;
    visited.add(current.parentStepId);
    const parent = byId.get(current.parentStepId);
    if (!parent) break;
    if (parent.stepType === 'workflow_agent') return parent;
    current = parent;
  }
  return null;
}

/** Short tool name for workflow logs where title is "Nodo: tool_name". */
function extractWorkflowToolShortName(step: PersistentRunStep): string {
  if (step.stepType !== 'tool_call' && step.stepType !== 'tool') return '';
  const title = step.title || '';
  const cut = title.lastIndexOf(': ');
  const raw = cut >= 0 ? title.slice(cut + 2).trim() : title.trim();
  if (!raw) return '';
  const key = `runLog.tools.${raw}`;
  const translated = i18n.t(key);
  if (translated !== key) return translated;
  return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface WorkflowStepGroup {
  key: string;
  label: string;
  sectionKind: 'agent' | 'node' | 'output' | 'completion' | 'error' | 'other';
  steps: PersistentRunStep[];
}

interface WorkflowSectionMeta {
  key: string;
  label: string;
  sectionKind: WorkflowStepGroup['sectionKind'];
}

function resolveWorkflowSectionMeta(
  step: PersistentRunStep,
  byId: Map<string, PersistentRunStep>,
  t: (key: string, options?: Record<string, unknown>) => string,
): WorkflowSectionMeta {
  if (step.stepType === 'workflow_agent') {
    return {
      key: `agent:${step.id}`,
      label: step.title || t('runLog.detail_workflow_agent_fallback'),
      sectionKind: 'agent',
    };
  }
  const agent = findWorkflowAgentAncestor(step, byId);
  if (agent) {
    return {
      key: `agent:${agent.id}`,
      label: agent.title || t('runLog.detail_workflow_agent_fallback'),
      sectionKind: 'agent',
    };
  }
  if (step.stepType === 'workflow_node') {
    const nodeId = typeof step.metadata?.nodeId === 'string' ? step.metadata.nodeId : step.id;
    return {
      key: `node:${nodeId}`,
      label: step.title || t('runLog.detail_workflow_inputs'),
      sectionKind: 'node',
    };
  }
  if (step.stepType === 'workflow_output') {
    const nodeId = typeof step.metadata?.nodeId === 'string' ? step.metadata.nodeId : step.id;
    return {
      key: `out:${nodeId}`,
      label: step.title || t('runLog.detail_workflow_output_block'),
      sectionKind: 'output',
    };
  }
  if (step.stepType === 'completion') {
    return {
      key: '_completion',
      label: t('runLog.detail_workflow_completion'),
      sectionKind: 'completion',
    };
  }
  if (step.stepType === 'error') {
    return {
      key: '_error',
      label: t('runLog.error_title'),
      sectionKind: 'error',
    };
  }
  return {
    key: '_other',
    label: t('runLog.detail_workflow_other'),
    sectionKind: 'other',
  };
}

function buildWorkflowStepGroups(
  sortedSteps: PersistentRunStep[],
  t: (key: string, options?: Record<string, unknown>) => string,
): WorkflowStepGroup[] {
  const byId = new Map(sortedSteps.map((s) => [s.id, s]));
  const order: string[] = [];
  const map = new Map<string, WorkflowStepGroup>();

  const ensure = (key: string, label: string, sectionKind: WorkflowStepGroup['sectionKind']) => {
    if (!map.has(key)) {
      map.set(key, { key, label, sectionKind, steps: [] });
      order.push(key);
    }
  };

  for (const step of sortedSteps) {
    const { key, label, sectionKind } = resolveWorkflowSectionMeta(step, byId, t);
    ensure(key, label, sectionKind);
    map.get(key)!.steps.push(step);
  }

  return order.map((k) => map.get(k)!);
}

type TranscriptRow = { type: 'header'; groupKey: string } | { type: 'step'; step: PersistentRunStep };

function buildTranscriptRows(
  sortedSteps: PersistentRunStep[],
  filterAgentKey: string,
  isWorkflow: boolean,
  t: (key: string, options?: Record<string, unknown>) => string,
): TranscriptRow[] {
  const byId = new Map(sortedSteps.map((s) => [s.id, s]));
  const filtered =
    !isWorkflow || filterAgentKey === 'all'
      ? sortedSteps
      : sortedSteps.filter((s) => resolveWorkflowSectionMeta(s, byId, t).key === filterAgentKey);

  const rows: TranscriptRow[] = [];
  let lastKey: string | null = null;
  for (const step of filtered) {
    if (isWorkflow) {
      const { key } = resolveWorkflowSectionMeta(step, byId, t);
      if (key !== lastKey) {
        rows.push({ type: 'header', groupKey: key });
        lastKey = key;
      }
    }
    rows.push({ type: 'step', step });
  }
  return rows;
}

const AGENT_LANE_PALETTE = [
  'color-mix(in srgb, var(--dome-text) 34%, var(--dome-border))',
  'color-mix(in srgb, var(--dome-text) 22%, var(--dome-border))',
  'color-mix(in srgb, var(--dome-text) 44%, var(--dome-border))',
  'color-mix(in srgb, var(--dome-accent) 24%, var(--dome-border))',
  'color-mix(in srgb, var(--dome-text) 16%, var(--dome-border))',
];

function WorkflowGroupHeader({ group, accentColor }: { group: WorkflowStepGroup; accentColor?: string }) {
  const { t } = useTranslation();
  const toolSteps = group.steps.filter((s) => s.stepType === 'tool_call' || s.stepType === 'tool');
  const toolNames = [...new Set(toolSteps.map((s) => extractWorkflowToolShortName(s)).filter(Boolean))];
  const accent = accentColor ?? 'var(--dome-border)';

  return (
    <div
      className="sticky top-0 z-[1] mb-1.5 border-b border-[var(--dome-border)] bg-[var(--dome-bg)] py-2 pl-1 pr-2"
    >
      <div className="flex min-w-0 gap-2">
        <div className="w-0.5 shrink-0 self-stretch rounded-full" style={{ background: accent }} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium leading-snug break-words" style={{ color: 'var(--dome-text)' }}>
            {group.label}
            <span className="font-normal tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
              {' '}
              · {group.steps.length}
            </span>
          </p>
          {group.sectionKind === 'agent' && toolSteps.length > 0 ? (
            <p className="text-[11px] leading-relaxed break-words" style={{ color: 'var(--dome-text-muted)' }}>
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

function getOverviewSegmentColor(
  step: PersistentRunStep,
  byId: Map<string, PersistentRunStep>,
  agentColorByKey: Map<string, string>,
): string {
  if (step.stepType === 'workflow_agent') {
    const k = `agent:${step.id}`;
    const c = agentColorByKey.get(k);
    if (c) return c;
  }
  const ancestor = findWorkflowAgentAncestor(step, byId);
  if (ancestor) {
    const c = agentColorByKey.get(`agent:${ancestor.id}`);
    if (c) return c;
  }
  return getStepAccent(step);
}

function RunTimelineBar({
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
      <div
        className="flex h-1 w-full min-w-0 overflow-hidden rounded-sm"
        style={{ background: 'var(--dome-border)' }}
        role="img"
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
      </div>

      {agents.length > 1 ? (
        <div className="space-y-1 pl-0">
          {agents.map((g) => {
            const laneColor = agentColorByKey.get(g.key) ?? AGENT_LANE_PALETTE[0];
            const laneSteps = g.steps;
            return (
              <div key={g.key} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-[5.5rem] sm:w-36 md:w-44 shrink-0 truncate text-[10px] leading-tight"
                  style={{ color: 'var(--dome-text-muted)' }}
                  title={g.label}
                >
                  {g.label}
                </span>
                <div
                  className="relative h-1 min-w-0 flex-1 rounded-sm overflow-hidden"
                  style={{ background: 'color-mix(in srgb, var(--dome-border) 55%, transparent)' }}
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

function WorkflowAgentTabBar({
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
      selectedColor: 'var(--dome-accent)',
    },
    ...agentGroups.map((g) => ({
      value: g.key,
      label: `${g.label} (${g.steps.length})`,
      selectedColor: 'var(--dome-accent)',
    })),
  ];
  return (
    <div
      className="shrink-0 overflow-x-auto border-b scroll-smooth"
      style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
    >
      <div className="px-3 sm:px-4 py-2 min-w-0" aria-label={t('runLog.detail_transcript_tabs')}>
        <DomeFilterChipGroup options={options} value={value} onChange={onChange} dense />
      </div>
    </div>
  );
}

function formatSessionClock(createdAt: number, runStart: number): string {
  const sec = Math.max(0, Math.floor((createdAt - runStart) / 1000));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function getStepDurationSec(
  step: PersistentRunStep,
  nextStep: PersistentRunStep | undefined,
  runEndAt: number,
): number {
  const end = nextStep?.createdAt ?? step.updatedAt ?? runEndAt;
  return Math.max(0, Math.round((end - step.createdAt) / 1000));
}

function getStepUsageShort(step: PersistentRunStep, locale: string): string | null {
  const raw = step.metadata?.usage;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tot = Math.max(0, Math.floor(Number(o.totalTokens ?? o.total_tokens ?? 0) || 0));
  const inn = Math.max(0, Math.floor(Number(o.inputTokens ?? o.input_tokens ?? 0) || 0));
  const out = Math.max(0, Math.floor(Number(o.outputTokens ?? o.output_tokens ?? 0) || 0));
  if (tot > 0) return `${formatIntToken(tot, locale)} toks`;
  if (inn > 0 || out > 0) return `${formatIntToken(inn, locale)}in / ${formatIntToken(out, locale)}out`;
  return null;
}

function StepStatusIcon({ step }: { step: PersistentRunStep }) {
  const muted = 'var(--dome-text-muted)';
  if (step.status === 'failed' || step.status === 'error' || getStepVisualKind(step) === 'error') {
    return <XCircle className="w-3 h-3 shrink-0" style={{ color: 'var(--error)' }} aria-hidden />;
  }
  if (step.status === 'cancelled') {
    return <XCircle className="w-3 h-3 shrink-0 opacity-60" style={{ color: muted }} aria-hidden />;
  }
  if (step.status === 'waiting_approval') {
    return <Clock className="w-3 h-3 shrink-0 opacity-80" style={{ color: muted }} aria-hidden />;
  }
  if (step.status === 'running') {
    return <Loader2 className="w-3 h-3 shrink-0 animate-spin" style={{ color: muted }} aria-hidden />;
  }
  if (step.status === 'completed' || step.status === 'done') {
    return <CheckCircle2 className="w-3 h-3 shrink-0 opacity-70" style={{ color: muted }} aria-hidden />;
  }
  return null;
}

function StepListItem({
  step,
  selected,
  onSelect,
  nextStep,
  runEndAt,
  runStartedAt,
  stepOrdinal,
  totalSteps,
}: {
  step: PersistentRunStep;
  selected: boolean;
  onSelect: () => void;
  nextStep?: PersistentRunStep | null;
  runEndAt: number;
  runStartedAt: number;
  stepOrdinal: number;
  totalSteps: number;
}) {
  const { t, i18n } = useTranslation();
  const durSec = getStepDurationSec(step, nextStep ?? undefined, runEndAt);
  const clock = formatSessionClock(step.createdAt, runStartedAt);
  const usageLine = getStepUsageShort(step, i18n.language);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={t('runLog.detail_trace_step_of', { current: stepOrdinal, total: totalSteps })}
      className={cn(
        'group flex w-full min-w-0 items-start gap-2 rounded-md border py-1.5 pl-2 pr-2 text-left transition-colors',
        'border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2',
      )}
      style={{
        borderColor: 'var(--dome-border)',
        borderLeftColor: selected ? 'var(--dome-accent)' : 'var(--dome-border)',
        background: selected
          ? 'color-mix(in srgb, var(--dome-text) 5%, var(--dome-bg))'
          : 'transparent',
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
          <span
            className="w-6 shrink-0 text-right text-[10px] font-medium tabular-nums leading-none"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            {stepOrdinal}
          </span>
          <span className="text-[10px] leading-none" style={{ color: 'var(--dome-text-muted)' }}>
            {getStepBadgeLabel(step, t)}
          </span>
        </div>
        <p className="w-full min-w-0 text-xs font-normal leading-snug break-words" style={{ color: 'var(--dome-text)' }}>
          {getStepListSummary(step)}
        </p>
      </div>
      <div
        className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] tabular-nums text-right min-w-[3.25rem] sm:min-w-[6.5rem]"
        style={{ color: 'var(--dome-text-muted)' }}
      >
        {usageLine ? <span className="max-w-[6.5rem] sm:max-w-[7rem] truncate">{usageLine}</span> : null}
        <span className="whitespace-nowrap">
          {durSec}s · {clock}
        </span>
        <StepStatusIcon step={step} />
      </div>
    </button>
  );
}

function StepDetailPanel({
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
        style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
            <span className="tabular-nums">
              {t('runLog.detail_trace_step_of', { current: stepOrdinal, total: totalSteps })}
            </span>
            <span aria-hidden>·</span>
            <span>{getStepBadgeLabel(step, t)}</span>
          </div>
          <h2 className="text-sm font-medium break-words leading-snug" style={{ color: 'var(--dome-text)' }}>
            {headerTitle}
          </h2>
        </div>
        {workflowAgentCtx ? (
          <p className="mt-1.5 text-[11px] break-words" style={{ color: 'var(--dome-text-muted)' }}>
            {t('runLog.detail_workflow_under_agent', { name: workflowAgentCtx })}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] break-words" style={{ color: 'var(--dome-text-muted)' }}>
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
          <DomeCollapsibleRow
            expanded={argsOpen}
            onExpandedChange={setArgsOpen}
            triggerClassName="px-0 py-1 bg-transparent hover:bg-transparent"
            trigger={
              <DomeSectionLabel compact={false} className="text-[var(--dome-text)]">
                {t('runLog.detail_args')}
              </DomeSectionLabel>
            }
          >
            <div
              className="mt-1 rounded-lg border p-2.5 text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
            >
              <JsonPrettyPrinter value={toolArgs} />
            </div>
          </DomeCollapsibleRow>
        ) : null}

        {isTool && step.content ? (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <DomeSectionLabel compact={false} className="text-[var(--dome-text)]">
                {t('runLog.detail_result')}
              </DomeSectionLabel>
              <DomeButton type="button" variant="outline" size="xs" onClick={() => setShowRaw(!showRaw)}>
                {showRaw ? t('runLog.view_pretty') : t('runLog.view_raw')}
              </DomeButton>
            </div>
            {showRaw ? (
              <pre
                className="rounded-lg border p-3 text-[11px] font-mono overflow-auto max-h-72 whitespace-pre-wrap break-all"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
              >
                {typeof step.content === 'string' ? step.content : JSON.stringify(step.content, null, 2)}
              </pre>
            ) : parsedContent !== null && typeof parsedContent === 'object' ? (
              <div
                className="rounded-lg border p-3 text-[11px] font-mono overflow-auto max-h-72"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
              >
                <JsonPrettyPrinter value={parsedContent} />
              </div>
            ) : (
              <div
                className="rounded-lg border p-3 text-sm overflow-auto max-h-72 break-words"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
              >
                <MarkdownRenderer content={String(step.content)} />
              </div>
            )}
          </div>
        ) : null}

        {!isTool && step.content ? (
          <div
            className="rounded-lg border p-3 text-sm min-w-0 overflow-x-auto"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
          >
            <MarkdownRenderer
              content={typeof step.content === 'string' ? step.content : JSON.stringify(step.content, null, 2)}
            />
          </div>
        ) : null}

        {!step.content && !hasArgs ? (
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {t('runLog.detail_select_hint')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface RunRightOverviewProps {
  run: PersistentRun;
  ownerKindLabel: string;
  progress: ReturnType<typeof getRunProgress>;
  usage: ReturnType<typeof getRunUsageFromRunMetadata>;
  costLabel: string;
  providerLabel?: string;
  modelId?: string;
}

function RunRightOverview({
  run,
  ownerKindLabel,
  progress,
  usage,
  costLabel,
  providerLabel,
  modelId,
}: RunRightOverviewProps) {
  const { t, i18n } = useTranslation();
  const panelClass =
    'min-w-0 rounded-md border border-[var(--dome-border)] bg-[var(--dome-surface)] px-3 py-2.5';
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <section className={panelClass}>
        <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--dome-text-muted)' }}>
          {t('runLog.detail_run_overview')}
        </h3>
        <div className="min-w-0 divide-y divide-[var(--dome-border)]">
          <RunOverviewStatRow label={t('runLog.detail_owner')} value={ownerKindLabel} />
          {providerLabel || modelId ? (
            <RunOverviewStatRow
              label={t('runLog.detail_provider_model')}
              value={[providerLabel, modelId].filter(Boolean).join(' · ') || t('runLog.em_dash')}
            />
          ) : null}
          {run.automationId ? (
            <RunOverviewStatRow label={t('runLog.detail_automation_id')} value={run.automationId} />
          ) : null}
          <RunOverviewStatRow
            label={t('runLog.detail_steps_label')}
            value={
              (run.steps?.length ?? 0) === 1
                ? t('runLog.step_singular')
                : t('runLog.step_plural', { count: run.steps?.length ?? 0 })
            }
          />
          {run.summary ? (
            <RunOverviewStatRow label={t('runLog.summary')} value={<span className="break-words">{run.summary}</span>} />
          ) : null}
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--dome-text-muted)' }}>
          {t('runLog.detail_section_time')}
        </h3>
        <div className="min-w-0 divide-y divide-[var(--dome-border)]">
          <RunOverviewStatRow label={t('runLog.duration')} value={formatDuration(run.startedAt, run.finishedAt)} />
          {run.lastHeartbeatAt ? (
            <RunOverviewStatRow label={t('runLog.detail_heartbeat')} value={formatRunDate(run.lastHeartbeatAt)} />
          ) : null}
          {progress?.mode === 'determinate' ? (
            <RunOverviewStatRow
              label={t('runLog.detail_workflow_progress')}
              value={`${progress.percent ?? 0}% · ${progress.completed ?? 0}/${progress.total ?? 0}`}
            />
          ) : null}
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--dome-text-muted)' }}>
          {t('runLog.detail_section_usage')}
        </h3>
        {usage ? (
          <dl className="grid grid-cols-3 gap-2 text-[11px] min-w-0">
            {[
              { k: 'in' as const, label: t('runLog.detail_tokens_in'), v: usage.inputTokens },
              { k: 'out' as const, label: t('runLog.detail_tokens_out'), v: usage.outputTokens },
              { k: 'tot' as const, label: t('runLog.detail_tokens_total'), v: usage.totalTokens },
            ].map(({ k, label, v }) => (
              <div key={k} className="min-w-0">
                <dt style={{ color: 'var(--dome-text-muted)' }}>{label}</dt>
                <dd className="mt-0.5 tabular-nums font-medium break-all" style={{ color: 'var(--dome-text)' }}>
                  {formatIntToken(v, i18n.language)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            {t('runLog.detail_no_usage')}
          </p>
        )}
        <div className="mt-3 pt-2 border-t border-[var(--dome-border)]">
          <p className="text-xs tabular-nums" style={{ color: 'var(--dome-text)' }}>
            {t('runLog.detail_estimated_cost')}: {costLabel}
          </p>
          <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
            {t('runLog.detail_cost_disclaimer')}
          </p>
        </div>
      </section>

      {run.error ? (
        <div
          className="rounded-md border px-3 py-2 text-sm min-w-0 overflow-hidden"
          style={{
            borderColor: 'var(--error)',
            background: 'color-mix(in srgb, var(--error) 6%, transparent)',
            color: 'var(--error)',
          }}
        >
          <p className="font-medium mb-1 text-xs">{t('runLog.error_title')}</p>
          <p className="text-[11px] font-mono break-words whitespace-pre-wrap">{run.error}</p>
        </div>
      ) : null}

      {run.outputText ? (
        <section className={panelClass}>
          <h3 className="text-[11px] font-medium mb-2" style={{ color: 'var(--dome-text-muted)' }}>
            {t('runLog.response')}
          </h3>
          <div className="text-sm min-w-0 overflow-x-auto border-t border-[var(--dome-border)] pt-2 -mx-1 px-1">
            <div className="min-w-0 break-words">
              <MarkdownRenderer content={run.outputText} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ─── Run Detail Screen ────────────────────────────────────────────────────────

interface RunDetailScreenProps {
  run: PersistentRun;
  onBack: () => void;
}

function RunDetailScreen({ run, onBack }: RunDetailScreenProps) {
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
  const progress = getRunProgress(run);

  const meta = (run.metadata ?? {}) as Record<string, unknown>;
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
        trailing={<DomeStatusBadge status={run.status} />}
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
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobile: overview below list */}
          <div className="shrink-0 border-t lg:hidden" style={{ borderColor: 'var(--dome-border)' }}>
            <div className="max-h-[45vh] overflow-y-auto px-3 py-3">
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
          <div className="flex shrink-0 items-center gap-2 border-b px-2 py-2 lg:hidden" style={{ borderColor: 'var(--dome-border)' }}>
            <DomeButton
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={handleMobileBackToList}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden />
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

  const handleDelete = async (runId: string) => {
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
          <DomeDivider orientation="vertical" spacingClass="mx-0.5 h-3 self-center min-h-[12px]" />
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

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="p-4">
            <DomeSkeletonGrid count={8} />
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
            <div className="flex w-full max-w-full flex-col gap-3" role="list">
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
                  <HubBentoCard
                    key={run.id}
                    onClick={() => void handleSelectRun(run)}
                    disabled={loadingDetail === run.id}
                    icon={<HubEntityIcon kind={run.ownerType === 'agent' ? 'agent' : 'workflow'} size="md" />}
                    title={
                      <div className="flex items-start gap-2 min-w-0 flex-wrap">
                        <span
                          className="min-w-0 flex-1 break-words text-sm font-semibold"
                          style={{ color: 'var(--dome-text)' }}
                          title={run.title || run.id}
                        >
                          {run.title || run.id}
                        </span>
                        <DomeStatusBadge status={run.status} />
                      </div>
                    }
                    subtitle={
                      <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0 break-words">
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
                        <p className="text-[11px] font-medium mt-1" style={{ color: 'var(--dome-accent)' }}>
                          {progress.percent ?? 0}% · {progress.completed}/{progress.total}
                        </p>
                      ) : null
                    }
                    trailing={
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
                          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        )}
                      </DomeButton>
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
