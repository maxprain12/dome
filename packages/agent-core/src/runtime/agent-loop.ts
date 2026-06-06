/**
 * @dome/agent-core — the runtime loop (Tarea 8).
 *
 * `runAgentLoop` is the Dome-native replacement for LangGraph's
 * `StateGraph` / deepagents. It drives one run to completion: stream an
 * assistant turn, execute any tool calls (with hooks), append results,
 * compact if needed, and repeat until the model stops calling tools or the
 * recursion limit is hit. It emits the same chunk vocabulary the legacy
 * `invokeLangGraphAgent` emits so the IPC consumer is unchanged.
 *
 * ⚠️ Naming: this is the *runtime loop*. It is NOT a "harness" — the word
 * "harness" already means the deepagents filesystem backend in Dome
 * (`electron/harness-backend.cjs`). Do not rename this to harness.
 *
 * The model call is injected via `config.streamFn` so the loop is fully
 * testable without a live LLM and decoupled from `@dome/ai`'s runtime.
 */

import type {
  AgentConfig,
  AgentEvent,
  AgentMessage,
  AgentState,
  AgentToolCall,
  RunOptions,
  ToolContext,
} from '../types.js';
import { parseModelStream } from './stream-parser.js';
import { executeToolCalls, type ExecutedToolCall } from './tool-executor.js';
import {
  toAssistantAgentMessage,
  toToolResultMessage,
  toUserMessage,
} from './message-utils.js';

const DEFAULT_RECURSION_LIMIT = 25;

