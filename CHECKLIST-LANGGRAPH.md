# Checklist de Implementación — LangGraph Adaptation

> Generado: 2026-05-16 · Referencia: PLAN-LANGGRAPH-ADAPTATION.md

## Fase 1 — Fundamentos

- [x] **2.2** Persistir `langGraphResumeOpts` en SQLite cuando run pasa a `waiting_approval`; leer desde DB en `resumeRun` si no está en `activeRunContexts` → `electron/run-engine.cjs`
- [x] **2.1** Crear `electron/ipc/threads.cjs` con `threads:list`, `threads:get-state`, `threads:get-history`, `threads:delete`, `threads:update-state`; registrar en `ipc/index.cjs`; whitelist en `preload.cjs`
- [x] **2.1** Unificar `thread_id` ↔ `session_id`: usar `session_${sessionId}` como prefijo de `thread_id` cuando el run proviene de un chat → `run-engine.cjs`
- [x] **2.12** Double-texting: guard de sesión en `ipc/ai.cjs` — abortar stream anterior si llega nuevo mensaje en mismo `sessionId`
- [x] **2.15** `recoverStuckRuns`: preserva `waiting_approval` runs tras restart (sólo marca `failed` los runs `running` sin heartbeat) → `run-engine.cjs`
- [x] **2.5** `retryPolicy` en nodos del `StateGraph` de workflows (3 intentos, backoff 2x, solo errores transitorios) → `run-engine.cjs`
- [x] **2.1** Añadir `checkpointer` a `wfGraph.compile()` para persistir estado de workflow entre nodos → `run-engine.cjs`
- [x] **2.7** `persistThreadId` en automaciones cron: reutilizar mismo `thread_id` entre ejecuciones del mismo cron → `run-engine.cjs` `startAutomationNow`

## Fase 2 — Memoria y Store

- [x] **2.4** Crear `electron/agent-store.cjs` implementando `BaseStore` sobre SQLite (`agent_store` table); pasar a `invokeLangGraphAgent` → `langgraph-agent.cjs`
- [x] **2.4** Migrar herramienta `remember_fact` para usar Store nativo en lugar de guardar directo en `interactions`
- [x] **2.8** Añadir tabla `many_agent_versions` + lógica de versionado en `database.cjs`
- [x] **2.11** Soporte LangSmith: `LANGCHAIN_TRACING_V2` env + `LANGCHAIN_API_KEY` en `observability.cjs`

## Fase 3 — Multi-agente y Streaming

- [x] **2.6** Añadir modo `values` a `STREAM_MODES_BASE` pendiente (ver langgraph-agent.cjs)
- [x] **2.3** Refactorizar Agent Team para usar subgraphs de LangGraph en lugar de llamadas directas → `ipc/agent-team.cjs`
- [x] **2.16** Crear `app/components/agents/ThreadTimeline.tsx` — UI de time-travel con historial de checkpoints
- [x] **2.2 UI** Crear `app/components/agents/HITLReviewPanel.tsx` — panel con JSON diff, edición inline de args, aprobar/rechazar por herramienta

## Fase 4 — Ecosistema

- [x] **2.9** Crear `electron/mcp-server.cjs` — Dome como MCP server (herramientas de Library, Calendar, etc.)
- [x] **2.18** Migrar artefactos inline a modo `custom` de streaming para structured output → `langgraph-agent.cjs`
- [x] **2.13** Checkpoint schema versioning: campo `schema_version` en checkpoints → `checkpointer.cjs`
- [ ] **2.10** A2A Protocol endpoint (backlog — baja prioridad)
- [x] **2.17** Guardrails middleware: moderación de contenido antes de emitir respuesta

---

## Log de cambios

