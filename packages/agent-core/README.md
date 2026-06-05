# `@dome/agent-core`

Dome-native agent runtime — the replacement for LangGraph + deepagents. Drives a turn with
a single `runAgentLoop` (stream → tools → events), composes typed `beforeToolCall` /
`afterToolCall` hooks (replacing the middleware chain), and owns the session repo (replacing
`SqliteSaver`), compaction (replacing summarization middleware), and skills injection
(replacing `buildSkillsMiddleware`).

It depends on `@dome/ai` (LLM I/O), `@dome/tools` (the tool registry), and `@dome/prompts`
(system-prompt assembly). It is **Node-only** — never imported from the renderer (R9).

> ⚠️ Naming collision: Dome already has `electron/harness-backend.cjs` and
> `electron/harness-profiles.cjs` (deepagents filesystem backends). Those are **not** the
> runtime and are **not** part of this package. Internal names: `runtime/agent-loop.ts`,
> `session/`, `compaction/`, `hooks.ts`.

Spec: see [`../../longrunning-task/packages/dome-agent-core.md`](../../longrunning-task/packages/dome-agent-core.md)
and the migration tracker in [`../../longrunning-task/`](../../longrunning-task/).
