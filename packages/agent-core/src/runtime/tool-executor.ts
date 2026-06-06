/**
 * @dome/agent-core — tool executor (Tarea 6).
 *
 * Runs the tool calls emitted in one assistant turn, applying the
 * `beforeToolCall` / `afterToolCall` hooks around each call. This is the
 * orchestration layer; the actual tool work lives in each `AgentTool`'s
 * `execute` (in Phase 2 those bridge to `electron/tool-dispatcher.cjs` via
 * `ctx.executeToolInMain`; in Phase 3 they move into `@dome/tools`).
 *
 * Hook contract (matches `types.ts`):
 *   - `beforeToolCall` may return `{ block: true, reason }` → the tool is
 *     NOT executed; the result is an error carrying `reason`.
 *   - `afterToolCall` may return a partial result to merge (replacing
 *     `text`/`details`/`error`) and/or `{ terminate: true }` to signal the
 *     loop should stop after this batch.
 *
 * Errors never throw out of here: a thrown tool, a missing tool, or a
 * blocked tool all become `{ error }` results so the model sees a tool
 * error message and the loop keeps a stable shape (R-stability).
 *
 * Execution modes:
 *   - `'sequential'` (default): each call's full before→exec→after cycle
 *     completes before the next starts.
 *   - `'parallel'`: all calls run concurrently; results are returned in
 *     the original call order so message ordering is deterministic.
 */

import type {
  AgentEvent,
  AgentHooks,
  AgentState,
  AgentTool,
  AgentToolCall,
  AgentToolResult,
  ToolContext,
  ToolExecutionMode,
} from '../types.js';

/** A finalized tool call + its result, in original call order. */
export interface ExecutedToolCall {
  call: AgentToolCall;
  result: AgentToolResult;
}

export interface ExecuteToolCallsOptions {
  tools: AgentTool[];
  hooks?: AgentHooks;
  mode?: ToolExecutionMode;
  /** Build the `ToolContext` for a given call (threadId, signal, depth, bridge). */
  makeContext: (call: AgentToolCall) => ToolContext;
  /** Current state — passed to `beforeToolCall` for guardrail decisions. */
  state: AgentState;
  threadId: string;
  recursionDepth: number;
  /** Forward `tool_call` is already emitted by the parser; we emit `tool_result`. */
  emit: (event: AgentEvent) => void;
}

/**
 * Execute every call in `calls`, returning results in original order.
 */
export async function executeToolCalls(
  calls: AgentToolCall[],
  opts: ExecuteToolCallsOptions,
): Promise<ExecutedToolCall[]> {
  const mode = opts.mode ?? 'sequential';

  if (mode === 'parallel') {
    // Prepare all promises first, then await — results preserve order via
    // index. Tool-result events are emitted as each settles (completion
    // order) but the returned array (and therefore message order) is the
    // original call order.
    const settled = await Promise.all(
      calls.map((call) => executeOne(call, opts)),
    );
    return settled;
  }

  // Sequential.
  const results: ExecutedToolCall[] = [];
  for (const call of calls) {
    results.push(await executeOne(call, opts));
  }
  return results;
}

/** Run the full before → execute → after cycle for a single tool call. */
async function executeOne(
  call: AgentToolCall,
  opts: ExecuteToolCallsOptions,
): Promise<ExecutedToolCall> {
  const { hooks, tools, state, threadId, recursionDepth, emit } = opts;
  const startedAt = Date.now();

  // 1. beforeToolCall — guardrails / HITL / caps may block.
  if (hooks?.beforeToolCall) {
    const decision = await hooks.beforeToolCall({
      call,
      threadId,
      recursionDepth,
      state,
    });
    if (decision && decision.block) {
      const result: AgentToolResult = {
        text: decision.reason ?? `Tool "${call.name}" was blocked.`,
        error: decision.reason ?? 'blocked',
      };
      emit({ type: 'tool_result', callId: call.id, name: call.name, output: result });
      return { call, result };
    }
  }

  // 2. Execute (never throws out — failures become error results).
  let result = await runTool(call, tools, opts.makeContext);

  // 3. afterToolCall — tracing / mutation / termination.
  if (hooks?.afterToolCall) {
    const patch = await hooks.afterToolCall({
      call,
      threadId,
      recursionDepth,
      state,
      result,
      durationMs: Date.now() - startedAt,
    });
    if (patch) {
      result = {
        ...result,
        ...(patch.text !== undefined ? { text: patch.text } : {}),
        ...(patch.details !== undefined ? { details: patch.details } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.terminate !== undefined ? { terminate: patch.terminate } : {}),
      };
    }
  }

  emit({ type: 'tool_result', callId: call.id, name: call.name, output: result });
  return { call, result };
}

/** Find the tool by name and execute it, converting any throw to an error result. */
async function runTool(
  call: AgentToolCall,
  tools: AgentTool[],
  makeContext: (call: AgentToolCall) => ToolContext,
): Promise<AgentToolResult> {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    return {
      text: `Tool "${call.name}" is not available.`,
      error: 'tool_not_found',
    };
  }
  try {
    const ctx = makeContext(call);
    if (ctx.signal?.aborted) {
      return { text: 'Run aborted before tool execution.', error: 'aborted' };
    }
    return await tool.execute(call.arguments, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: `Tool "${call.name}" failed: ${message}`, error: message };
  }
}
