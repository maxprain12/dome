// @dome/agent-core public API
// Dome-native agent runtime (replaces LangGraph + deepagents).
// Node-only — the renderer must not import it (R9 lint rule).
//
// Phase 2 ships the types and a `createAgent` placeholder. The runtime
// (`runAgentLoop`) lands in Tarea 8; the session repo, compaction
// engine, hooks, tool executor, and stream parser in Tareas 2-7. This
// barrel is stable from Tarea 1 forward — submodules get added but the
// existing exports do not change shape.

export type {
  // State
  AgentState,
  // Tools
  AgentTool,
  AgentToolCall,
  AgentToolResult,
  ToolContext,
  // Events
  AgentEvent,
  BudgetBreakdown,
  InterruptPayload,
  ArtifactBlock,
  // Hooks
  AgentHooks,
  BeforeToolCallContext,
  AfterToolCallContext,
  ShouldStopAfterTurnContext,
  // Config
  AgentConfig,
  RunOptions,
  ThinkingLevel,
  ToolExecutionMode,
  // Model streaming (injected boundary)
  StreamFn,
  StreamRequest,
  // Surface
  Agent,
  UserInput,
  // Session
  SessionRepo,
  ThreadSummary,
  // Compaction
  CompactionSettings,
  CompactionEngine,
  // Skills (Tarea 4)
  SkillSummary,
} from './types.js';

// Skills — re-export the discovery + formatter functions so
// `runAgentLoop` (Tarea 8) and consumers can import them from the
// package barrel without reaching into the `skills/` submodule.
export {
  USER_SKILLS_DIR,
  userSkillsDir,
  listSkills,
} from './skills/index.js';
export { formatSkillsForSystemPrompt } from './skills/format.js';
// Re-export the frontmatter parser too — the SKILL.md reader in
// the harness needs it and `@dome/app` may want to validate
// installed skills without going through `listSkills`.
export { parseSkillMdFrontmatter } from './skills/frontmatter.js';

// Re-export the message wire-format from @dome/ai so consumers do not
// need to import from two packages.
export type {
  TurnSummary,
  ToolSchema,
  AgentModelRef,
  LegacyAgentMessage,
} from './types.js';
export type { Message, AssistantMessage, Usage, Api, Model, Context, Tool, AssistantMessageEvent } from '@dome/ai';

// Runtime (Tareas 6-8) — the loop, the tool executor, and the stream
// parser. `runAgentLoop` + `createAgent` are the public entrypoints;
// the executor/parser are exported for advanced consumers and tests.
export { runAgentLoop, createAgent } from './runtime/agent-loop.js';
export { executeToolCalls } from './runtime/tool-executor.js';
export type { ExecutedToolCall, ExecuteToolCallsOptions } from './runtime/tool-executor.js';
export { parseModelStream } from './runtime/stream-parser.js';
export type { StreamParseResult } from './runtime/stream-parser.js';

// Hooks (Tarea 5) — guardrails, caps, HITL, and composition. The app builds
// the default stack via `buildDefaultHooks` and injects it as `config.hooks`.
export {
  composeHooks,
  buildDefaultHooks,
  detectHarmfulContent,
  createGuardrailsHook,
  CREATION_TOOL_CAPS,
  countToolCalls,
  createCapsHook,
  createHitlHook,
} from './hooks/index.js';
export type { AgentProfile, BuildDefaultHooksOptions, HitlHookOptions } from './hooks/index.js';

// Hook context types (Tarea 5 added beforeModelCall).
export type { BeforeModelCallContext } from './types.js';

// Compaction (Tarea 3) — the runtime/app build a `CompactionEngine` via
// `createDefaultCompaction()` and pass it as `config.compaction`.
export { createDefaultCompaction, createTrimmingEngine, estimateTokens } from './compaction/index.js';

// Session (Tarea 2) — `@dome/app` builds a `SessionRepo` over its SQLite
// connection and passes it as `config.session`.
export {
  createSqliteSessionRepo,
  applySessionSchema,
  updateThreadStatus,
  DOME_AGENT_SESSIONS_SCHEMA_VERSION,
} from './session/repo.js';
export type { SqliteConnection } from './session/repo.js';
