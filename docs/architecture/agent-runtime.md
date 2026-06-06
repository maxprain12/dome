# Agent runtime (`@dome/agent-core`)

Dome runs **one** agent runtime: the Dome-native loop in `@dome/agent-core`.
Every agent surface — Many chat, agent-chat runs, workflow agent nodes,
Agent Team, and the bench harness — goes through it.

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
| Tools | `createToolRegistry` + main-process `executeToolInMain` |
| HITL | `HITL_TOOL_NAMES` + `approval.requestApproval` (Many + runs) |

## Skills

- `loadSkills(env, dirs)` — reads `SKILL.md` from `~/.dome/skills/`.
- `formatSkillsForSystemPrompt(skills)` — `<available_skills>` block (injected each turn).
- `electron/skills/index.cjs` — `skills:list` IPC wrapper.

## Threads IPC

`electron/ipc/agents/threads.cjs` reads/writes JSONL sessions (replaces LangGraph
checkpointer). Channels: `threads:list`, `threads:get-state`, `threads:get-history`,
`threads:delete`, `threads:update-state` (fork + inject messages).

## Removed legacy stack

LangGraph agent stack deleted (`langgraph-agent.cjs`, checkpointer, subagents, …).
Removed npm deps: `langchain`, `@langchain/langgraph-checkpoint-sqlite`, `deepagents`.

Still present (not the agent runtime):

- `@langchain/langgraph` — workflow node orchestrator (`StateGraph` in `run-engine.cjs`).
- `@langchain/mcp-adapters` — MCP tool client (converted to native `AgentTool[]` in bridge).

## Pending native work

1. **HITL resume** — sync approval works; `ai:langgraph:resume` / `resumeRun` after process restart still fail (no interrupt checkpoint replay).
2. **Sub-agent delegation** — `manySubagentIds()` returns `[]`.
3. **Agent Team** — single supervisor (no per-member harness delegation).
4. **Session compaction UI** — harness `compact()` / branch summary not exposed over IPC yet.
