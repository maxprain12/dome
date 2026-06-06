/**
 * @dome/agent-core — public type surface (single source of truth).
 *
 * The runtime lives elsewhere (`src/runtime/agent-loop.ts`, land in Tarea 8).
 * This file is the only place that declares the wire types the loop, hooks,
 * session repo, compaction engine, and consumers all share. Tasks 2-8
 * import from here so we never re-declare a public type.
 *
 * Wire-format types (`Message`, `AssistantMessage`, `ToolSchema`, `Usage`)
 * are owned by `@dome/ai` and re-exported below so consumers do not have to
 * import from two packages.
 */

// =============================================================================
// Thinking level / tool execution
// =============================================================================

/** Chain-of-thought depth exposed to the model. */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

/** How to run multiple tool calls emitted in the same assistant turn. */
export type ToolExecutionMode = 'sequential' | 'parallel';

// =============================================================================
// Re-exports from @dome/ai (wire format owner)
// =============================================================================

import type { ToolSchema } from '@dome/ai';

export type {
  Message,
  AssistantMessage,
  Usage,
  Api,
  Model,
  Context,
  Tool,
  AssistantMessageEvent,
  ResolveDomeModelOptions,
} from '@dome/ai';

export type { ToolSchema };

/** Settings reference passed through AgentState (resolved to pi Model at stream time). */
export type AgentModelRef = import('@dome/ai').ResolveDomeModelOptions;

/** Normalized assistant turn summary for IPC / session. */
export interface TurnSummary {
  text: string;
  usage: import('@dome/ai').Usage | null;
  toolCalls?: AgentToolCall[];
  error?: string;
}

// =============================================================================
// Agent state
// =============================================================================

/**
 * The complete state the loop consumes and produces. The loop is a function
 * `(state, config) -> events` — there is no implicit hidden state outside of
 * `state` and the `config` plumbing. `messages` is append-only within a run
 * (the loop pushes the assistant message + tool results at the end of each
 * turn); compaction may rewrite it in place.
 */
export interface AgentState {
  systemPrompt: string;
  model: AgentModelRef;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool[];
  messages: AgentMessage[];
}

// =============================================================================
// Tool surface
// =============================================================================

/**
 * A tool the model can invoke. `Args` and `Details` are generic so concrete
 * tools (registered in `@dome/tools`) can type their inputs and outputs
 * strongly. Defaults to `unknown` for ad-hoc / dynamic tool definitions.
 */
export interface AgentTool<Args = unknown, Details = unknown> {
  name: string;
  description: string;
  schema: ToolSchema;
  execute(args: Args, ctx: ToolContext): Promise<AgentToolResult<Details>>;
}

/**
 * Context passed to a tool at execution time. `executeToolInMain` is
 * provided by `@dome/app` and wraps `electron/tool-dispatcher.cjs` — the
 * agent-core package itself never imports the dispatcher directly so it
 * stays testable in isolation.
 */
export interface ToolContext {
  threadId: string;
  signal: AbortSignal;
  recursionDepth: number;
  /**
   * Bridge to main-process tool execution. The agent-core loop calls this
   * to actually run a tool. The signature is deliberately loose: the
   * dispatcher is the authority on input validation, output capping, and
   * the error / artifact envelope. Optional so unit tests can inject a
   * mock without going through Electron.
   */
  executeToolInMain?: (name: string, args: unknown) => Promise<unknown>;
}

/**
 * The shape every tool returns. `text` is what the model sees in the next
 * turn (truncated / formatted by `@dome/tools`); `details` is the raw
 * payload kept for the UI / artifact sink. `terminate` ends the loop after
 * the current tool; `error` marks the result as a failure (the loop
 * surfaces it to the model as a tool error message, it does not throw).
 */
export interface AgentToolResult<Details = unknown> {
  /** Summary text the model sees on the next turn. */
  text: string;
  /** Raw output for the UI / artifact sink (optional). */
  details?: Details;
  /** If `true`, the loop ends after this tool. */
  terminate?: boolean;
  /** If present, the result is an error (model sees it as a tool error). */
  error?: string;
}