/** Resolve the recursion cap: env override → config → default. */
function resolveRecursionLimit(config: AgentConfig): number {
  const fromEnv = Number(process.env.DOME_RECURSION_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  if (config.recursionLimit && config.recursionLimit > 0) return config.recursionLimit;
  return DEFAULT_RECURSION_LIMIT;
}

function genThreadId(): string {
  return `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a tool-result message the next turn will read.
 */
function toToolResultFromExecuted(executed: ExecutedToolCall): AgentMessage {
  return toToolResultMessage(executed.call, executed.result.text, !!executed.result.error);
}

/**
 * Run the agent loop, yielding `AgentEvent`s in order. The caller's
 * `state` is not mutated — we clone `messages` up front.
 */
export async function* runAgentLoop(
  state: AgentState,
  config: AgentConfig,
  run: RunOptions = {},
): AsyncGenerator<AgentEvent, void, unknown> {
  if (!config.streamFn) {
    yield {
      type: 'error',
      error:
        '@dome/agent-core: runAgentLoop requires config.streamFn (the model-call boundary).',
    };
    yield { type: 'done' };
    return;
  }

  const streamFn = config.streamFn;
  const recursionLimit = resolveRecursionLimit(config);
  const threadId = run.threadId ?? genThreadId();
  const signal = run.signal ?? config.signal;

  // Work on a copy so the caller's array is never mutated.
  let working: AgentState = { ...state, messages: [...state.messages] };

  yield { type: 'turn_start' };

  for (let depth = 0; depth < recursionLimit; depth += 1) {
    if (signal?.aborted) {
      yield { type: 'error', error: 'aborted' };
      yield { type: 'done' };
      return;
    }

    // 0. Guardrails / content moderation before the model sees the messages.
    //    A block ends the run with the reason as the assistant message
    //    (faithful to the legacy guardrails returning an AIMessage(reason)).
    if (config.hooks?.beforeModelCall) {
      const decision = await config.hooks.beforeModelCall({
        state: working,
        threadId,
        recursionDepth: depth,
      });
      if (decision && decision.block) {
        const reason = decision.reason ?? 'Request blocked.';
        const blockedMsg = { text: reason, usage: null as import('@dome/ai').Usage | null };
        yield { type: 'text_delta', text: reason };
        working.messages.push(toAssistantAgentMessage(reason, []));
        await config.session?.append(threadId, working.messages[working.messages.length - 1]!);
        yield { type: 'turn_end', message: blockedMsg };
        yield { type: 'done', finalMessage: blockedMsg };
        return;
      }
    }

    // 1. Stream one assistant turn. Buffer the parser's events so we can
    //    forward them in order (the parser's `emit` is synchronous).
    const buffered: AgentEvent[] = [];
    const parsed = await parseModelStream(
      streamFn({
        systemPrompt: working.systemPrompt,
        messages: working.messages,
        tools: working.tools,
        model: working.model,
        thinkingLevel: working.thinkingLevel,
        signal,
      }),
      (e) => buffered.push(e),
    );
    for (const e of buffered) yield e;

    // 2. Persist + record the assistant message.
    const assistantMsg = toAssistantAgentMessage(parsed.text, parsed.toolCalls);
    working.messages.push(assistantMsg);
    await config.session?.append(threadId, assistantMsg);
    yield { type: 'turn_end', message: parsed.message };

    // 3. Hard error from the model → end the run.
    if (parsed.error) {
      yield { type: 'done', finalMessage: parsed.message };
      return;
    }

    // 4. No tool calls → final answer. Optional `shouldStopAfterTurn` is
    //    moot here (the model already stopped), so just finish.
    if (parsed.toolCalls.length === 0) {
      yield { type: 'done', finalMessage: parsed.message };
      return;
    }

    // 5. Execute the tool calls with hooks.
    const toolEvents: AgentEvent[] = [];
    const makeContext = (call: AgentToolCall): ToolContext => ({
      threadId,
      signal: signal ?? new AbortController().signal,
      recursionDepth: depth,
      executeToolInMain: config.executeToolInMain,
    });
    const executed = await executeToolCalls(parsed.toolCalls, {
      tools: working.tools,
      hooks: config.hooks,
      mode: config.toolExecution,
      makeContext,
      state: working,
      threadId,
      recursionDepth: depth,
      emit: (e) => toolEvents.push(e),
    });
    for (const e of toolEvents) yield e;

    // 6. Append tool results + persist.
    for (const ex of executed) {
      const msg = toToolResultFromExecuted(ex);
      working.messages.push(msg);
      await config.session?.append(threadId, msg);
    }

    // 7. Termination: every result asked to terminate.
    if (executed.length > 0 && executed.every((ex) => ex.result.terminate)) {
      yield { type: 'done', finalMessage: parsed.message };
      return;
    }

    // 8. Early stop hook (e.g. the app decides the turn was final).
    if (config.hooks?.shouldStopAfterTurn) {
      const stop = config.hooks.shouldStopAfterTurn({
        state: working,
        lastAssistant: parsed.message,
        recursionDepth: depth,
      });
      if (stop) {
        yield { type: 'done', finalMessage: parsed.message };
        return;
      }
    }

    // 9. Compaction (cheap predicate first).
    if (config.compaction?.needs(working)) {
      working = await config.compaction.compact(working);
    }
  }

  // Recursion limit reached without a final answer.
  yield {
    type: 'error',
    error: `Recursion limit (${recursionLimit}) reached without a final answer.`,
  };
  yield { type: 'done' };
}

// =============================================================================
// createAgent
// =============================================================================

import type { Agent, UserInput } from '../types.js';

/**
 * Build an `Agent` over the injected runtime. `prompt` starts a fresh run
 * from `state` + the user input; `continue` resumes a persisted thread
 * (requires `config.session`).
 */
export function createAgent(config: AgentConfig): Agent {
  return {
    prompt(state: AgentState, input: UserInput, signal?: AbortSignal) {
      const seeded: AgentState = {
        ...state,
        messages: [...state.messages, toUserMessage(input.text)],
      };
      return runAgentLoop(seeded, config, { signal });
    },

    continue(threadId: string, input: UserInput, signal?: AbortSignal) {
      // The async generator defers `session.load` until iteration begins.
      return (async function* resume(): AsyncGenerator<AgentEvent, void, unknown> {
        if (!config.session) {
          yield {
            type: 'error',
            error: '@dome/agent-core: continue() requires config.session.',
          };
          yield { type: 'done' };
          return;
        }
        const history = await config.session.load(threadId);
        // Only the message history is persisted. `systemPrompt`, `model`,
        // and `tools` are not — the app rebuilds them per process. For a
        // resumed run the app supplies them via `config.resumeState`
        // (a thunk so it can be rebuilt fresh each time); we merge the
        // persisted history into it. Without it we fall back to a bare
        // state, which still runs but with no tools/system prompt.
        const base = config.resumeState?.() ?? {
          systemPrompt: '',
          model: { provider: 'openai' as const, model: 'unknown' },
          thinkingLevel: 'off' as const,
          tools: [],
          messages: [],
        };
        const state: AgentState = {
          ...base,
          messages: [...history, toUserMessage(input.text)],
        };
        yield* runAgentLoop(state, config, { threadId, signal });
      })();
    },
  };
}
