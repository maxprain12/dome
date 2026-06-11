# Agent runtime (`@dome/agent-core`)

Dome runs **one** agent runtime: the Dome-native loop in `@dome/agent-core`.
Every agent surface — Many chat, agent-chat runs, workflow agent nodes,
Agent Team, and the bench harness — goes through it.

> **Upstream reference:** session layout, harness orchestration, and multi-provider
> LLM connectors were informed by the open-source [pi](https://github.com/earendil-works/pi)
> project (`pi/packages/agent`, `pi/packages/ai`). Dome vendors and extends that design
> as `@dome/agent-core` and `@dome/ai`; product code does not depend on the upstream repo.

## Entry point

`electron/agents/agent-runtime.cjs` is the single entry point:

- `runAgent(surface, opts)` → `runDomeAgent` → `AgentHarness.prompt()`.
- `runManyAgent(opts)` → `runAgent('many', opts)`.
- `resolveRuntime()` → always `'domeagent'` (kept for call sites/tests).
- `mapAgentEventToChunk(event)` → maps `@dome/agent-core` `AgentEvent`s to the
  legacy renderer chunk shape consumed over `ai:stream:chunk`.

The harness drives: stream → tools → repeat, with argument validation,
`tool_call` hooks (creation caps + HITL), `context` hook (summarization
compaction), JSONL session persistence, and skills in the system prompt.

## Bridge (`dome-harness-bridge.cjs`)

| Concern | Implementation |
| -------- | --------------- |
| Sessions | `JsonlSessionRepo` at `{userData}/agent-sessions/`, `threadId` or `session_{sessionId}` |
| Skills | `loadSkills` + `formatSkillsForSystemPrompt` in harness `systemPrompt` callback |
| MCP | `getMCPTools` → `AgentTool[]`, merged with `@dome/tools` registry |
| Tools | `createToolRegistry` + main-process `executeToolInMain`; `normalizeToolParameters` for strict providers |
| HITL | `HITL_TOOL_NAMES` + interrupt (`hitlInterrupt`) → `waiting_approval` + `resumeDomeAgent` / `resumeRun` |

## Skills

- `loadSkills(env, dirs)` — reads `SKILL.md` from `~/.dome/skills/`.
- `formatSkillsForSystemPrompt(skills)` — `<available_skills>` block (injected each turn).
- `electron/skills/index.cjs` — `skills:list` IPC wrapper.

## Threads IPC

`electron/ipc/agents/threads.cjs` reads/writes JSONL sessions (replaces LangGraph
checkpointer). Channels: `threads:list`, `threads:get-state`, `threads:get-history`,
`threads:delete`, `threads:update-state` (fork + inject messages),
`threads:compact`, `threads:navigate-tree`.

## Removed legacy stack

LangGraph fully removed — agent stack (`langgraph-agent.cjs`, checkpointer, subagents)
**and** the workflow `StateGraph` orchestrator. Workflows now run on a native
topological DAG executor in `run-engine.cjs` (`executeWorkflowRun` → `topologicalLevels`,
level-parallel with per-node retry; each node runs through the harness).

### run-engine module split (04/T05)

`electron/agents/run-engine.cjs` is the façade (public API unchanged for the
IPC handlers and `automation-service.cjs`). Extracted so far:

- `workflow-dag.cjs` — pure DAG helpers (`topologicalLevels`, `mergePayloads`,
  `getInputPayloads`); unit-tested in `electron/__tests__/workflow-dag.test.mjs`.
- `run-store.cjs` — run/step/link persistence (SQLite rows ↔ normalized
  objects), the `runs:updated` / `runs:step` renderer events and the
  note-resource side effect. Terminal automation status flows back to the
  engine via the `onTerminalAutomationStatus` hook (no circular import).

Pending extractions (next PRs): `workflow-executor.cjs` (executeWorkflowRun /
node retry) and `run-lifecycle.cjs` (activeRunContexts, abort, HITL
pause/resume).
Removed npm deps: `langchain`, `@langchain/langgraph`, `@langchain/langgraph-checkpoint-sqlite`, `deepagents`.

Still present (not LangGraph / not the agent runtime):

- `@langchain/core` — base types for the plain LLM wrappers in `llm-service.cjs`.
- `@langchain/mcp-adapters` — MCP tool client (converted to native `AgentTool[]` in bridge).

## Context usage UI (Many)

**Context calculator** in the Many header (sidebar) or above the composer
(fullscreen):

| Piece | Implementation |
| ----- | -------------- |
| Trigger | `ContextUsageIndicator` — donut ring + `N%` (click to expand) |
| Popup | Segmented bar + category rows: system prompt, tool defs, rules, skills, MCP, subagents, summarized conversation, conversation |
| Backend | `budget` chunk from `buildBudgetBreakdown()` + `measurePromptDetailed` at run start; `usage` chunk for live provider input; `compaction` chunk + `CompactionNotice` when autocompaction runs |

Autocompaction: harness `context` hook (`buildCompaction` in `agent-runtime.cjs`).
Manual: `threads:compact` IPC → `session_compact` event.

Estimates use chars÷4 (refined with `estimateContextTokens` when usage blocks exist).
Live fill uses provider `inputTokens`.

## Many session persistence

Many chat history uses a **JSONL session model** — not a dual localStorage + SQLite list:

| Concern | Source of truth |
| ------- | ---------------- |
| Messages | `{userData}/agent-sessions/` JSONL via `threads:get-state` / harness |
| Session list | `threads:list?rootOnly=true` — **excludes** subagent (`_sub_`), team delegate (`_member_`), fork (`_fork_`), and legacy `many_*` per-run sessions |
| UI meta (title, pin, active id) | `localStorage` `dome-many-sessions-ui:v1` + `dome-many-sessions-meta:v1` |
| Traceability | SQLite `chat_sessions` / `chat_messages` (secondary; not used to hydrate Many UI) |

**Stable `threadId`:** Many uses `currentSessionId` as the JSONL session id for every run in that chat. Nested subagent runs create child JSONL files with `parentSession` pointing at the parent path; they never appear in the Many sidebar.

## Workflows: message propagation

Workflow agent nodes do **not** share multi-turn chat history. Each node receives:

- Its own system prompt (from the configured agent).
- A single user message: workflow `inputTemplate.prompt` + merged upstream **text** (`mergePayloads`, joined with `---`).

Downstream nodes see only the **final assistant text** of upstream agent nodes (`fullResponse`), not internal tool traces. Parallel nodes at the same DAG level only see outputs from prior levels.

## Provider tool schema (MiniMax / strict APIs)

`@dome/ai` and `@dome/tools` normalize tool `parameters` / `input_schema` to a non-empty
`{ type: "object", properties: {} }` shape. MiniMax does **not** support Anthropic native
server web tools (`web_search_20250305`); Many/workflows keep HTTP `web_search` / `web_fetch`
client tools for that provider.

## Native capabilities (gaps closed)

1. **HITL resume** — `hitlInterrupt` pauses the run; `pendingToolCall` + JSONL session +
   `resumeDomeAgent` / `resumeRun` / `ai:langgraph:resume` continue after approval
   (including after process restart when `threadId` + run metadata persist).
2. **Many subagents** — `task` tool via `electron/agents/subagents-native.cjs`;
   enabled subagents from `DOME_MANY_SUBAGENTS` (default: all four).
3. **Agent Team** — `delegate_to_agent` nested harness turns; chunks tagged with `agentName`.
4. **Session maintenance IPC** — `threads:compact`, `threads:navigate-tree` call harness
   `compact()` / `navigateTree()`.
