/**
 * @dome/agent-core — creation/mutation tool caps hook (Tarea 5).
 *
 * Port of `CREATION_TOOL_CAPS` + `createDomeToolCallCapsMiddleware` from
 * `electron/agent-middleware.cjs` (lines 14-38, 421-468). Caps the number of
 * times a creation/mutation tool may run within a single conversation by
 * counting prior invocations in the message history. When the cap is
 * exceeded the call is blocked with an error result — the run CONTINUES
 * (equivalent to the legacy `exitBehavior: 'continue'`), it is not aborted.
 *
 * Shape: a `beforeToolCall` hook (the legacy used `wrapToolCall`, the same
 * boundary). Counting prior invocations from `state.messages` mirrors
 * `countToolCallsInMessages`.
 */

import type { AgentHooks, AgentMessage } from '../types.js';

/** Per-conversation caps for creation/mutation tools. Ported 1:1. */
export const CREATION_TOOL_CAPS: Readonly<Record<string, number>> = {
  resource_create: 20,
  resource_update: 30,
  resource_delete: 20,
  artifact_create: 15,
  artifact_update_state: 50,
  artifact_merge_data: 40,
  artifact_delete: 15,
  ppt_create: 8,
  flashcard_create: 8,
  generate_quiz: 5,
  generate_mindmap: 5,
  generate_guide: 5,
  generate_faq: 5,
  generate_timeline: 5,
  generate_table: 5,
  generate_audio_overview: 5,
  generate_video_overview: 5,
  notebook_add_cell: 50,
  pdf_annotation_create: 50,
  link_resources: 40,
};

/**
 * Count how many times `toolName` was already requested across the assistant
 * messages in history. An assistant message in the Dome wire format carries
 * its tool calls on `toolCalls` (`[{ id, name, arguments }]`).
 */
export function countToolCalls(messages: AgentMessage[], toolName: string): number {
  if (!Array.isArray(messages) || !toolName) return 0;
  let count = 0;
  for (const message of messages) {
    const toolCalls = (message as { toolCalls?: Array<{ name?: string }> }).toolCalls;
    if (!Array.isArray(toolCalls)) continue;
    for (const call of toolCalls) {
      if (call?.name === toolName) count += 1;
    }
  }
  return count;
}

/**
 * Build the caps `beforeToolCall` hook. Pass custom `caps` to override the
 * defaults (merged over `CREATION_TOOL_CAPS`).
 */
export function createCapsHook(
  caps: Record<string, number> = {},
): Pick<AgentHooks, 'beforeToolCall'> {
  const limits: Record<string, number> = { ...CREATION_TOOL_CAPS, ...caps };
  return {
    async beforeToolCall(ctx) {
      const runLimit = limits[ctx.call.name];
      if (typeof runLimit !== 'number' || runLimit <= 0) return undefined;
      // Count prior invocations; the current call is the (priorCount + 1)-th.
      // Legacy blocks when priorCount > runLimit (i.e. strictly more than the
      // cap have already run). Preserve that exact boundary.
      const priorCount = countToolCalls(ctx.state.messages, ctx.call.name);
      if (priorCount <= runLimit) return undefined;
      return {
        block: true,
        reason:
          `Error: tool "${ctx.call.name}" reached its run limit (${runLimit} invocations). ` +
          'The agent will continue without executing this call.',
      };
    },
  };
}
