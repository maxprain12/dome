# Plan: auditoría y adopción de middleware LangChain

Comparativa entre la [documentación oficial de prebuilt middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in) y Dome. Estado implementado — ver [`docs/architecture/middleware.md`](../architecture/middleware.md).

---

## Resumen ejecutivo

| Categoría | Total doc | Integrados | No adoptados |
|-----------|-----------|------------|--------------|
| Provider-agnostic (langchain) | 14 | 13 | 0 (toolEmulator opt-in dev) |
| DeepAgents | 3 | 2 | 1 (`createSubAgentMiddleware`) |
| Dome custom | — | 3 | — (guardrails, trim, tool-result-cap) |

---

## Tabla LangChain → Dome

| Middleware oficial | ¿Lo teníamos? | Acción tomada |
|--------------------|---------------|---------------|
| Summarization | Sí | Mantener; centralizado en `agent-middleware.cjs` |
| Human-in-the-loop | Sí | Mantener; mismo `interruptOn` |
| Model call limit | No | **Añadido** — run 30 / thread 200 (full) |
| Tool call limit | Parcial (`CREATION_TOOL_CAPS`) | **Reemplazado** por middleware oficial |
| Model fallback | No | **Añadido** — cadena por provider |
| PII detection | No | **Añadido** — output redact (complementa guardrails) |
| To-do list | No | **Añadido** — `write_todos` |
| LLM tool selector | No | **Añadido** — auto si >15 tools |
| Tool retry | No | **Añadido** — tools de red |
| Model retry | No | **Añadido** — 429/5xx |
| LLM tool emulator | No | **Añadido** — `DOME_EMULATE_TOOLS=1` |
| Context editing | No | **Añadido** — ClearToolUsesEdit |
| Filesystem | No | **Añadido** — deepagents + StoreBackend |
| Subagent (deepagents) | Parcial (custom) | **No migrar** — ver decisión abajo |
| Skills (deepagents) | Sí | Sin cambios |

---

## Fases de implementación

### Fase 1 — Resiliencia ✅

- [x] `modelRetryMiddleware` — `agent-middleware.cjs`
- [x] `toolRetryMiddleware` — web_search, web_fetch, deep_research
- [x] `modelCallLimitMiddleware` — sustituye dependencia exclusiva de `RECURSION_LIMIT`

**Smoke:** forzar 429 en provider; verificar reintento en logs Langfuse/consola.

### Fase 2 — Reemplazos oficiales ✅

- [x] `toolCallLimitMiddleware` — global + un middleware por entrada en `CREATION_TOOL_CAPS`
- [x] Eliminar `makeToolCallCounter` de `langgraph-agent.cjs`
- [x] `piiMiddleware` — email + credit_card, solo output, `DOME_PII_REDACT=1`

**Smoke:** pedir al agente que cree 6 recursos seguidos → debe recibir error de límite en tool, no loop infinito.

### Fase 3 — Capacidades nuevas ✅

- [x] `todoListMiddleware`
- [x] `modelFallbackMiddleware` por provider
- [x] `contextEditingMiddleware` + `ClearToolUsesEdit`
- [x] `llmToolSelectorMiddleware` cuando tools > 15
- [x] `createFilesystemMiddleware` — `/memories/` persistente vía `getDomeStore()`

**Smoke:** conversación larga con muchas tool calls; workflow PPT; MCP con >15 tools.

### Fase 4 — Dev / decisión ✅

- [x] `toolEmulatorMiddleware` — `DOME_EMULATE_TOOLS=1`
- [x] Documentar **no** migrar `createSubAgentMiddleware`

### Fase 5 — Propagación ✅

- [x] `agent-team.cjs` — perfil `worker` en miembros
- [x] `subagents.cjs` — perfil `worker`; filesystem en subagent `data`

---

## Checklist por archivo

| Archivo | Cambio |
|---------|--------|
| `electron/agent-middleware.cjs` | **Nuevo** — factories + `buildAgentMiddlewareStack` |
| `electron/langgraph-agent.cjs` | Usa stack central; elimina caps caseros |
| `electron/guardrails.cjs` | API `wrapModelCall` compatible con langchain 1.x |
| `electron/subagents.cjs` | Stack worker + filesystem en `data` |
| `electron/ipc/agent-team.cjs` | Stack worker en miembros |
| `docs/architecture/middleware.md` | Referencia viva |
| `docs/plans/middleware-audit.md` | Este documento |

---

## Decisión: no migrar `createSubAgentMiddleware`

**Motivo:** Dome ya implementa delegación con:

1. Tools `call_research_agent`, etc. (`subagents.cjs`)
2. Tasks async `start_subagent_task` (`async-subagents.cjs`)
3. HITL en writer/data
4. Streaming de tool_call/tool_result hacia el renderer
5. Agent Team con StateGraph supervisor (patrón distinto pero equivalente en producto)

Migrar rompería contratos IPC y la UI de aprobación sin beneficio claro.

---

## Validación local

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run check:ipc-inventory
```

**Smoke manual:**

1. Chat Many — respuesta normal
2. Automation con Excel — tool retry tras fallo de red simulado
3. Workflow con `ppt_create` — respeta cap de 3 llamadas
4. MCP con muchos tools — selector reduce tools visibles
5. `DOME_EMULATE_TOOLS=1` — tools emuladas sin ejecutar IPC

---

## Próximos pasos opcionales

- Exponer toggles de middleware en Settings → AI (hoy solo env vars)
- UI para `write_todos` en RunLogView (hoy aparece como tool_call estándar)
- Anthropic provider-specific middleware (prompt caching) cuando el catálogo Dome lo requiera
