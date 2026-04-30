/**
 * Shared LangGraph run-subscription hook for any chat surface
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
import {
  onRunChunk,
  onRunStep,
  onRunUpdated,
  resumeRun,
  type PersistentRun,
  type PersistentRunStep,
} from '@/lib/automations/api';
import { streamingLabelForToolName } from './streamingLabels';
import { coalesceDuplicateToolCalls, applyToolResultChunk } from './coalesceToolCalls';

export interface RunPendingApproval {
  actionRequests: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
  reviewConfigs: Array<{ actionName: string; allowedDecisions: string[] }>;
  submitResume: (decisions: Array<unknown>) => void;
}

type Updater<T> = T | ((prev: T) => T);

export interface LangGraphRunStreamOptions {
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
   * i18next translator; used for streaming labels.
   */
  t: TFunction;
}

/**
 * Subscribe to a LangGraph run's events and keep `streamingMessage` up to date.
 *
 * Usage:
 *   useLangGraphRunStream({
 *     activeRunId,
 *     setStreamingMessage,
 *     setPendingApproval,
 *     onRunTerminal: (run) => refreshSessionFromDb(),
 *     t,
 *   });
 */
export function useLangGraphRunStream(options: LangGraphRunStreamOptions): void {
  const {
    activeRunId,
    setStreamingMessage,
    setPendingApproval,
    onRunStatus,
    onRunTerminal,
    t,
  } = options;

  useEffect(() => {
    if (!activeRunId) return;

    const unsubUpdated = onRunUpdated(({ run }) => {
      if (run.id !== activeRunId) return;
      onRunStatus?.(run);
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        onRunTerminal?.(run);
      }
    });

    const unsubChunk = onRunChunk((payload) => {
      if (payload.runId !== activeRunId) return;

      if (payload.type === 'text' && payload.text) {
        setStreamingMessage((prev) =>
          prev
            ? { ...prev, content: `${prev.content ?? ''}${payload.text ?? ''}` }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: payload.text ?? '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: [],
                streamingLabel: t('chat.running_background'),
              },
        );
        return;
      }

      if (payload.type === 'thinking' && payload.text) {
        setStreamingMessage((prev) =>
          prev ? { ...prev, thinking: `${prev.thinking || ''}${payload.text}` } : prev,
        );
        return;
      }

      if (payload.type === 'tool_call' && payload.toolCall) {
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
          };
          const idx = existing.findIndex((c) => c.id === tc.id);
          const nextToolCalls: ToolCallData[] =
            idx >= 0
              ? (() => {
                  const next = existing.slice();
                  next[idx] = { ...next[idx], ...entry };
                  return next;
                })()
              : [...existing, entry];
          return prev
            ? {
                ...prev,
                toolCalls: coalesceDuplicateToolCalls(nextToolCalls),
                streamingLabel: streamingLabelForToolName(tc.name, t),
              }
            : {
                id: `run-${payload.runId}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
                toolCalls: coalesceDuplicateToolCalls(nextToolCalls),
                streamingLabel: streamingLabelForToolName(tc.name, t),
              };
        });
        return;
      }

      if (payload.type === 'tool_result' && payload.toolCallId) {
        setStreamingMessage((prev) => {
          if (!prev?.toolCalls) return prev;
          return {
            ...prev,
            toolCalls: applyToolResultChunk(prev.toolCalls, String(payload.toolCallId), payload.result),
          };
        });
        return;
      }

      if (
        payload.type === 'interrupt' &&
        payload.actionRequests &&
        payload.reviewConfigs &&
        setPendingApproval
      ) {
        setPendingApproval({
          actionRequests: payload.actionRequests,
          reviewConfigs: payload.reviewConfigs,
          submitResume: (decisions) => {
            void resumeRun(payload.runId, decisions as Array<unknown>);
          },
        });
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
              streamingLabel: t('chat.running_background'),
              runSteps: nextSteps,
            };
      });
    });

    return () => {
      unsubUpdated();
      unsubChunk();
      unsubStep();
    };
  }, [activeRunId, setStreamingMessage, setPendingApproval, onRunStatus, onRunTerminal, t]);
}

function upsertRunStep(steps: PersistentRunStep[], step: PersistentRunStep): PersistentRunStep[] {
  const idx = steps.findIndex((item) => item.id === step.id);
  if (idx === -1) return [...steps, step].slice(-24);
  const next = steps.slice();
  next[idx] = step;
  return next.slice(-24);
}
