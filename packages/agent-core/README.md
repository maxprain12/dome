# `@dome/agent-core`

Dome-native agent runtime. Drives a turn with `runAgentLoop` (stream → tools →
events), typed `beforeToolCall` / `afterToolCall` hooks, session repo, compaction,
and native SKILL.md discovery (`loadSkills`, `formatSkillsForSystemPrompt`).

Depends on `@dome/ai` (LLM I/O) and `@dome/tools` (tool registry). Node-only —
never imported from the renderer.

Spec: [docs/architecture/agent-runtime.md](../../docs/architecture/agent-runtime.md)