// =============================================================================
// Events (streamed out of the loop)
// =============================================================================

/**
 * Chunks the runtime emits to the consumer (renderer via IPC, the run
 * engine, golden-transcript tests, etc.). The variants mirror the chunks
 * the legacy `invokeLangGraphAgent` already emits, so consumers can be
 * migrated incrementally without breaking the IPC contract.
 */
export type AgentEvent =
  | { type: 'turn_start' }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; call: AgentToolCall }
  | { type: 'tool_result'; callId: string; name: string; output: AgentToolResult }
  | { type: 'budget'; breakdown: BudgetBreakdown }
  | { type: 'usage'; usage: import('@dome/ai').Usage }
  | { type: 'retry'; reason: string; attempt: number }
  | { type: 'interrupt'; payload: InterruptPayload }
  | { type: 'artifact_block'; block: ArtifactBlock }
  | { type: 'turn_end'; message: TurnSummary }
  | { type: 'done'; finalMessage?: TurnSummary }
  | { type: 'error'; error: string };

// =============================================================================
// Tool calls
// =============================================================================

/**
 * A single tool call emitted by the model. `arguments` is already parsed
 * (the LangChain / OpenAI wire format delivers a JSON string; the stream
 * parser — Tarea 7 — is responsible for the parse).
 */
export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// =============================================================================
// Hooks (replacement for the LangGraph middleware chain)
// =============================================================================

/** Context for `beforeModelCall` — guardrails / content moderation. */
export interface BeforeModelCallContext {
  state: AgentState;
  threadId: string;
  recursionDepth: number;
}

/** Context for `beforeToolCall` — guardrails, HITL approval, cap checks. */
export interface BeforeToolCallContext {
  call: AgentToolCall;
  threadId: string;
  recursionDepth: number;
  state: AgentState;
}

/** Context for `afterToolCall` — tracing, result mutation, termination. */
export interface AfterToolCallContext extends BeforeToolCallContext {
  result: AgentToolResult;
  durationMs: number;
}

/** Context for `shouldStopAfterTurn` — early loop exit (e.g. final answer). */
export interface ShouldStopAfterTurnContext {
  state: AgentState;
  lastAssistant: TurnSummary;
  recursionDepth: number;
}

/**
 * Typed hook surface. Each hook may:
 * - `beforeToolCall` — return `{ block: true, reason }` to abort execution.
 * - `afterToolCall` — return a partial result to merge, with optional
 *   `terminate: true` to end the loop.
 * - `shouldStopAfterTurn` — return `true` to break out before the next
 *   assistant turn (e.g. the model produced a final answer).
 *
 * Hooks compose: multiple hooks can be passed; the loop runs them in order.
 */
export interface AgentHooks {
  /**
   * Runs before each model call. Return `{ block: true, reason }` to refuse
   * the turn (the loop emits the reason as the assistant message and ends).
   * Used by the guardrails content-moderation layer.
   */
  beforeModelCall?(
    ctx: BeforeModelCallContext,
  ): Promise<{ block?: boolean; reason?: string } | void>;
  beforeToolCall?(
    ctx: BeforeToolCallContext,
  ): Promise<{ block?: boolean; reason?: string } | void>;
  afterToolCall?(
    ctx: AfterToolCallContext,
  ): Promise<Partial<AgentToolResult> & { terminate?: boolean } | void>;
  shouldStopAfterTurn?(ctx: ShouldStopAfterTurnContext): boolean;
}

// =============================================================================
// Model streaming (injected — keeps agent-core decoupled from @dome/ai runtime)
// =============================================================================

/**
 * The request the loop hands to the injected `StreamFn` for one assistant
 * turn. It is a flat snapshot of the bits of `AgentState` the model needs —
 * the loop owns the state machine, the `StreamFn` owns the provider call.
 */
export interface StreamRequest {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  model: AgentModelRef;
  thinkingLevel: ThinkingLevel;
  signal?: AbortSignal;
}

