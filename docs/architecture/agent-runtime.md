# Agent runtime (`@dome/agent-core`)

Dome runs **one** agent runtime: the Dome-native loop in `@dome/agent-core`.
Every agent surface — Many chat, agent-chat runs, workflow agent nodes,
Agent Team, and the bench harness — goes through it.

## Entry point

`electron/agents/agent-runtime.cjs` is the single entry point:

- `runAgent(surface, opts)` → drives `@dome/agent-core`'s `runAgentLoop`.
- `runManyAgent(opts)` → `runAgent('many', opts)`.
- `resolveRuntime()` → always `'domeagent'` (kept for call sites/tests).
- `mapAgentEventToChunk(event)` → maps `@dome/agent-core` `AgentEvent`s to the
  legacy renderer chunk shape consumed over `ai:stream:chunk`.

The loop is: stream → tools → repeat, with argument validation, before/after
tool hooks (guardrails + creation caps + HITL gate), sequential/parallel tool
execution and summarization-based compaction. Tools come from `@dome/tools`
(`createToolRegistry`) built from the OpenAI-format definitions in
`electron/tools/tool-dispatcher.cjs`.

## Skills

Skill discovery and formatting live in `@dome/agent-core`:

- `loadSkills(env, dirs)` — reads `SKILL.md` files from `~/.dome/skills/`.
- `formatSkillsForSystemPrompt(skills)` — injects `<available_skills>` block.
- `formatSkillInvocation(skill)` — full skill body for explicit invocation.

`electron/skills/index.cjs` wraps `loadSkills` for the `skills:list` IPC.
Bundled skills are seeded on first boot by `electron/marketplace/skills-bootstrap.cjs`.

## Removed legacy stack

The LangGraph/LangChain agent stack was deleted (`langgraph-agent.cjs`,
`agent-middleware.cjs`, subagents, checkpointer, agent-store, harness-*).

Removed npm deps: `langchain`, `@langchain/langgraph-checkpoint-sqlite`, `deepagents`.

Still present (not the agent runtime):

- `@langchain/langgraph` — workflow node orchestrator (`StateGraph` in `run-engine.cjs`).
- `@langchain/core` — message types in bench judge, MCP client, dome-langchain-model.
- `@langchain/mcp-adapters` — MCP tool client.
- `langfuse-langchain` — observability callbacks.

## Pending native work

1. **HITL resume** — `ai:langgraph:resume` and `resumeRun` fail explicitly (no checkpoint replay).
2. **Sub-agent delegation** — `manySubagentIds()` returns `[]`.
3. **Agent Team** — single supervisor over union of team tools (no member delegation yet).
4. **Thread time-travel** (`threads:*` IPC) — disabled (checkpointer removed).
5. **MCP in native loop** — `mcpServerIds` not yet wired into `runDomeAgent`.
6. **Skills injection in loop** — `loadSkills` + `formatSkillsForSystemPrompt` exist but are not yet called from `runDomeAgent`.
