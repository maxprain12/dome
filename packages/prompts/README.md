# `@dome/prompts`

Prompt sections + assembler. Owns every piece of prompt text and the logic that assembles a
system prompt from sections. One section = one file = one responsibility, so prompt behavior
can be customized by editing a single small file.

Leaf package (no runtime deps). Pure text + assembly + token budgeting.

This package is **Node-only** (used by `@dome/agent-core` and the legacy LangGraph path in
the main process). The renderer must not import it (R9) — at most it imports types.

Spec: see [`../../longrunning-task/packages/dome-prompts.md`](../../longrunning-task/packages/dome-prompts.md)
and the migration tracker in [`../../longrunning-task/`](../../longrunning-task/).