| Ítem | Archivo | Descripción del cambio | Estado |
|------|---------|----------------------|--------|
| 2.2 | `electron/run-engine.cjs` | Persistir `langGraphResumeOpts` en `metadata.resumeOpts` al interrumpir; fallback a DB en `resumeRun` tras restart | ✅ |
| 2.1 | `electron/ipc/threads.cjs` | Nuevo dominio IPC para lifecycle de threads LangGraph (list/get-state/get-history/delete/update-state) | ✅ |
| 2.1 | `electron/ipc/index.cjs` | Registrar threadsHandlers | ✅ |
| 2.1 | `electron/preload.cjs` | Whitelist canales `threads:*` + exponer `window.electron.threads` API | ✅ |
| 2.1 | `app/types/global.d.ts` | Tipos TypeScript para `window.electron.threads` | ✅ |
| 2.1 | `electron/run-engine.cjs` | `thread_id` unificado con `session_id`: `session_${sessionId}` cuando hay sesión de chat | ✅ |
| 2.12 | `electron/ipc/ai.cjs` | Guard double-texting: `sessionActiveStream` map aborta stream previo del mismo `sessionId` | ✅ |
| 2.15 | `electron/run-engine.cjs` | `recoverStuckRuns` ya no toca runs `waiting_approval` — tienen checkpoint válido y se pueden reanudar | ✅ |
| 2.5 | `electron/run-engine.cjs` | `retryPolicy` (3 intentos, backoff 2x) en todos los nodos de `executeWorkflowRun` | ✅ |
| 2.1 | `electron/run-engine.cjs` | `checkpointer: getDomeCheckpointer()` en `wfGraph.compile()` para persistencia de estado de workflow | ✅ |
| 2.11 | `electron/observability.cjs` | LangSmith: detectar `LANGCHAIN_TRACING_V2=true` + `LANGCHAIN_API_KEY` y activar auto-tracing | ✅ |
| 2.2 UI | `app/components/agents/HITLReviewPanel.tsx` | Panel HITL mejorado: cards por acción, JSON diff, edición inline de args, decisiones individuales | ✅ |
| 2.2 UI | `app/components/many/ManyPanel.tsx` | Reemplazar banner básico por `HITLReviewPanel` | ✅ |
| 2.2 UI | `app/components/agents/AgentChatView.tsx` | Añadir `pendingApproval` state + `HITLReviewPanel` | ✅ |
| 2.16 | `app/components/agents/ThreadTimeline.tsx` | Componente de time-travel con historial de checkpoints, fork desde cualquier punto | ✅ |
| i18n | `app/lib/i18n.ts` | Nuevas claves: `threads.*`, `chat.reject_all`, `chat.approve`, `chat.view_arguments`, `chat.edit_args`, `chat.submit_decisions` (4 idiomas) | ✅ |
| 2.4 | `electron/database.cjs` | Migration 34: tabla `agent_store` (namespace, key, value, timestamps) para BaseStore | ✅ |
| 2.4 | `electron/agent-store.cjs` | `DomeSQLiteStore` implementando LangGraph `BaseStore` (put/get/delete/list/search) sobre SQLite | ✅ |
| 2.4 | `electron/langgraph-agent.cjs` | Pasar `getDomeStore()` como `store` a `createAgent()` en `createConfiguredLangGraphAgent` | ✅ |
| 2.4 | `electron/ai-tools-handler.cjs` | `rememberFact` también persiste en `agent_store` vía `getDomeStore().put()` para acceso cross-thread | ✅ |
| 2.7 | `electron/run-engine.cjs` | `startAutomationNow` usa `automation_${automation.id}` como `thread_id` persistente entre ejecuciones del mismo cron | ✅ |
| 2.8 | `electron/database.cjs` | Migration 35: tabla `many_agent_versions` con snapshot de name/instructions/tools por versión | ✅ |
| 2.8 | `electron/ipc/database.cjs` | Auto-snapshot en `db:manyAgents:update` cuando cambia name/instructions/tools; handlers `listVersions` y `restoreVersion` | ✅ |
| 2.8 | `electron/preload.cjs` | Whitelist `db:manyAgents:listVersions` y `db:manyAgents:restoreVersion` | ✅ |
| 2.8 | `app/types/index.ts` | Tipo `ManyAgentVersion` | ✅ |
| 2.8 | `app/lib/db/client.ts` | Métodos `listAgentVersions()` y `restoreAgentVersion()` en el cliente DB | ✅ |
| 2.3 | `electron/ipc/agent-team.cjs` | Refactorizar a StateGraph con subgraphs: miembros como nodos, supervisor con Command-based delegation tools, thread_id estable por equipo, checkpointing compartido | ✅ |
| 2.3 | `electron/langgraph-agent.cjs` | Exportar `createConfiguredLangGraphAgent` para reutilización en agent-team | ✅ |
| 2.13 | `electron/checkpointer.cjs` | Tabla `dome_checkpoint_meta` con `schema_version=1`; `applyCheckpointMeta()` antes de abrir SqliteSaver; `getCheckpointSchemaVersion()` exportado | ✅ |
| 2.18 | `electron/langgraph-agent.cjs` | `createArtifactBlockDetector` en `streamAgentRun`: emite `{type: 'artifact:structured'}` en modo `custom` cuando se completa un fence inline | ✅ |
| 2.17 | `electron/guardrails.cjs` | Middleware de guardrails con heurísticas de contenido dañino; activado con `DOME_GUARDRAILS=1`; insertado como capa outermost en la cadena de middleware | ✅ |
