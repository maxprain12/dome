import type { TFunction } from 'i18next';

/** Mirrors `measurePrompt()` / `measurePromptDetailed()` from the main process. */
export interface BudgetBreakdown {
  systemApprox: number;
  toolsApprox: number;
  historyApprox: number;
  totalApprox: number;
  toolCount: number;
  historyTurns: number;
  systemPromptApprox?: number;
  skillsApprox?: number;
  rulesApprox?: number;
  toolsRegistryApprox?: number;
  mcpApprox?: number;
  subagentsApprox?: number;
  summarizedApprox?: number;
  conversationApprox?: number;
}

export interface LiveTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type ContextSegmentId =
  | 'systemPrompt'
  | 'toolsRegistry'
  | 'rules'
  | 'skills'
  | 'mcp'
  | 'subagents'
  | 'summarized'
  | 'conversation';

export interface ContextUsageSegment {
  id: ContextSegmentId;
  label: string;
  tokens: number;
  color: string;
}

const SEGMENT_COLORS: Record<ContextSegmentId, string> = {
  systemPrompt: 'var(--ctx-seg-system)',
  toolsRegistry: 'var(--ctx-seg-tools)',
  rules: 'var(--ctx-seg-rules)',
  skills: 'var(--ctx-seg-skills)',
  mcp: 'var(--ctx-seg-mcp)',
  subagents: 'var(--ctx-seg-subagents)',
  summarized: 'var(--ctx-seg-summarized)',
  conversation: 'var(--ctx-seg-conversation)',
};

export function formatContextTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 100_000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `${(n / 1000).toFixed(0)}K`;
}

/** Build PI-style segments from a budget snapshot (falls back when detailed fields are missing). */
export function buildContextSegments(
  breakdown: BudgetBreakdown,
  t: TFunction,
): ContextUsageSegment[] {
  const systemPrompt =
    breakdown.systemPromptApprox ??
    Math.max(0, breakdown.systemApprox - (breakdown.skillsApprox ?? 0) - (breakdown.rulesApprox ?? 0));
  const skills = breakdown.skillsApprox ?? 0;
  const rules = breakdown.rulesApprox ?? 0;
  const toolsRegistry =
    breakdown.toolsRegistryApprox ?? Math.max(0, breakdown.toolsApprox - (breakdown.mcpApprox ?? 0) - (breakdown.subagentsApprox ?? 0));
  const mcp = breakdown.mcpApprox ?? 0;
  const subagents = breakdown.subagentsApprox ?? 0;
  const summarized = breakdown.summarizedApprox ?? 0;
  const conversation = breakdown.conversationApprox ?? Math.max(0, breakdown.historyApprox - summarized);

  const rows: Array<{ id: ContextSegmentId; tokens: number }> = [
    { id: 'systemPrompt', tokens: systemPrompt },
    { id: 'toolsRegistry', tokens: toolsRegistry },
    { id: 'rules', tokens: rules },
    { id: 'skills', tokens: skills },
    { id: 'mcp', tokens: mcp },
    { id: 'subagents', tokens: subagents },
    { id: 'summarized', tokens: summarized },
    { id: 'conversation', tokens: conversation },
  ];

  return rows
    .filter((row) => row.tokens > 0)
    .map((row) => ({
      id: row.id,
      tokens: row.tokens,
      color: SEGMENT_COLORS[row.id],
      label: t(`many.context_segment_${row.id}`),
    }));
}

/** Sum of segment token counts (should track totalApprox). */
export function sumSegmentTokens(breakdown: BudgetBreakdown): number {
  const systemPrompt =
    breakdown.systemPromptApprox ??
    Math.max(0, breakdown.systemApprox - (breakdown.skillsApprox ?? 0) - (breakdown.rulesApprox ?? 0));
  const skills = breakdown.skillsApprox ?? 0;
  const rules = breakdown.rulesApprox ?? 0;
  const toolsRegistry =
    breakdown.toolsRegistryApprox ??
    Math.max(0, breakdown.toolsApprox - (breakdown.mcpApprox ?? 0) - (breakdown.subagentsApprox ?? 0));
  const mcp = breakdown.mcpApprox ?? 0;
  const subagents = breakdown.subagentsApprox ?? 0;
  const summarized = breakdown.summarizedApprox ?? 0;
  const conversation = breakdown.conversationApprox ?? Math.max(0, breakdown.historyApprox - summarized);
  return (
    systemPrompt +
    toolsRegistry +
    rules +
    skills +
    mcp +
    subagents +
    summarized +
    conversation
  );
}

/**
 * Context tokens used for % and header — PI-aligned with `estimateContextTokens`:
 * segment estimate is authoritative; provider `inputTokens` alone must not under-report
 * (it omits static system/tools on many providers and can be stale between runs).
 */
export function contextUsedTokens(
  breakdown: BudgetBreakdown,
  liveUsage?: LiveTokenUsage | null,
): number {
  const fromSegments = sumSegmentTokens(breakdown);
  const estimated = Math.max(breakdown.totalApprox ?? 0, fromSegments);
  if (!liveUsage) return estimated;
  const liveIn = liveUsage.inputTokens ?? 0;
  if (liveIn <= 0) return estimated;
  return Math.max(estimated, liveIn);
}

export function contextUsagePercent(used: number, cap: number): number {
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

/** Fallback estimate when the run has not emitted a `budget` chunk yet. */
export function estimateClientBudgetFromChat(options: {
  messages: Array<{ role?: string; content?: string }>;
  toolCount?: number;
  userMemoryChars?: number;
  mcpToolCount?: number;
}): BudgetBreakdown {
  const { messages, toolCount = 0, userMemoryChars = 0, mcpToolCount = 0 } = options;
  let conversationChars = 0;
  for (const m of messages) {
    if (!m?.content) continue;
    conversationChars += m.content.length;
  }
  const conversationApprox = Math.max(1, Math.ceil(conversationChars / 4));
  const rulesApprox = userMemoryChars > 0 ? Math.ceil(userMemoryChars / 4) : 0;
  const systemPromptApprox = 6_500;
  const skillsApprox = 800;
  const toolsRegistryApprox = Math.max(0, toolCount - mcpToolCount) * 350;
  const mcpApprox = mcpToolCount * 450;
  const systemApprox = systemPromptApprox + skillsApprox + rulesApprox;
  const toolsApprox = toolsRegistryApprox + mcpApprox;
  const totalApprox = systemApprox + toolsApprox + conversationApprox;

  return {
    systemApprox,
    toolsApprox,
    historyApprox: conversationApprox,
    totalApprox,
    toolCount,
    historyTurns: messages.filter((m) => m.role === 'user' || m.role === 'assistant').length,
    systemPromptApprox,
    skillsApprox,
    rulesApprox,
    toolsRegistryApprox,
    mcpApprox,
    subagentsApprox: 0,
    summarizedApprox: 0,
    conversationApprox,
  };
}
