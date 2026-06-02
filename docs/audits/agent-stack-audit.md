# Auditoría: pila de agentes Dome (deepagents / langchain / langgraph)

> Generado como parte de la migración a `createDeepAgent`. Severidad: **critical** | **high** | **medium** | **low**.

## Resumen

| Área | Critical | High | Medium |
|------|----------|------|--------|
| Agent Team | 0 | 3 | 2 |
| Subagents / async | 0 | 2 | 1 |
| langgraph-agent | 0 | 1 | 3 |
| Tokens reales | 0 | 4 | 2 |
| Acoplamiento | 0 | 1 | 2 |

---

## Agent Team — `electron/ipc/agent-team.cjs`

| Sev | Hallazgo | Ubicación | Recomendación |
|-----|----------|-----------|---------------|
| **high** | `buildMemberDirectTools` ignora `_teamToolIds` y `_teamMcpServerIds`; todos los miembros reciben el catálogo completo de tools | L132-142 | Filtrar `toolDefinitions` por `agent.toolIds` + team caps |
| **high** | `systemInstructions` de cada miembro no se inyectan al crear el subgraph del miembro | L207-223 | Pasar prompt del miembro como `systemPrompt` en `createDeepAgent` |
| **high** | Supervisor con `middleware: []` (sin retry/trim/limits) | L232-236 | `buildAgentMiddlewareStack({ profile: 'worker' })` |
| medium | Import muerto `humanInTheLoopMiddleware` | L201 | Eliminar |
| medium | Stream sin normalizar tuplas `[namespace, mode, chunk]` (LangGraph multi-mode) | L302+ | Usar `peelLangGraphStreamTuple` de langgraph-agent |
| low | Sin `withLangfuseCallbacks` en config del team | L290-294 | Añadir observabilidad |

---

## Subagents — `electron/subagents.cjs`, `electron/async-subagents.cjs`

| Sev | Hallazgo | Ubicación | Recomendación |
|-----|----------|-----------|---------------|
| **high** | Async `buildSubagentRunner` no recibe `{ provider, store }` → budgets/trim incorrectos | async L94 | Pasar `runtimeOpts` como sync |
| **high** | Subagents sync/async sin `skillsMiddleware` | subagents L108-115 | Añadir `buildSkillsMiddleware` en worker stack |
| medium | Superficie `call_*_agent` duplica `task` de deepagents tras migración | subagents L159 | Migrar a specs `subagents` en `createDeepAgent` |

---

## langgraph-agent — `electron/langgraph-agent.cjs`

| Sev | Hallazgo | Ubicación | Recomendación |
|-----|----------|-----------|---------------|
| **high** | Motor `createAgent` en lugar de harness `createDeepAgent` | L1153 | Migrar `createConfiguredLangGraphAgent` |
| medium | `hitInterrupt` asignado pero nunca leído | L1184, L1250, L1358, L1392 | Eliminar |
| medium | `enableFilesystem: false` engañoso (FS se añade en profile full) | L1150 | Usar backend deepagents; quitar flag |
| medium | ~120 líneas duplicadas entre `invokeLangGraphAgent` y `resumeLangGraphAgent` | L1238-1302 vs L1380-1439 | Extraer `finalizeAgentRun` |
| low | `llm-service` importa `createModelFromConfig` desde aquí → acoplamiento/ciclo | llm-service L8 | `model-factory.cjs` |

---

## Tokens reales

| Sev | Hallazgo | Ubicación | Recomendación |
|-----|----------|-----------|---------------|
| **high** | Provider `dome`: `streamUsage: false` + `domeFetch` borra `stream_options` | langgraph-agent | `model-factory` + passthrough |
| **high** | Usage solo al final; HITL/failed pierden usage parcial | invoke/resume | Emitir y persistir parcial |
| **high** | `run-engine` acumula usage pero no reenvía por `runs:chunk` | L1055-1057 | `emit(..., type: 'usage')` |
| **high** | `llm-service` / `cloud-llm` descartan `usage_metadata` | llm-service | Devolver `{ text, usage }` |
| medium | UI muestra estimado (`budget`) como si fuera facturación | TokenBudgetBadge | Badge separado "tokens reales" |
| medium | Stub dome-provider no emite chunk SSE `usage` | dome-provider proxy | Emitir antes de `[DONE]` |

---

## Acoplamiento

| Sev | Hallazgo | Ubicación | Recomendación |
|-----|----------|-----------|---------------|
| **high** | `getAISettings` duplicado (agent-team vs ipc/ai) | agent-team L50 | `electron/ai-settings.cjs` |
| medium | `zod/v3` en todoList custom vs `zod/v4` deepagents | agent-middleware L319 | Alinear o encapsular |
| low | Documentado: no migrar `createSubAgentMiddleware` en audit previo — **revocado** por decisión producto harness | middleware-audit.md | Ver `harness-deepagents.md` |

---

## Mitigaciones aplicadas en esta migración

- Perfiles harness vacíos por provider Dome (`harness-profiles.cjs`).
- Backend `CompositeBackend` acotado (`harness-backend.cjs`).
- `createDeepAgent` + subagents declarativos + async tools propios conservados.
