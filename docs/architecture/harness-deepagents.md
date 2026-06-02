# Dome como harness deepagents

Dome usa **`deepagents.createDeepAgent`** como motor principal del agente (Many, runs LangGraph, workflows agent nodes). El stack curado de Dome entra como **`middleware`** (custom); el harness aporta planificación, filesystem, subagentes (`task`), summarization, patch tool calls y HITL opcional.

## Stack de middleware (orden efectivo)

```
[deepagents built-in]
  todoListMiddleware
  skillsMiddleware (si skills: ~/.dome/skills)
  FilesystemMiddleware (REQUIRED)
  SubAgentMiddleware / task (REQUIRED)
  createSummarizationMiddleware (deepagents + backend)
  patchToolCallsMiddleware
  [async subagent middleware si aplica]
  [Dome customMiddleware]
    modelCallLimit, guardrails, PII (full)
    contextEditing (full)
    toolCallLimit (+ CREATION_TOOL_CAPS)
    humanInTheLoop (via interruptOn param, no duplicar middleware)
    modelFallback, modelRetry, toolRetry
    llmToolSelector, toolEmulator
    skills (si no pasado via skills: path)
    DomeTrimMessages
  anthropicPromptCaching (solo modelos Anthropic)
  memoryMiddleware (si memory: paths)
```

Dome **no** añade en customMiddleware: `todoList`, `summarization`, `createFilesystemMiddleware` (lo provee el harness).

## Backend

```js
CompositeBackend(
  StateBackend(),
  { '/memories/': StoreBackend() }
)
```

Permisos por defecto: lectura amplia en state/memories; escritura acotada. Shell (`LocalShellBackend`) detrás de `DOME_HARNESS_SHELL=1`.

## Subagentes

| Nombre | Prompt | HITL |
|--------|--------|------|
| research | `martin/subagents/research.txt` | no |
| library | `martin/subagents/library.txt` | no |
| writer | `martin/subagents/writer.txt` | sí (recursos) |
| data | `martin/subagents/data.txt` | sí (excel/ppt) |

Delegación vía tool **`task`** (no `call_*_agent`). Async: tools propios `start/check/update/cancel/list` (in-process, sin Agent Protocol HTTP).

**Disponibilidad por run**: los specs se construyen cuando el run no usa direct-tools **o** cuando el caller pide subagentes explícitamente (`subagentIds` no vacío). **Many** (direct-tools) ahora delega: `run-engine.cjs` le pasa `manySubagentIds()` (todos por defecto; configurable con `DOME_MANY_SUBAGENTS`, vacío = sin delegación). En el stream, los tool calls del subagente llevan `agentName` (namespace `tools:<subagente>`), que la UI muestra como badge en la tarjeta.

## Harness profiles

Registro en boot (`harness-profiles.cjs`): perfiles vacíos para `openai`, `dome`, `anthropic`, `google`, `ollama`, `openrouter` y variantes `provider:model` frecuentes en Dome — evita suffixes que mutan prompts.

## Streaming / IPC

- `streamAgentRun`: modos `messages`, `updates`, `custom`; namespaces de subgrafos → `agentName` en chunks.
- Chunks: `text`, `thinking`, `tool_call`, `tool_result`, `usage` (parcial + final), `interrupt`, `budget` (estimado).

## Tokens reales

- Fuente canónica: `aggregateUsageFromMessages` al final del run.
- En vivo: `usage_metadata` en `AIMessageChunk` → `onChunk({ type: 'usage', partial: true })`.
- Persistencia: `automation_runs.metadata.usage`, `chat_messages.metadata.usage`.

## App y mundo exterior

- **App (librería)**: tools existentes (`resource_*`, `excel_*`, `ppt_*`, `calendar_*`) + backend state/memories; no exponer el home completo sin `permissions`.
- **Ejecución**: `LocalShellBackend` en `/workspace/` con `DOME_HARNESS_SHELL=1` (sandbox bajo `~/.dome/harness-workspace`).
- **Web**: `web_search`, `web_fetch`, `deep_research` vía tool-dispatcher.
- **MCP cliente**: `getMCPTools` por servidor configurado.
- **MCP servidor Dome** (opcional / futuro): exponer recursos Dome a agentes externos — no implementado en v1; usar tools IPC desde el harness interno.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `electron/harness-profiles.cjs` | Perfiles vacíos |
| `electron/harness-backend.cjs` | Backend + permissions |
| `electron/subagent-specs.cjs` | Specs subagents para createDeepAgent |
| `electron/agent-middleware.cjs` | customMiddleware |
| `electron/langgraph-agent.cjs` | createDeepAgent + streaming |
| `electron/model-factory.cjs` | Modelos por provider |
