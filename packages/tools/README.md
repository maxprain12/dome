# `@dome/tools`

Agent tool registry. Owns the definition and execution of Dome's agent tools, **one module
per tool family**, each with a typed schema, a pluggable execution implementation, and a
render/definition wrapper. This package is the dismantlement of the 4,142-line
`electron/ai-tools-handler.cjs` monolith into independently trackable units.

Depends only on `@dome/ai` (for tools that themselves call the LLM, e.g. deep-research).
Does **not** depend on `@dome/agent-core` — the runtime imports the registry, not vice-versa.

This package is **Node-only** (main process). The renderer may import schema/definition
types only (no execution modules).

Spec: see [`../../longrunning-task/packages/dome-tools.md`](../../longrunning-task/packages/dome-tools.md)
and the migration tracker in [`../../longrunning-task/`](../../longrunning-task/).