/**
 * The model-call boundary. Injected via `AgentConfig.streamFn` so the
 * runtime stays testable (a fake `StreamFn` drives unit tests) and
 * decoupled from `@dome/ai`'s runtime, which is still types-only in
 * Phase 1. `@dome/app` provides the real implementation (today it adapts
 * the LangChain stream from `electron/llm-service.cjs`; Phase 6 swaps in
 * `@dome/ai`'s native `stream()`).
 *
 * It yields `AssistantMessageEvent` (the wire-format chunk owned by
 * `@dome/ai`); the loop's stream parser turns those into `AgentEvent`s.
 * The function must NOT throw for model/runtime failures — it encodes
 * them as an `{ type: 'error' }` event so the loop can surface them as a
 * failed turn instead of unwinding the generator.
 */
export type StreamFn = (
  req: StreamRequest,
) => AsyncIterable<import('@dome/ai').AssistantMessageEvent>;

// =============================================================================
// Config
// =============================================================================

/**
 * Configuration passed to `createAgent`. Everything is optional with a
 * sensible default; the loop reads `recursionLimit` from
 * `process.env.DOME_RECURSION_LIMIT` first, then this field, then 25.
 */
export interface AgentConfig {
  /**
   * The model-call boundary. Required for the loop to do anything useful;
   * optional in the type so a config can be built incrementally and the
   * loop can throw a clear error if it is missing at run time.
   */
  streamFn?: StreamFn;
  hooks?: AgentHooks;
  /** Default `'sequential'`. `'parallel'` runs tool calls concurrently. */
  toolExecution?: ToolExecutionMode;
  /** Optional session repo (in-memory if omitted — Tarea 2). */
  session?: SessionRepo;
  /** Compaction engine (Tarea 3). When omitted, no compaction runs. */
  compaction?: CompactionEngine;
  /**
   * Bridge to main-process tool execution, threaded into every
   * `ToolContext`. `@dome/app` passes a wrapper over
   * `electron/tool-dispatcher.cjs`. Optional so unit tests can register
   * tools whose `execute` is self-contained.
   */
  executeToolInMain?: (name: string, args: unknown) => Promise<unknown>;
  /** Hard cap on tool-call recursion. Default 25 (env DOME_RECURSION_LIMIT). */
  recursionLimit?: number;
  /** Optional abort signal for the whole run. */
  signal?: AbortSignal;
  /**
   * Rebuilds the non-message parts of the state (`systemPrompt`, `model`,
   * `tools`, `thinkingLevel`) for a resumed run. Only message history is
   * persisted by the session repo, so `Agent.continue` calls this to get a
   * fresh base state and merges the loaded history into it.
   */
  resumeState?: () => AgentState;
}

/** Per-run options (threadId for session persistence + an abort signal). */
export interface RunOptions {
  /** Thread id for session persistence + hook context. Generated if omitted. */
  threadId?: string;
  signal?: AbortSignal;
}

// =============================================================================
// Public surface
// =============================================================================

/**
 * The handle returned by `createAgent(config)`. `prompt` starts a new
 * conversation from a fresh state; `continue` resumes an existing thread
 * (loaded from the session repo). Both return an `AsyncIterable` of
 * `AgentEvent` so consumers can `for await` chunks or pipe to a sink.
 */
export interface Agent {
  prompt(
    state: AgentState,
    input: UserInput,
    signal?: AbortSignal,
  ): AsyncIterable<AgentEvent>;
  continue(
    threadId: string,
    input: UserInput,
    signal?: AbortSignal,
  ): AsyncIterable<AgentEvent>;
}

/**
 * User-provided input for a turn. `attachments` carries multimodal
 * payloads (the legacy chat pipeline already understands this shape).
 */
export interface UserInput {
  text: string;
  attachments?: Array<{ type: 'image' | 'video' | 'file'; url: string }>;
}

// =============================================================================
// Session repo (replacement for SqliteSaver — Tarea 2)
// =============================================================================

