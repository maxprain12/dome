/**
 * Shared the agent runtime run-subscription hook for any chat surface
 * (Many, Agent chat, Agent Team...).
 *
 * Centralizes the duplicated chunk / run-update handling that used to live
 * inline in `ManyPanel` and `AgentChatView`. Callers still own the higher
 * level state (messages list, session hydration, auto-speak, etc.), but the
 * tedious cases (text, thinking, tool_call, tool_result, interrupt) are
 * resolved here against a small store-shaped interface.
 */

import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import type { ChatMessageData } from '@/components/chat/ChatMessage';
import type { ToolCallData } from '@/components/chat/ChatToolCard';
import type { BudgetBreakdown } from '@/lib/chat/contextUsage';
import {
  getRun,
  onRunChunk,
  onRunStep,
  onRunUpdated,
  resumeRun,
  type PersistentRun,
  type PersistentRunStep,
  type PersistentRunUsage,
  type RunChunkPayload,
} from '@/lib/automations/api';
import { streamingLabelForActiveRun, streamingLabelForToolCall } from './streamingLabels';
import { coalesceDuplicateToolCalls, applyToolResultChunk } from './coalesceToolCalls';

export interface RunPendingApproval {
  actionRequests: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
  reviewConfigs: Array<{ actionName: string; allowedDecisions: string[] }>;
  submitResume: (decisions: Array<unknown>) => void;
}

type Updater<T> = T | ((prev: T) => T);

export interface AgentRunStreamOptions {
  /** Current run to subscribe to. When null the hook is a no-op. */
  activeRunId: string | null;
  /** Updates the streaming assistant bubble. */
  setStreamingMessage: (updater: Updater<ChatMessageData | null>) => void;
  /** HITL approval handler (called with the new pending approval or null). */
  setPendingApproval?: (approval: RunPendingApproval | null) => void;
  /** Called for every run update (including terminal ones). */
  onRunStatus?: (run: PersistentRun) => void;
  /**
   * Called once when the run transitions to a terminal status.
   * Use this to hydrate the session from DB / persist the final message.
   */
  onRunTerminal?: (run: PersistentRun) => void;
  /**
   * Called when the first chunk of a run emits a token budget breakdown.
   */
  onBudget?: (breakdown: BudgetBreakdown) => void;
  /**
   * Called when the session is auto-compacted or manually compacted mid-run.
   */
  onCompaction?: (event: {
    tokensBefore: number;
    tokensAfter: number | null;
    summaryPreview: string;
    automatic: boolean;
  }) => void;
  /**
   * Provider-reported token usage (partial chunks may arrive during the run).
   */
  onUsage?: (usage: PersistentRunUsage, partial: boolean) => void;
  /**
   * Called when the run emits visible content (text or tool activity).
   */
  onStreamingActivity?: () => void;
  /**
   * i18next translator; used for streaming labels.
   */
  t: TFunction;
}

/**
 * Subscribe to a the agent runtime run's events and keep `streamingMessage` up to date.
 *
 * Usage:
 *   useAgentRunStream({
 *     activeRunId,
 *     setStreamingMessage,
 *     setPendingApproval,
 *     onRunTerminal: (run) => refreshSessionFromDb(),
 *     t,
 *   });
 */
export function useAgentRunStream(options: AgentRunStreamOptions): void {
  const {
    activeRunId,
    setStreamingMessage,
    setPendingApproval,
    onRunStatus,
    onRunTerminal,
    onBudget,
    onUsage,
    onCompaction,
    onStreamingActivity,
    t,
  } = options;

  useEffect(() => {
    if (!activeRunId) return;

    let cancelled = false;
    let terminalHandled = false;

    const handleRunUpdate = (run: PersistentRun) => {
      if (cancelled || run.id !== activeRunId) return;
      onRunStatus?.(run);
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        if (terminalHandled) return;
        terminalHandled = true;
        onRunTerminal?.(run);
      }
    };

    void getRun(activeRunId)
      .then((run) => {
        if (run) handleRunUpdate(run);
      })
      .catch((error) => {
        console.warn('[AgentRunStream] Could not load run snapshot:', error);
      });

    const unsubUpdated = onRunUpdated(({ run }) => {
      handleRunUpdate(run);
    });

    const ctx: ChunkContext = {
      activeRunId,
      t,
      setStreamingMessage,
      onBudget,
      onCompaction,
      onUsage,
      onStreamingActivity,
      setPendingApproval,
    };

    const unsubChunk = onRunChunk((payload) => {
      if (payload.runId !== activeRunId) return;
      handleRunChunk(ctx, payload);
    });

    const unsubStep = onRunStep(({ step }) => {
      if (step.runId !== activeRunId) return;
      setStreamingMessage((prev) => {
        const existingSteps = prev?.runSteps ?? [];
        const nextSteps = upsertRunStep(existingSteps, step);
        return prev
          ? { ...prev, runSteps: nextSteps }
          : {
              id: `run-${activeRunId}`,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
              toolCalls: [],
              streamingLabel: streamingLabelForActiveRun(t, { reconnecting: true }),
              runSteps: nextSteps,
            };
      });
    });

    return () => {
      cancelled = true;
      unsubUpdated();
      unsubChunk();
      unsubStep();
    };
  }, [activeRunId, setStreamingMessage, setPendingApproval, onRunStatus, onRunTerminal, onBudget, onUsage, onCompaction, onStreamingActivity, t]);
}

