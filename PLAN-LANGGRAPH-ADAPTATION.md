# Plan de Adaptación: Capacidades Agénticas de Dome → LangGraph/deepagents

> **Estado:** Borrador vivo · Generado: 2026-05-16  
> **Scope:** Comparativa del stack agéntico actual de Dome contra la documentación oficial de LangGraph JS/TS, LangChain JS, y deepagents. Por cada brecha se describe qué falta, qué implementamos diferente, y el plan de adaptación. Los cambios de UI se marcan explícitamente.

---

## Índice

1. [Inventario del stack actual](#1-inventario-del-stack-actual)
2. [Brechas y diferencias identificadas](#2-brechas-y-diferencias-identificadas)
   - [2.1 Checkpointing y Thread persistence](#21-checkpointing-y-thread-persistence)
   - [2.2 Human-in-the-Loop (HITL)](#22-human-in-the-loop-hitl)
   - [2.3 Multi-agent: Subgraphs y Handoffs](#23-multi-agent-subgraphs-y-handoffs)
   - [2.4 Store API — Memoria cross-thread](#24-store-api--memoria-cross-thread)
   - [2.5 Fault Tolerance — Retry / Timeouts por nodo](#25-fault-tolerance--retry--timeouts-por-nodo)
   - [2.6 Streaming (Protocol v2 / Resumable)](#26-streaming-protocol-v2--resumable)
   - [2.7 Cron / Scheduled Runs integrados con LangGraph](#27-cron--scheduled-runs-integrados-con-langgraph)
   - [2.8 Assistants API — Versionado de agentes](#28-assistants-api--versionado-de-agentes)
   - [2.9 MCP Server endpoint (Dome como MCP server)](#29-mcp-server-endpoint-dome-como-mcp-server)
   - [2.10 A2A Protocol](#210-a2a-protocol)
   - [2.11 Observabilidad (LangSmith / OTEL)](#211-observabilidad-langsmith--otel)
   - [2.12 Double-texting handling](#212-double-texting-handling)
   - [2.13 Context Engineering — Backward Compatibility](#213-context-engineering--backward-compatibility)
   - [2.14 Functional API vs Graph API en Workflows](#214-functional-api-vs-graph-api-en-workflows)
   - [2.15 Durable Execution — Background Runs](#215-durable-execution--background-runs)
   - [2.16 Time-Travel (Estado histórico de threads)](#216-time-travel-estado-histórico-de-threads)
   - [2.17 Guardrails y moderación de contenido](#217-guardrails-y-moderación-de-contenido)
   - [2.18 Generative UI / Structured Output frontend](#218-generative-ui--structured-output-frontend)
3. [Prioridad y roadmap](#3-prioridad-y-roadmap)
4. [Archivos afectados por área](#4-archivos-afectados-por-área)

---

## 1. Inventario del stack actual

### Ejecución de agentes (`electron/langgraph-agent.cjs`)

| Capacidad | Implementación actual | Referencia LangGraph |
|---|---|---|
| Modelo de grafo | `createAgent()` de `langchain` (deepagents) | `createReactAgent` / `StateGraph` |
| Checkpointer | `SqliteSaver` de `@langchain/langgraph-checkpoint-sqlite` | Cualquier `BaseCheckpointSaver` |
| HITL | `humanInTheLoopMiddleware` de `langchain` | `interrupt()` nativo + `Command({resume})` |
| Context trimming | Middleware custom `DomeTrimMessages` + `trimMessages` | `trimMessages` de `@langchain/core/messages` |
| Summarización | `summarizationMiddleware` de `langchain` (opcional) | Mismo |
| VFS / Sandbox | *(retirado — sin `@langchain/node-vfs` ni `createFilesystemMiddleware`)* | — |
| Skills | `buildSkillsMiddleware` (SKILL.md injection) | `createSkillsMiddleware` de `deepagents` |
| MCP tools | `getMCPTools()` — cliente, no servidor | Cliente + Agent Server MCP endpoint |
| Streaming | `messages` + `updates` + `custom` (+ `debug` opcional) | Añadir `values`; Protocol v2 SSE |
| Subagentes síncronos | `createSubagentTools()` via `subagents.cjs` | `langgraph.prebuilt` subgraphs |
| Subagentes asíncronos | `createAsyncSubagentTools()` en memoria | deepagents async subagents |
| Token budget | `PROVIDER_TOKEN_BUDGETS` + char-based counter | Mismo patrón, falta por proveedor `dome` |
| Thinking/Reasoning | Parser custom `<think>...</think>` | `content_blocks.thinking` nativo Anthropic |
| Observabilidad | Langfuse (opt-in) via env vars | LangSmith (LANGCHAIN_TRACING_V2) + OTEL |

### Run Engine (`electron/run-engine.cjs`)

| Capacidad | Implementación actual | Gap |
|---|---|---|
| Estado de runs | SQLite custom (`automation_runs`, `automation_run_steps`) | Sin integración con LangGraph Threads API |
| Workflows | `StateGraph` construido dinámicamente por nodo | Sin persistencia de estado intermedio por nodo |
| Automaciones | Scheduler propio (`automation-service.cjs`) | Sin integración con LangGraph Crons API |
| Background runs | `setImmediate` + `AbortController` | No usa background runs de Agent Server |
| Double-texting | No manejado | Falta: enqueue / interrupt / rollback / reject |

### Multi-agente (`electron/ipc/agent-team.cjs`)

| Capacidad | Implementación actual | Gap |
|---|---|---|
| Patrón | Supervisor con herramientas `delegate_to_X` | No usa subgraphs ni Handoffs de LangGraph |
| Streaming tags | Chunks con `agentName` custom | Falta Protocol v2 streaming por namespace |

### Memoria

| Capacidad | Implementación actual | Gap |
|---|---|---|
| Short-term | LangGraph checkpointer (`thread_id`) | OK |
| Project memory | `project-memory.cjs` (AGENTS.md injection) | Diferente a LangGraph Store API |
| Long-term | `remember_fact` tool → SQLite `interactions` | No usa `BaseStore` / semantic search store |
| Cross-thread | No existe | Falta LangGraph Store API |

---

## 2. Brechas y diferencias identificadas

### 2.1 Checkpointing y Thread persistence

**Estado actual:**  
`electron/checkpointer.cjs` usa `SqliteSaver` de `@langchain/langgraph-checkpoint-sqlite`. El `thread_id` se genera ad-hoc (`dome_${Date.now()}`, `run_${ownerType}_${now()}`). No hay un ciclo de vida de threads (crear, listar, parchear, borrar) visible para el usuario ni para automaciones.

**Gap vs LangGraph:**  
- LangGraph define un [Threads API](https://docs.langchain.com/langsmith/agent-server-api/threads/create-thread.md) con `create`, `get`, `patch`, `delete`, `search`, `copy`, `get-history`, `get-state`, `update-state`.
- `SqliteSaver` es válido para desktop (no PostgreSQL/MongoDB), pero el ciclo de vida de threads no está expuesto en la UI ni en IPC.
- Los threads del checkpointer no se correlacionan con los `session_id` de los chats ni con los `run_id` de las automaciones de forma consistente.

**Plan de adaptación:**

1. **Crear `electron/ipc/threads.cjs`** — dominio IPC para gestión de threads:
   - `threads:list` — lista thread IDs activos en el checkpointer SQLite
   - `threads:get-state` — devuelve el estado actual de un thread (checkpointer `getState`)
   - `threads:get-history` — devuelve historial de checkpoints (checkpointer `getStateHistory`)
   - `threads:delete` — borra thread del checkpointer (`deleteCheckpoints`)
   - `threads:update-state` — inyecta estado externo en un thread (time-travel)

2. **Añadir a `electron/preload.cjs`** los canales `threads:*`.

3. **Unificar `thread_id` ↔ `session_id`**: en `run-engine.cjs` y `ipc/ai.cjs`, usar el `session_id` como `thread_id` base cuando el run provenga de un chat (`sessionId` existe), para que el historial de conversación y el estado del agente estén vinculados.

4. **No requiere cambios de UI** en esta fase, pero habilita time-travel (ver 2.16).

**Archivos:** `electron/checkpointer.cjs`, `electron/run-engine.cjs`, `electron/ipc/ai.cjs`, nuevo `electron/ipc/threads.cjs`, `electron/preload.cjs`

---

### 2.2 Human-in-the-Loop (HITL)

**Estado actual:**  
`humanInTheLoopMiddleware` de `langchain` intercepta herramientas declaradas en `interruptOn` (calendar, writer, data). El agente hace pause y emite `{ type: 'interrupt', actionRequests, reviewConfigs }`. El run pasa a `waiting_approval`. El usuario aprueba/rechaza desde la UI y se llama `resumeRun` → `resumeLangGraphAgent` → `Command({ resume: decisions })`.

**Gap vs LangGraph:**  
- LangGraph recomienda usar `interrupt()` a nivel de nodo/tool nativa en lugar de middleware externo. El `humanInTheLoopMiddleware` de deepagents funciona, pero agrega una capa de abstracción que puede romper con actualizaciones del runtime.
- Falta [time-travel](https://docs.langchain.com/langsmith/human-in-the-loop-time-travel.md): el usuario debería poder ver el estado en el que el agente interrumpió y editarlo antes de reanudar.
- Falta `reviewConfigs` UI: las revisiones de herramientas deberían mostrar diff de argumentos, no solo el nombre.
- Falta soporte para múltiples interrupts secuenciales en un mismo run (chain of approvals).
- El `waitingApproval` en el run puede quedar huérfano si el `langGraphResumeOpts` no se persiste entre reinicios (solo se guarda en `activeRunContexts` en memoria).

**Plan de adaptación:**

1. **Persistir `langGraphResumeOpts` en SQLite**: cuando un run pasa a `waiting_approval`, serializar `langGraphResumeOpts` en `metadata.resumeOpts` del run (ya hay `metadata` en JSON). En `resumeRun`, leer desde DB si no está en `activeRunContexts`.

2. **UI — HITL review panel** (`app/components/agents/HITLReviewPanel.tsx`):
   - Mostrar cada `actionRequest` con nombre de herramienta + argumentos formateados (JSON diff)
   - Botones Aprobar / Rechazar por herramienta
   - Campo de texto para modificar argumentos antes de aprobar (inline edit del JSON)
   - **Cambio de UI requerido**: el panel actual solo muestra un diálogo básico; debe convertirse en un panel lateral expandido

3. **Chain of approvals**: el run puede recibir múltiples `interrupt` sucesivos. La UI debe encolarse y presentarlos uno por uno, no colapsar todos en uno.

4. **Explorar migración a `interrupt()` nativo**: a futuro, reemplazar `humanInTheLoopMiddleware` por `interrupt()` nativo de LangGraph en los nodos de herramientas. Esto requiere reescribir las herramientas calendar/writer/data como nodos del grafo, no como tools de LangChain.

**Archivos:** `electron/run-engine.cjs`, `electron/langgraph-agent.cjs`, `app/components/agents/` (nuevo `HITLReviewPanel.tsx`), `app/lib/store/useTabStore.ts`

---

### 2.3 Multi-agent: Subgraphs y Handoffs

**Estado actual:**  
Dome tiene dos implementaciones multi-agente:

1. **Agent Team** (`ipc/agent-team.cjs`): supervisor + `delegate_to_X` tools (custom). Cada delegación llama `invokeLangGraphAgent` directamente, no como subgraph de LangGraph.

2. **Workflow** (`run-engine.cjs`): `StateGraph` con nodos de tipo `agent`, conectados por edges del canvas. Cada nodo agente llama `invokeLangGraphAgent` de forma secuencial.

**Gap vs LangGraph:**  
- **No se usan subgraphs**: cada agente hijo tiene su propio `createAgent` aislado. LangGraph recomienda compilar subgraphs y añadirlos como nodos del grafo padre via `addNode(subgraph)`. Esto daría: trazabilidad por namespace, streaming con `subgraphs: true`, estado compartido via canales del StateGraph.
- **No se usan Handoffs** (`createHandoffTool`): el patrón de LangChain para multi-agent usa handoffs explícitos entre agentes con control de flujo declarativo.
- **Streaming por namespace**: el `streamAgentRun` actual filtra por `TOP_LEVEL_NODES` (`agent`, `model_request`, `model`). Con subgraphs reales, los chunks de agentes hijo llegarían con namespace (p.ej. `[research_agent:agent]`) y se podrían mostrar en la UI por agente.
- **Estado compartido**: el workflow actual pasa texto entre nodos via `mergePayloads`. Con StateGraph real, cada nodo podría escribir a canales tipados y los siguientes leerlos con acceso completo al estado previo.

**Plan de adaptación:**

**Fase A — Workflow engine (corto plazo):**
1. En `executeWorkflowRun`, reemplazar la construcción manual de `StateGraph` por una que use checkpointer: añadir `checkpointer: getDomeCheckpointer()` al `wfGraph.compile()`. Esto permite reanudar workflows fallidos desde el nodo que falló.
2. Añadir persistencia de `nodeOutputs` en el state: usar `Annotation` para que cada nodo escriba su salida y los nodos posteriores la lean directamente de `state`, no del `resolvedPayloads` in-memory.

**Fase B — Agent Team con subgraphs (medio plazo):**
1. Refactorizar `agent-team.cjs`: construir un `StateGraph` supervisor donde cada agente miembro es un subgraph compilado.
2. El supervisor llama a los subgraphs vía handoffs (`createHandoffTool` o edges condicionales).
3. Streaming: con `subgraphs: true`, `streamAgentRun` ya emite namespace. Actualizar el filtro `TOP_LEVEL_NODES` para pasar chunks con namespace al frontend.
4. **Cambio de UI requerido**: `AgentTeamView` debe renderizar streams por namespace de forma clara (collapsible cards por agente, similar al patrón [subagent-streaming](https://docs.langchain.com/oss/javascript/deepagents/frontend/subagent-streaming.md)).

**Archivos:** `electron/run-engine.cjs`, `electron/ipc/agent-team.cjs`, `electron/langgraph-agent.cjs`, `app/components/agent-team/` (UI namespace streaming)

---

### 2.4 Store API — Memoria cross-thread

**Estado actual:**  
- **Short-term**: LangGraph checkpointer (por `thread_id`). OK.
- **Long-term**: herramienta `remember_fact` → `interactions` table en SQLite. Custom, sin estructura semántica.
- **Cross-thread**: no existe. El `project-memory.cjs` inyecta un archivo AGENTS.md estático al inicio de cada turno.
- No hay `BaseStore` implementation.

**Gap vs LangGraph:**  
[LangGraph Store API](https://docs.langchain.com/langsmith/agent-server-api/store/store-or-update-an-item.md) ofrece:
- `put(namespace, key, value)` — persiste items con namespace jerárquico
- `get(namespace, key)` — recupera
- `search(namespace, query, filter)` — búsqueda semántica
- `list_namespaces` — exploración del store

deepagents usa este store para memoria persistente: `[createMemoryMiddleware](https://docs.langchain.com/oss/javascript/deepagents/memory.md)` que auto-extrae y guarda hechos importantes entre conversaciones.

**Plan de adaptación:**

1. **Implementar `DomeSQLiteStore`** en `electron/agent-store.cjs`:
   - Implementa la interfaz `BaseStore` de `@langchain/langgraph`
   - Backend: tabla `agent_store` en `dome.db` con columnas `namespace TEXT`, `key TEXT`, `value JSON`, `created_at`, `updated_at`
   - Indexado: FTS5 en `value` para búsqueda semántica básica (o usar el índice Nomic existente)
   - `put` / `get` / `delete` / `search` / `listNamespaces`

2. **Pasar el store a `createAgent`**:
   ```js
   createAgent({ model, tools, middleware, checkpointer, store: getDomeStore() })
   ```

3. **Reemplazar `remember_fact` tool** por el store nativo: el middleware de memoria de deepagents (`createMemoryMiddleware`) puede usar `DomeSQLiteStore` como backend.

4. **IPC `store:*`**: exponer `store:get`, `store:put`, `store:search` para que el renderer pueda leer/mostrar la memoria del agente.

5. **UI — Memory viewer** (`app/components/settings/AgentMemoryPanel.tsx`):
   - Lista de hechos guardados por el agente, agrupados por namespace
   - Botón de eliminar por item
   - **Cambio de UI requerido**

**Archivos:** nuevo `electron/agent-store.cjs`, `electron/langgraph-agent.cjs`, `electron/ipc/` (nuevo dominio), `app/components/settings/` (nuevo panel)

---

### 2.5 Fault Tolerance — Retry / Timeouts por nodo

**Estado actual:**  
`RECURSION_LIMIT = 100` en `langgraph-agent.cjs`. No hay retry por nodo, timeouts por tool, ni error handlers declarativos. Cuando un tool falla, el error llega al modelo como ToolMessage con contenido de error y el modelo decide qué hacer.

**Gap vs LangGraph:**  
LangGraph v1 soporta [fault tolerance](https://docs.langchain.com/oss/python/langgraph/fault-tolerance.md):
- `retryPolicy` por nodo (max attempts, delay, backoff)
- Timeouts por nodo
- Error handlers declarativos (`onError`)

Esto es especialmente relevante para:
- Herramientas de red (`web_search`, `web_fetch`) que fallan por timeout
- Herramientas de escritura (`resource_create`, `excel_*`) con reintentos seguros
- Nodos de workflow que fallan por providers temporalmente no disponibles

**Plan de adaptación:**

1. En `createAgent` / `StateGraph.addNode`, añadir `retryPolicy` para nodos críticos:
   ```js
   wfGraph.addNode(nodeId, handler, {
     retryPolicy: { maxAttempts: 3, initialInterval: 1000, backoffFactor: 2 }
   });
   ```

2. En `createConfiguredLangGraphAgent`, envolver tools de red con retry interno vía LangChain's `RetryOutputParser` o mediante el `retryPolicy` del nodo `tools`.

3. Añadir `signal.setTimeout()` para herramientas lentas. El `AbortController` ya existe; añadir timeout máximo configurable por herramienta.

4. **No requiere cambios de UI** inicialmente; se puede exponer como configuración avanzada en Settings > AI.

**Archivos:** `electron/langgraph-agent.cjs`, `electron/run-engine.cjs`

---

### 2.6 Streaming (Protocol v2 / Resumable)

**Estado actual:**  
Dome usa IPC (`ai:stream:chunk`) sobre Electron's `webContents.send`. Streaming implementado en `streamAgentRun` con modos `messages`, `updates`, `custom`. Los streams no son resumibles: si el renderer se desconecta o hay un reload, el stream se pierde.

**Gap vs LangGraph:**  
- [Protocol v2 SSE](https://docs.langchain.com/langsmith/agent-server-api/streaming/protocol-v2-event-stream-sse.md): streams SSE resumibles via `event_id` + `Last-Event-ID` header. Permite reconectar al stream.
- [Join run stream](https://docs.langchain.com/langsmith/agent-server-api/thread-runs/join-run-stream.md): unirse a un run en progreso.
- Modo `values`: emite el estado completo en cada paso (útil para debugging).

**Relevancia para Dome:**  
En desktop, el renderer siempre está conectado al main process, por lo que la reconexión SSE no aplica directamente. Sin embargo:
- El modo `values` falta — es útil para mostrar el estado completo del grafo en el UI del workflow canvas
- Los chunks de **subgraphs** (namespaces) no se pasan al renderer correctamente cuando hay delegación async
- El `streamMode: ['values']` se puede añadir para workflows visuales

**Plan de adaptación:**

1. **Añadir modo `values` para workflows**: en `executeWorkflowRun`, agregar `'values'` a `streamModes` cuando el run es de tipo `workflow`. Emitir el estado completo via `RUN_CHUNK_CHANNEL` con `{ type: 'values', state }` para que el AgentCanvas pueda actualizar nodos en tiempo real.

2. **Streaming por namespace en UI**: cuando `streamSubgraphs: true` y el chunk tiene namespace, emitir el agentName en el chunk para que la UI del Agent Team sepa qué agente está hablando.

3. **Stream resumable (futuro)**: si Dome alguna vez expone un HTTP endpoint (Agent Server), Protocol v2 sería el target.

**Archivos:** `electron/langgraph-agent.cjs`, `electron/run-engine.cjs`, `app/components/agent-canvas/` (values stream), `app/components/agent-team/` (namespace streaming)

---

### 2.7 Cron / Scheduled Runs integrados con LangGraph

**Estado actual:**  
`electron/automation-service.cjs` usa `node-cron` o un scheduler propio para disparar `startAutomationNow`. El sistema funciona pero es completamente independiente de LangGraph.

**Gap vs LangGraph:**  
[LangGraph Crons API](https://docs.langchain.com/langsmith/agent-server-api/crons/create-cron.md) permite crear crons que lanzan runs en threads específicos con input predefinido. Ventajas:
- Crons con estado: el run de cron puede tener un thread_id fijo, acumulando historial
- `thread_cron` vs `stateless_cron`: crons en threads existentes vs threads nuevos cada vez

**Relevancia para Dome:**  
La implementación actual es funcionalmente equivalente. La diferencia es que los crons de LangGraph están integrados con el sistema de threads y checkpointing, lo que significa que un agente puede recordar el output de su ejecución anterior dentro del mismo thread.

**Plan de adaptación:**

1. **Crons con thread persistente**: en `upsertAutomation`, añadir campo `persistThreadId: boolean`. Si true, usar siempre el mismo `thread_id` (`automation_${automationId}`) para que el agente tenga historial acumulado entre ejecuciones.

2. En `startAutomationNow`, si `persistThreadId`, pasar `threadId: automation_${automationId}` a `startLangGraphRun` en lugar de generar uno nuevo.

3. **UI**: en el panel de configuración de automatización, añadir toggle "Mantener contexto entre ejecuciones" que mapea a `persistThreadId`.
   - **Cambio de UI requerido** (menor, solo un toggle en `AutomationSettingsPanel`)

**Archivos:** `electron/run-engine.cjs`, `app/components/automations/AutomationSettingsPanel.tsx`

---

### 2.8 Assistants API — Versionado de agentes

**Estado actual:**  
Los agentes ("Many agents") se guardan en la tabla `many_agents` de SQLite sin versionado. Cuando se edita un agente, la versión anterior se pierde. No hay `version`, `graph_id`, ni capacidad de rollback.

**Gap vs LangGraph:**  
[LangGraph Assistants](https://docs.langchain.com/langsmith/agent-server-api/assistants/get-assistant-versions.md) mantiene versiones de cada assistant con su configuración. Se puede hacer rollback a cualquier versión. Los assistants tienen `graph_id`, `metadata`, `version`, `created_at`.

**Plan de adaptación:**

1. **Añadir tabla `many_agent_versions`** en `electron/database.cjs`:
   ```sql
   CREATE TABLE many_agent_versions (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     version INTEGER NOT NULL,
     name TEXT,
     system_instructions TEXT,
     tool_ids TEXT,       -- JSON
     mcp_server_ids TEXT, -- JSON
     created_at INTEGER,
     FOREIGN KEY (agent_id) REFERENCES many_agents(id)
   );
   ```

2. En `upsertManyAgent`, antes de sobrescribir, insertar la versión actual en `many_agent_versions` e incrementar `version` en `many_agents`.

3. **IPC `agents:get-versions`** y **`agents:restore-version`**.

4. **UI — Version history panel** en `AgentChatView` o `AgentOnboarding`:
   - Timeline de versiones con fechas
   - Botón "Restaurar esta versión"
   - **Cambio de UI requerido**

**Archivos:** `electron/database.cjs`, `electron/ipc/` (domain agents), `app/components/agents/`

---

### 2.9 MCP Server endpoint (Dome como MCP server)

**Estado actual:**  
Dome actúa como **cliente** MCP: `electron/mcp-client.cjs` conecta a servidores MCP externos y carga sus herramientas. Dome no expone un endpoint MCP server propio.

**Gap vs LangGraph:**  
[LangGraph Agent Server tiene un endpoint MCP](https://docs.langchain.com/langsmith/server-mcp.md) (`/mcp`) que permite que otros agentes o clientes consuman las herramientas y capacidades del servidor como un MCP resource. Esto habilita:
- Dome como herramienta de otro agente externo
- Interoperabilidad con Claude Code, Claude Desktop, etc.

**Plan de adaptación:**

1. **Implementar un MCP server ligero** en el main process:
   - Usar `@modelcontextprotocol/sdk` para crear un servidor MCP Stdio o HTTP
   - Exponer herramientas de Dome (resource_search, resource_get, resource_create, web_search...) como MCP tools
   - El servidor escucha en un puerto local configurable (default: 18375)

2. **IPC `mcp:server:start` / `mcp:server:stop`** para que el renderer controle el servidor.

3. **UI en Settings > MCP**: toggle "Exponer Dome como servidor MCP" con el puerto y una lista de herramientas habilitadas.
   - **Cambio de UI requerido** (nuevo panel en Settings)

4. **Registro en Claude Desktop**: generar automáticamente la configuración `~/.claude/claude_desktop_config.json` con entrada para el MCP server de Dome.

**Archivos:** nuevo `electron/mcp-server.cjs`, `electron/ipc/mcp.cjs` (ampliar), `app/components/settings/MCPSettings.tsx`

---

### 2.10 A2A Protocol

**Estado actual:**  
No implementado. Dome no habla el protocolo [Agent-to-Agent (A2A)](https://docs.langchain.com/langsmith/server-a2a.md) de LangGraph.

**Gap vs LangGraph:**  
A2A permite que Dome sea llamado por otros agentes (Claude, otro LangGraph agent, etc.) via JSON-RPC 2.0 sobre HTTP. También permite que Dome llame a otros agentes A2A.

**Relevancia:**  
Alta a futuro (interoperabilidad), baja en el corto plazo para usuarios desktop actuales.

**Plan de adaptación:**

1. **Largo plazo**: implementar un endpoint A2A local (HTTP) que wrappee `invokeLangGraphAgent`.
2. **Corto plazo**: nada. Marcado como backlog.

**Archivos:** futuro `electron/a2a-server.cjs`

---

### 2.11 Observabilidad (LangSmith / OTEL)

**Estado actual:**  
Langfuse opcional via env vars (`LANGFUSE_PUBLIC_KEY`, etc.) en `electron/observability.cjs`. Si no hay Langfuse, no hay tracing. LangSmith **no** está integrado.

**Gap vs LangGraph:**  
LangGraph está diseñado para funcionar con LangSmith (`LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY`). Traces van automáticamente a LangSmith cuando estas vars están presentes. Además, LangGraph soporta OTEL (`trace-with-opentelemetry`).

**Plan de adaptación:**

1. **Añadir soporte LangSmith** en `electron/observability.cjs`:
   - Si `LANGCHAIN_TRACING_V2=true` y `LANGCHAIN_API_KEY` presentes, LangGraph ya envía traces automáticamente (no requiere código adicional).
   - Documentar en Settings > AI > Observabilidad como opción avanzada.

2. **Unified callback**: `withLangfuseCallbacks` en `langgraph-agent.cjs` debe también pasar callbacks de LangSmith si están configurados, usando `mergeCallbacks`.

3. **UI — Observabilidad settings panel**: campo para LangSmith API Key + Project.
   - **Cambio de UI requerido** (menor, añadir campos en Settings > AI > Avanzado)

4. **Dome interna**: el stack OTLP/Vector definido en `.claude/rules/` (skill `observability-dome`) ya está preparado para recibir trazas. Conectar `withLangfuseCallbacks` opcionalmente a OTLP cuando el stack esté levantado.

**Archivos:** `electron/observability.cjs`, `electron/langgraph-agent.cjs`, `app/components/settings/AISettings.tsx`

---

### 2.12 Double-texting handling

**Estado actual:**  
No manejado. Si el usuario envía un segundo mensaje mientras el agente está procesando el primero, ambos se ejecutan de forma independiente en threads distintos o el primero se aborta según el flujo de la UI.

**Gap vs LangGraph:**  
LangGraph define cuatro estrategias para [double-texting](https://docs.langchain.com/langsmith/double-texting.md):
- **Interrupt**: cancela el run activo y empieza uno nuevo
- **Rollback**: cancela el run activo, revierte el checkpoint al estado anterior, empieza uno nuevo  
- **Reject**: rechaza el nuevo mensaje mientras el run está activo (error al usuario)
- **Enqueue**: encola el nuevo mensaje, lo procesa cuando el run actual termina

**Plan de adaptación:**

1. En `electron/ipc/ai.cjs` (handler `ai:chat:stream`), detectar si hay un run activo para el `sessionId`.
2. Aplicar la estrategia configurada (default: `interrupt`):
   - `interrupt`: llamar `abortRun` para el run activo, iniciar nuevo
   - `enqueue`: añadir a una cola por `sessionId` (Map de colas)
3. **UI**: en Settings > AI, selector de estrategia de double-texting.
   - **Cambio de UI requerido** (menor)

**Archivos:** `electron/ipc/ai.cjs`, `electron/run-engine.cjs`, `app/components/settings/AISettings.tsx`

---

### 2.13 Context Engineering — Backward Compatibility

**Estado actual:**  
El middleware `DomeTrimMessages` en `langgraph-agent.cjs` levanta system messages y los fusiona con `systemPrompt`. Hay edge cases con providers que rechazan system messages duplicados (MiniMax/Anthropic). `summarizationMiddleware` es opcional.

**Gap vs LangGraph:**  
[Backward compatibility](https://docs.langchain.com/oss/javascript/langgraph/backward-compatibility.md) de LangGraph v1: al actualizar el graph code, los checkpoints existentes pueden ser incompatibles. LangGraph ofrece patrones para manejar esto (path remapping, state migration).

**Plan de adaptación:**

1. **Versionar el schema del StateGraph**: añadir `version: 'v2'` en el metadata del `configurable`. Si se detecta un checkpoint antiguo (sin versión), migrar o descartar.

2. **Documentar el patrón de migración**: cuando se cambie la estructura de messages o state en `createAgent`, incrementar la versión y añadir un migrador en `checkpointer.cjs`.

3. **UI**: botón "Limpiar historial del agente" en Settings que llame a `threads:delete` para el thread del agente. Ya existe "limpiar conversación" pero no borra el checkpoint.

**Archivos:** `electron/checkpointer.cjs`, `electron/langgraph-agent.cjs`

---

### 2.14 Functional API vs Graph API en Workflows

**Estado actual:**  
Los workflows en `run-engine.cjs` usan `StateGraph` (Graph API) con nodos estáticos definidos en el canvas. Correcto y alineado con LangGraph.

**Gap vs LangGraph:**  
LangGraph también ofrece [Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api.md) (`task` + `entrypoint` decorators) para flujos más simples sin el overhead del StateGraph. Los [workflows de Dome son relativamente simples](docs:run-engine.cjs) — podrían beneficiarse de la Functional API para workflows lineales.

**Plan de adaptación:**

1. **Workflows lineales**: si el workflow tiene un solo camino (sin branches), usar Functional API:
   ```js
   const workflow = entrypoint(async (input) => {
     const step1 = await task1(input);
     const step2 = await task2(step1);
     return step2;
   });
   ```

2. **Workflows con branches**: mantener Graph API actual.

3. **Detectar automáticamente**: en `executeWorkflowRun`, si `edges` no tiene branches condicionales, usar Functional API.

4. Esto es una optimización, **no bloquea** nada actual. Prioridad baja.

**Archivos:** `electron/run-engine.cjs`

---

### 2.15 Durable Execution — Background Runs

**Estado actual:**  
Background runs se ejecutan via `setImmediate` en el main process. El `AbortController` permite cancelarlos. Los runs sobreviven a reinicios del renderer pero **no** a reinicios del proceso main (la app).

**Gap vs LangGraph:**  
LangGraph [durable execution](https://docs.langchain.com/oss/javascript/langgraph/durable-execution.md) garantiza que runs en progreso sobrevivan a reinicios del servidor porque el estado está en el checkpointer. Si el proceso muere, el run se puede reanudar desde el último checkpoint.

**Estado en Dome:**  
`recoverStuckRuns()` en `run-engine.cjs` marca como `failed` los runs que estaban `running` al reiniciar. Esto es correcto como fallback, pero los runs no se reanudan automáticamente.

**Plan de adaptación:**

1. **Auto-resume de runs interrupted**: en `recoverStuckRuns`, en lugar de marcar todos como `failed`, verificar si el run tiene un `threadId` válido y si el checkpointer tiene un checkpoint activo. Si lo hay, intentar reanudar automáticamente.

2. **Runs `waiting_approval`**: ya sobreviven reinicios (el checkpoint está en SQLite y los `pendingApproval` en el metadata del run). Verificar que `langGraphResumeOpts` también se persiste (ver 2.2).

3. **Runs `running` al arrancar**: decidir política — auto-retry o marcar como failed con opción manual de retry.

**Archivos:** `electron/run-engine.cjs`

---

### 2.16 Time-Travel (Estado histórico de threads)

**Estado actual:**  
No implementado en la UI. El `SqliteSaver` guarda todos los checkpoints históricos del thread, pero no hay forma de visualizarlos ni navegar entre ellos desde el renderer.

**Gap vs LangGraph:**  
[Time travel](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel.md): el usuario puede ver el historial de estados de un thread (todos los checkpoints) y "viajar" a cualquier punto pasado. Desde allí puede "bifurcar" el thread y explorar alternativas.

**Plan de adaptación:**

1. **IPC `threads:get-history`**: llama a `checkpointer.list(config)` y devuelve la lista de checkpoints con timestamps y últimos mensajes.

2. **IPC `threads:fork`**: dado un `checkpoint_id`, crea un nuevo `thread_id` con el estado de ese checkpoint y devuelve el nuevo `thread_id`.

3. **UI — Timeline panel** en `AgentChatView`:
   - Botón "Historial" en el header del chat
   - Sidebar con timeline de checkpoints (fecha, último mensaje resumido)
   - Click en un checkpoint: opción "Continuar desde aquí" (fork) o "Ver estado"
   - **Cambio de UI requerido** (significativo)

4. **UI — State viewer**: mostrar el estado del grafo en un punto del tiempo (messages, metadata).

**Archivos:** `electron/ipc/` (nuevo `threads.cjs`), `app/components/agents/AgentChatView.tsx`, nuevo `app/components/agents/ThreadTimeline.tsx`

---

### 2.17 Guardrails y moderación de contenido

**Estado actual:**  
No hay guardrails declarativos. La moderación es implícita en el system prompt del agente.

**Gap vs LangGraph:**  
[Guardrails](https://docs.langchain.com/oss/javascript/langchain/guardrails.md): LangChain ofrece middleware de guardrails para interceptar inputs/outputs del modelo y aplicar políticas de seguridad.

**Plan de adaptación:**

1. **Corto plazo**: añadir un guardrail simple en `createTrimmingMiddleware` que detecte y filtre outputs con PII obvio (regex simple).

2. **Medio plazo**: integrar un middleware de guardrails configurable por agente.

3. **No requiere cambios de UI** inicialmente.

**Archivos:** `electron/langgraph-agent.cjs`

---

### 2.18 Generative UI / Structured Output frontend

**Estado actual:**  
Dome ya tiene artifacts (Kind A inline + Kind B persistidos). Los artifacts inline se emiten como bloques de código fenced (` ```artifact:TYPE`). Los artifacts Kind B se crean via tool `artifact_create`.

**Gap vs LangGraph:**  
[Generative UI](https://docs.langchain.com/oss/javascript/langchain/frontend/generative-ui.md): LangGraph/LangChain tiene un patrón donde el agente emite structured JSON que el renderer mapea a componentes React. Usa `json-render` o `CopilotKit` para renderizar UIs dinámicas.

[Structured output](https://docs.langchain.com/oss/javascript/langchain/frontend/structured-output.md): el frontend puede registrar tipos de output estructurado que el modelo emite y renderizar componentes React específicos.

**Relevancia para Dome:**  
Los artifacts de Dome ya son generative UI. La diferencia es que LangGraph lo hace con typed streams y el renderer los deserializa. El sistema de artifacts de Dome hace lo mismo pero con fenced code blocks (string parsing).

**Plan de adaptación:**

1. **Migrar del parsing de fenced blocks a `custom` stream mode**: en lugar de parsear ` ```artifact:TYPE` del stream de texto, el agente puede emitir `config.writer({ type: 'artifact', artifactType, data })` que llega via `mode === 'custom'` al frontend. Esto elimina el frágil parsing de strings.

2. **Registrar artifact types como structured outputs**: crear un registry en el renderer que mapee `artifactType` → componente React.

3. Esta migración es incremental (los dos sistemas pueden coexistir). Prioridad media.

**Archivos:** `electron/langgraph-agent.cjs`, `app/lib/chat/artifactSchemas.ts`, `app/components/chat/artifacts/`

---

## 3. Prioridad y roadmap

### Fase 1 — Fundamentos (1-2 sprints)

| # | Área | Impacto | Esfuerzo | UI |
|---|---|---|---|---|
| 1 | **2.2** Persistir `langGraphResumeOpts` en DB (HITL durable) | Alto | Bajo | No |
| 2 | **2.1** IPC `threads:*` básico (list, get-state, delete) | Alto | Medio | No |
| 3 | **2.7** Crons con thread persistente (`persistThreadId`) | Medio | Bajo | Sí (toggle) |
| 4 | **2.5** Fault tolerance: retry en nodos de workflow | Medio | Bajo | No |
| 5 | **2.12** Double-texting: estrategia `interrupt` (default) | Alto | Medio | No |
| 6 | **2.15** Auto-resume de runs interrupted al arrancar | Medio | Medio | No |

### Fase 2 — Memoria y Store (2-3 sprints)

| # | Área | Impacto | Esfuerzo | UI |
|---|---|---|---|---|
| 7 | **2.4** `DomeSQLiteStore` + pasar a `createAgent` | Alto | Alto | Sí (nuevo panel) |
| 8 | **2.4** Reemplazar `remember_fact` por store nativo | Medio | Medio | No |
| 9 | **2.8** Versionado de agentes | Medio | Alto | Sí (timeline) |
| 10 | **2.11** LangSmith + OTEL observabilidad | Medio | Bajo | Sí (settings) |

### Fase 3 — Multi-agente y Streaming avanzado (3-4 sprints)

| # | Área | Impacto | Esfuerzo | UI |
|---|---|---|---|---|
| 11 | **2.3** Workflow engine con checkpointer (reanudar desde nodo) | Alto | Medio | No |
| 12 | **2.6** Modo `values` en stream de workflows | Medio | Bajo | Sí (canvas) |
| 13 | **2.3** Agent Team refactor con subgraphs | Alto | Alto | Sí |
| 14 | **2.16** Time-travel UI (thread history) | Medio | Alto | Sí (nuevo panel) |
| 15 | **2.2** HITL review panel mejorado (diff de args) | Medio | Medio | Sí |

### Fase 4 — Ecosistema (futuro)

| # | Área | Impacto | Esfuerzo | UI |
|---|---|---|---|---|
| 16 | **2.9** Dome como MCP server | Alto | Alto | Sí |
| 17 | **2.18** Generative UI via `custom` stream mode | Medio | Medio | No |
| 18 | **2.13** Backward compatibility / checkpoint migration | Bajo | Bajo | No |
| 19 | **2.10** A2A Protocol | Alto (futuro) | Alto | No |
| 20 | **2.17** Guardrails | Bajo | Medio | No |

---

## 4. Archivos afectados por área

### Archivos existentes a modificar

| Archivo | Áreas |
|---|---|
| `electron/langgraph-agent.cjs` | 2.2, 2.3, 2.5, 2.6, 2.11, 2.13, 2.17, 2.18 |
| `electron/run-engine.cjs` | 2.1, 2.2, 2.3, 2.5, 2.7, 2.12, 2.14, 2.15 |
| `electron/checkpointer.cjs` | 2.1, 2.13 |
| `electron/database.cjs` | 2.4, 2.8 |
| `electron/ipc/agent-team.cjs` | 2.3, 2.6 |
| `electron/ipc/ai.cjs` | 2.12 |
| `electron/observability.cjs` | 2.11 |
| `electron/preload.cjs` | 2.1, 2.4, 2.9 |
| `app/components/agents/AgentChatView.tsx` | 2.2, 2.16 |
| `app/components/automations/AutomationSettingsPanel.tsx` | 2.7 |
| `app/components/settings/AISettings.tsx` | 2.11, 2.12 |
| `app/lib/chat/artifactSchemas.ts` | 2.18 |

### Archivos nuevos a crear

| Archivo | Área |
|---|---|
| `electron/agent-store.cjs` | 2.4 |
| `electron/ipc/threads.cjs` | 2.1, 2.16 |
| `electron/mcp-server.cjs` | 2.9 |
| `app/components/agents/HITLReviewPanel.tsx` | 2.2 |
| `app/components/agents/ThreadTimeline.tsx` | 2.16 |
| `app/components/settings/AgentMemoryPanel.tsx` | 2.4 |
| `app/components/settings/MCPSettings.tsx` | 2.9 |

---

*Documento generado como guía de implementación. Actualizar a medida que se completen las fases.*
