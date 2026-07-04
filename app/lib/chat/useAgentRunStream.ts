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

    const unsubChunk = onRunChunk((payload) => {
      if (payload.runId !== activeRunId) return;

      if (payload.type === 'phase') {
        const label = payload.labelKey
          ? t(payload.labelKey)
          : payload.detail
            ? streamingLabelForToolCall({ name: payload.detail, arguments: {} }, t)
            : t('chat.processing');
        setStreamingMessage((prev) =>
          prev
            ? { ...prev, streamingLabel: label }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: [],
                streamingLabel: label,
              },
        );
        return;
      }

      if (payload.type === 'tool_progress' && payload.toolCallId) {
        const label = payload.toolName
          ? streamingLabelForToolCall({ name: payload.toolName, arguments: {} }, t)
          : t('chat.tool_running');
        setStreamingMessage((prev) =>
          prev ? { ...prev, streamingLabel: label } : prev,
        );
        return;
      }

      if (payload.type === 'budget' && payload.breakdown && onBudget) {
        onBudget(payload.breakdown);
        return;
      }

      if (payload.type === 'compaction') {
        if (onCompaction) {
          onCompaction({
            tokensBefore: payload.tokensBefore,
            tokensAfter: payload.tokensAfter,
            summaryPreview: payload.summaryPreview,
            automatic: payload.automatic,
          });
        }
        setStreamingMessage((prev) =>
          prev ? { ...prev, streamingLabel: t('chat.compacting_context') } : prev,
        );
        return;
      }

      if (payload.type === 'usage' && payload.usage && onUsage) {
        onUsage(payload.usage, !!payload.partial);
        return;
      }

      if (payload.type === 'text' && payload.text) {
        onStreamingActivity?.();
        setStreamingMessage((prev) =>
          prev
            ? {
                ...prev,
                content: `${prev.content ?? ''}${payload.text ?? ''}`,
                streamingLabel: t('chat.generating_response'),
              }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: payload.text ?? '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: [],
                streamingLabel: t('chat.generating_response'),
              },
        );
        return;
      }

      if (payload.type === 'thinking' && payload.text) {
        setStreamingMessage((prev) =>
          prev
            ? {
                ...prev,
                thinking: `${prev.thinking || ''}${payload.text}`,
                streamingLabel: prev.content?.trim()
                  ? prev.streamingLabel
                  : t('chat.thinking'),
              }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: [],
                thinking: payload.text,
                streamingLabel: t('chat.thinking'),
              },
        );
        return;
      }

      if (payload.type === 'tool_call' && payload.toolCall) {
        onStreamingActivity?.();
        const tc = payload.toolCall;
        const parsedArgs = (() => {
          try {
            return typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : {};
          } catch {
            return {};
          }
        })();
        setStreamingMessage((prev) => {
          const existing = prev?.toolCalls ?? [];
          const entry: ToolCallData = {
            id: tc.id,
            name: tc.name,
            arguments: parsedArgs,
            status: 'running' as ToolCallData['status'],
            ...(payload.agentName ? { agentName: payload.agentName } : {}),
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
                  { name: tc.name, arguments: parsedArgs, agentName: payload.agentName },
                  t,
                ),
              }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: coalesceDuplicateToolCalls(nextToolCalls),
                streamingLabel: streamingLabelForToolCall(
                  { name: tc.name, arguments: parsedArgs, agentName: payload.agentName },
                  t,
                ),
              };
        });
        return;
      }

      if (payload.type === 'tool_result' && payload.toolCallId) {
        setStreamingMessage((prev) => {
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
        return;
      }

      if (
        payload.type === 'interrupt' &&
        Array.isArray(payload.actionRequests) &&
        payload.actionRequests.length > 0 &&
        setPendingApproval
      ) {
        setPendingApproval({
          actionRequests: payload.actionRequests,
          reviewConfigs: Array.isArray(payload.reviewConfigs) ? payload.reviewConfigs : [],
          submitResume: (decisions) => {
            void resumeRun(payload.runId, decisions as Array<unknown>);
          },
        });
        setStreamingMessage((prev) =>
          prev
            ? { ...prev, streamingLabel: t('chat.waiting_approval'), isStreaming: false }
            : prev,
        );
      }
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