function upsertRunStep(steps: PersistentRunStep[], step: PersistentRunStep): PersistentRunStep[] {
  const idx = steps.findIndex((item) => item.id === step.id);
  if (idx === -1) return [...steps, step].slice(-24);
  const next = steps.slice();
  next[idx] = step;
  return next.slice(-24);
}

interface ChunkContext {
  activeRunId: string;
  t: TFunction;
  setStreamingMessage: (updater: Updater<ChatMessageData | null>) => void;
  onBudget?: (breakdown: import('@/lib/automations/api').RunChunkBudgetBreakdown) => void;
  onCompaction?: AgentRunStreamOptions['onCompaction'];
  onUsage?: (usage: PersistentRunUsage, partial: boolean) => void;
  onStreamingActivity?: () => void;
  setPendingApproval?: (approval: RunPendingApproval | null) => void;
}

function handleRunChunk(ctx: ChunkContext, payload: RunChunkPayload): void {
  switch (payload.type) {
    case 'phase':
      handlePhaseChunk(ctx, payload);
      return;
    case 'tool_progress':
      handleToolProgressChunk(ctx, payload);
      return;
    case 'budget':
      handleBudgetChunk(ctx, payload);
      return;
    case 'compaction':
      handleCompactionChunk(ctx, payload);
      return;
    case 'usage':
      handleUsageChunk(ctx, payload);
      return;
    case 'text':
      handleTextChunk(ctx, payload);
      return;
    case 'thinking':
      handleThinkingChunk(ctx, payload);
      return;
    case 'tool_call':
      handleToolCallChunk(ctx, payload);
      return;
    case 'tool_result':
      handleToolResultChunk(ctx, payload);
      return;
    case 'interrupt':
      handleInterruptChunk(ctx, payload);
      return;
    default:
      return;
  }
}

function newStreamingAssistantMessage(
  runId: string,
  content: string,
  streamingLabel: string,
  extras?: Partial<ChatMessageData>,
): ChatMessageData {
  return {
    id: `run-${runId}`,
    role: 'assistant',
    content,
    timestamp: Date.now(),
    isStreaming: true,
    toolCalls: [],
    streamingLabel,
    ...(extras ?? {}),
  };
}

function handlePhaseChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'phase' }>,
): void {
  const label = payload.labelKey
    ? ctx.t(payload.labelKey)
    : payload.detail
      ? streamingLabelForToolCall({ name: payload.detail, arguments: {} }, ctx.t)
      : ctx.t('chat.processing');
  ctx.setStreamingMessage((prev) =>
    prev
      ? { ...prev, streamingLabel: label }
      : newStreamingAssistantMessage(payload.runId, '', label),
  );
}

function handleToolProgressChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'tool_progress' }>,
): void {
  if (!payload.toolCallId) return;
  const label = payload.toolName
    ? streamingLabelForToolCall({ name: payload.toolName, arguments: {} }, ctx.t)
    : ctx.t('chat.tool_running');
  ctx.setStreamingMessage((prev) =>
    prev ? { ...prev, streamingLabel: label } : prev,
  );
}

function handleBudgetChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'budget' }>,
): void {
  if (!payload.breakdown || !ctx.onBudget) return;
  ctx.onBudget(payload.breakdown);
}

function handleCompactionChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'compaction' }>,
): void {
  ctx.onCompaction?.({
    tokensBefore: payload.tokensBefore,
    tokensAfter: payload.tokensAfter,
    summaryPreview: payload.summaryPreview,
    automatic: payload.automatic,
  });
  ctx.setStreamingMessage((prev) =>
    prev ? { ...prev, streamingLabel: ctx.t('chat.compacting_context') } : prev,
  );
}

function handleUsageChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'usage' }>,
): void {
  if (!payload.usage || !ctx.onUsage) return;
  ctx.onUsage(payload.usage, !!payload.partial);
}

function handleTextChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'text' }>,
): void {
  if (!payload.text) return;
  ctx.onStreamingActivity?.();
  const label = ctx.t('chat.generating_response');
  ctx.setStreamingMessage((prev) =>
    prev
      ? {
          ...prev,
          content: `${prev.content ?? ''}${payload.text ?? ''}`,
          streamingLabel: label,
        }
      : newStreamingAssistantMessage(payload.runId, payload.text ?? '', label),
  );
}

function handleThinkingChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'thinking' }>,
): void {
  if (!payload.text) return;
  const label = ctx.t('chat.thinking');
  ctx.setStreamingMessage((prev) =>
    prev
      ? {
          ...prev,
          thinking: `${prev.thinking || ''}${payload.text}`,
          streamingLabel: prev.content?.trim() ? prev.streamingLabel : label,
        }
      : newStreamingAssistantMessage(payload.runId, '', label, { thinking: payload.text }),
  );
}

function handleToolCallChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'tool_call' }>,
): void {
  if (!payload.toolCall) return;
  ctx.onStreamingActivity?.();
  const tc = payload.toolCall;
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : {};
  } catch {
    parsedArgs = {};
  }
  ctx.setStreamingMessage((prev) =>
    applyToolCallUpdate(
      prev,
      payload.runId,
      payload.agentName,
      parsedArgs,
      tc,
      ctx.t,
    ),
  );
}

function handleToolResultChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'tool_result' }>,
): void {
  if (!payload.toolCallId) return;
  ctx.setStreamingMessage((prev) => {
    if (!prev?.toolCalls) return prev;
    return {
      ...prev,
      toolCalls: applyToolResultChunk(
        prev.toolCalls,
        String(payload.toolCallId),
        payload.result,
        payload.isError === true,
      ),
    };
  });
}

function handleInterruptChunk(
  ctx: ChunkContext,
  payload: Extract<RunChunkPayload, { type: 'interrupt' }>,
): void {
  if (
    !Array.isArray(payload.actionRequests) ||
    payload.actionRequests.length === 0 ||
    !ctx.setPendingApproval
  ) {
    return;
  }
  ctx.setPendingApproval({
    actionRequests: payload.actionRequests,
    reviewConfigs: Array.isArray(payload.reviewConfigs) ? payload.reviewConfigs : [],
    submitResume: (decisions) => {
      void resumeRun(payload.runId, decisions as Array<unknown>);
    },
  });
  ctx.setStreamingMessage((prev) =>
    prev
      ? { ...prev, streamingLabel: ctx.t('chat.waiting_approval'), isStreaming: false }
      : prev,
  );
}

function applyToolCallUpdate(
  prev: ChatMessageData | null,
  runId: string,
  agentName: string | undefined,
  parsedArgs: Record<string, unknown>,
  tc: { id: string; name: string },
  t: TFunction,
): ChatMessageData {
  const existing = prev?.toolCalls ?? [];
  const entry: ToolCallData = {
    id: tc.id,
    name: tc.name,
    arguments: parsedArgs,
    status: 'running' as ToolCallData['status'],
    ...(agentName ? { agentName } : {}),
  };
  const idx = existing.findIndex((c) => c.id === tc.id);
  const mergeIntoExisting = (
    list: ToolCallData[],
    targetIdx: number,
    patch: ToolCallData,
  ): ToolCallData[] => {
    const next = list.slice();
    next[targetIdx] = { ...next[targetIdx], ...patch };
    return next;
  };
  const nextToolCalls: ToolCallData[] =
    idx >= 0
      ? mergeIntoExisting(existing, idx, entry)
      : [...existing, entry];
  return prev
    ? {
        ...prev,
        toolCalls: coalesceDuplicateToolCalls(nextToolCalls),
        streamingLabel: streamingLabelForToolCall(
          { name: tc.name, arguments: parsedArgs, agentName },
          t,
        ),
      }
    : {
        id: `run-${runId}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        toolCalls: coalesceDuplicateToolCalls(nextToolCalls),
        streamingLabel: streamingLabelForToolCall(
          { name: tc.name, arguments: parsedArgs, agentName },
          t,
        ),
      };
}