/**
 * Persistence interface for agent runs. The implementation lives in
 * `session/repo.ts` and is injected by `@dome/app` (so the agent-core
 * package never opens its own SQLite database). The shape mirrors the
 * Runs UI contract consumed by
 * `app/components/automations/RunLogView.tsx` (R5) — `list()` returns the
 * fields the existing UI reads.
 */
export interface SessionRepo {
  append(threadId: string, message: AgentMessage): Promise<void>;
  load(threadId: string): Promise<AgentMessage[]>;
  list(): Promise<ThreadSummary[]>;
  /** Fork the thread at `atIndex` and return the new thread id. */
  branch(threadId: string, atIndex: number): Promise<string>;
  /** Truncate the thread after `messageIndex` (for HITL rollback). */
  truncateAfter(threadId: string, messageIndex: number): Promise<void>;
}

export interface ThreadSummary {
  threadId: string;
  lastMessageAt: number;
  messageCount: number;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
}

// =============================================================================
// Skills (Tarea 4)
// =============================================================================

/**
 * Lightweight description of a discovered skill, derived from a
 * `SKILL.md` frontmatter in the user skills directory
 * (`~/.dome/skills/<id>/SKILL.md`). The full body is loaded on demand
 * by the `read` tool at runtime; only the metadata is kept in the
 * system prompt.
 *
 * Replaces the deepagents `SkillMetadata` shape from the legacy
 * `electron/skills/index.cjs` wrapper.
 */
export interface SkillSummary {
  /** Skill name from the frontmatter (`name:` field). */
  name: string;
  /**
   * Resolved description in priority order:
   *   `frontmatter.description` → `frontmatter.when_to_use` → `name` → `''`.
   * This is what the model sees in the `<available_skills>` block.
   */
  description: string;
  /** Absolute path to the `SKILL.md` file. */
  path: string;
}

// =============================================================================
// Compaction (Tarea 3)
// =============================================================================

/** Tunables for the compaction engine. Defaults are applied in Tarea 3. */
export interface CompactionSettings {
  /** When `needs(state)` returns true, run `compact()`. Default 100_000. */
  thresholdTokens: number;
  /** Hard cap on retained turns. Older turns are dropped. Default 10. */
  maxRetainedTurns: number;
  /** If true, preserve the last vision-bearing message. Default true. */
  preserveVision: boolean;
}

/**
 * Pluggable compaction strategy. `needs` is a cheap predicate the loop
 * calls every turn; `compact` is the (potentially expensive) rewriter.
 */
export interface CompactionEngine {
  needs(state: AgentState): boolean;
  compact(state: AgentState): Promise<AgentState>;
}

// =============================================================================
// Misc payload shapes (events, interrupts, artifacts)
// =============================================================================

/** Token-budget breakdown emitted via the `budget` event. */
export interface BudgetBreakdown {
  systemApprox: number;
  toolsApprox: number;
  historyApprox: number;
  totalApprox: number;
  toolCount: number;
  historyTurns: number;
}

/** Payload of the `interrupt` event — drives HITL flows. */
export interface InterruptPayload {
  type: 'approval' | 'human_input';
  toolName: string;
  toolArgs: Record<string, unknown>;
  /** Resumable via `Agent.continue(threadId, input)` once the user resolves. */
  resumeToken?: string;
}

/** A detected artifact block in the streamed assistant text. */
export interface ArtifactBlock {
  kind: string;
  payload: Record<string, unknown>;
  /** Char offset in the streamed text where the block was detected. */
  at: number;
}

// =============================================================================
// Message union (re-exported from @dome/ai, narrowed for convenience)
// =============================================================================

/**
 * The full set of messages the loop may carry. `Message` covers
 * system / user / tool; `AssistantMessage` is the structured assistant
 * response. The runtime is responsible for the invariant that every
 * assistant turn is followed by zero or more `tool` messages (one per
 * tool call) before the next assistant turn.
 */
export type AgentMessage =
  | import('@dome/ai').Message
  | LegacyAgentMessage;

/** Compact assistant record persisted by older session rows. */
export interface LegacyAgentMessage {
  role: 'assistant';
  content: string;
  text: string;
  toolCalls?: AgentToolCall[];
}
