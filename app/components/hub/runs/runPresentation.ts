/**
 * Run presentation helpers (03/T02 — extracted from RunsWorkspaceView.tsx):
 * step parsing, visual kinds, workflow grouping, transcript rows, formats.
 * Pure functions/types — no React state.
 */

import type { PersistentRun, PersistentRunStep } from '@/lib/automations/api';
import i18n, { getDateTimeLocaleTag } from '@/lib/i18n';

export function formatHubDate(ts: number | undefined | null, neverLabel: string) {
  if (!ts) return neverLabel;
  return new Date(ts).toLocaleString(getDateTimeLocaleTag(), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatIntToken(n: number, locale: string) {
  return new Intl.NumberFormat(locale).format(n);
}


export type StepVisualKind = 'tool' | 'message' | 'thinking' | 'error' | 'agent' | 'other';

export function parseStepContentJson(raw: unknown): unknown {
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

export function getStepVisualKind(step: PersistentRunStep): StepVisualKind {
  if (step.stepType === 'error' || step.status === 'failed' || step.status === 'error') return 'error';
  if (step.stepType === 'workflow_agent') return 'agent';
  if (step.stepType === 'tool_call' || step.stepType === 'tool') return 'tool';
  if (step.stepType === 'thinking') return 'thinking';
  if (step.stepType === 'message' || step.stepType === 'output') return 'message';
  return 'other';
}

/** Muted accent for timelines / status (minimal UI). */
export function getStepAccent(step: PersistentRunStep): string {
  const k = getStepVisualKind(step);
  if (k === 'error') return 'var(--error)';
  return 'color-mix(in srgb, var(--dome-text) 26%, var(--dome-border))';
}

export function getStepBadgeLabel(
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

export function getToolDisplayTitle(step: PersistentRunStep): string {
  if (step.stepType !== 'tool_call' && step.stepType !== 'tool') {
    return step.title || step.stepType;
  }
  const name = step.title || '';
  const key = `runLog.tools.${name}`;
  const translated = i18n.t(key);
  if (translated !== key) return translated;
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || name;
}

export function getStepListSummary(step: PersistentRunStep): string {
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

export function getToolArgs(step: PersistentRunStep): Record<string, unknown> {
  const meta = step.metadata || {};
  if (meta.arguments && typeof meta.arguments === 'object') {
    return meta.arguments as Record<string, unknown>;
  }
  if (meta.args && typeof meta.args === 'object') {
    return meta.args as Record<string, unknown>;
  }
  return {};
}

export function isWorkflowRun(run: PersistentRun): boolean {
  if (run.ownerType === 'workflow') return true;
  const kind = run.metadata && (run.metadata as Record<string, unknown>).kind;
  return kind === 'workflow';
}

export function findWorkflowAgentAncestor(
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
export function extractWorkflowToolShortName(step: PersistentRunStep): string {
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

export interface WorkflowStepGroup {
  key: string;
  label: string;
  sectionKind: 'agent' | 'node' | 'output' | 'completion' | 'error' | 'other';
  steps: PersistentRunStep[];
}

export interface WorkflowSectionMeta {
  key: string;
  label: string;
  sectionKind: WorkflowStepGroup['sectionKind'];
}

export function resolveWorkflowSectionMeta(
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

export function buildWorkflowStepGroups(
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

export type TranscriptRow = { type: 'header'; groupKey: string } | { type: 'step'; step: PersistentRunStep };

export function buildTranscriptRows(
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

export const AGENT_LANE_PALETTE = [
  'color-mix(in srgb, var(--dome-text) 34%, var(--dome-border))',
  'color-mix(in srgb, var(--dome-text) 22%, var(--dome-border))',
  'color-mix(in srgb, var(--dome-text) 44%, var(--dome-border))',
  'color-mix(in srgb, var(--dome-accent) 24%, var(--dome-border))',
  'color-mix(in srgb, var(--dome-text) 16%, var(--dome-border))',
];

export function getOverviewSegmentColor(
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


export function formatSessionClock(createdAt: number, runStart: number): string {
  const sec = Math.max(0, Math.floor((createdAt - runStart) / 1000));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function getStepDurationSec(
  step: PersistentRunStep,
  nextStep: PersistentRunStep | undefined,
  runEndAt: number,
): number {
  const end = nextStep?.createdAt ?? step.updatedAt ?? runEndAt;
  return Math.max(0, Math.round((end - step.createdAt) / 1000));
}

export function getStepUsageShort(step: PersistentRunStep, locale: string): string | null {
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

