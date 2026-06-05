# `@dome/ai`

Multi-provider LLM layer for Dome. Owns the single, provider-unified way to talk to an LLM:
build a model from config, stream a completion, count tokens/cost. Nothing above this layer
knows about OpenAI vs Anthropic vs Google vs Ollama vs OpenRouter — they all just call
`stream()`.

This is a **leaf** package (no internal deps) and is **Node-only** (main process). It is the
intended replacement for `electron/llm-service.cjs` and the catalogs under `app/lib/ai/catalogs/`.

Spec: see [`../../longrunning-task/packages/dome-ai.md`](../../longrunning-task/packages/dome-ai.md)
and the migration tracker in [`../../longrunning-task/`](../../longrunning-task/).
