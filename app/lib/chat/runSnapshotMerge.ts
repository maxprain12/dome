/**
 * Pure reducer for merging a persisted run snapshot (`runs:updated`) into the
 * live streaming message.
 *
 * Why this exists
 * ---------------
 * The Many streaming bubble (`streamingMessage`) is driven by TWO IPC channels at
 * the same frequency during a run:
 *   - `runs:chunk` / `runs:step`  → carry the live DELTAS (text, thinking,
 *     tool_call, tool_result, run-step cards). Handled by `useAgentRunStream`.
 *   - `runs:updated`              → carries a full DB SNAPSHOT of the run row.
 *     `patchRun` broadcasts it on EVERY chunk (heartbeat write), so it arrives as
 *     often as the deltas.
 *
 * The old `applyRunSnapshot` REBUILT the message object from the snapshot and only
 * carried `toolCalls` forward — it dropped `thinking` and `runSteps`. Because the
 * run row holds no thinking/tool deltas while `running` (tool calls are persisted
 * only at terminal), the snapshot continuously wiped the live thinking + run-step
 * timeline. The complete tool history then only re-materialized via the terminal
 * JSONL reload — the "everything appears at once when the chat reloads" symptom.
 *
 * Fix: MERGE instead of rebuild. The snapshot is authoritative only for the fields
 * it actually owns (`content`/`isStreaming`/`timestamp`); every delta-accumulated
 * field (`thinking`, `runSteps`, `toolCalls`) is preserved from `prev`.
 *
 * pi (the upstream reference vendored in packages/agent-core) renders directly from
 * a single ordered event stream with no competing snapshot channel; this merge
 * restores that single-source-of-truth behaviour for the bubble body.
 *
 * Kept as a pure function (no React, no i18n, no DOM) so it is unit-testable under
 * the repo's existing `tsx --test` / `node:test` runners without a renderer harness.
 */
import type { ChatMessageData } from '@/components/chat/ChatMessage';

export interface RunSnapshotAuthoritative {
  /** Fallback id when there is no previous streaming message yet. */
  id: string;
  /** DB-accumulated assistant text for the run so far. */
  content: string;
  /** Snapshot timestamp (run.updatedAt or now). */
  timestamp: number;
  /** Whether the run is still streaming (false only for waiting_approval). */
  isStreaming: boolean;
  /** Label to show; falls back to the previous label when not provided. */
  streamingLabel?: string;
}

/**
 * Merge a run snapshot into the previous streaming message, preserving all
 * delta-only fields (`thinking`, `runSteps`, `toolCalls`) accumulated from the
 * `runs:chunk` stream.
 */
export function mergeRunSnapshotIntoStreamingMessage(
  prev: ChatMessageData | null,
  snapshot: RunSnapshotAuthoritative,
): ChatMessageData {
  return {
    // Preserve every previously-accumulated field (thinking, runSteps, toolCalls,
    // citations, etc.). Only the fields below are overridden by the snapshot.
    ...(prev ?? {}),
    id: prev?.id || snapshot.id,
    role: 'assistant',
    content: snapshot.content,
    timestamp: snapshot.timestamp,
    isStreaming: snapshot.isStreaming,
    // Never regress to an empty tool list — the snapshot has none mid-run.
    toolCalls: prev?.toolCalls ?? [],
    streamingLabel: snapshot.streamingLabel ?? prev?.streamingLabel,
  };
}
