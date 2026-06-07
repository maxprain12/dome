# Auditoría de paridad pi → Dome

> Validación de que Dome replica los flujos de **pi** (`github.com/earendil-works/pi`): su
> sistema de agente, su sistema de providers, y sus funciones básicas; adaptando las que lo
> requieren. **Solo informe** — no se modificó código de producto en esta auditoría.

## Baseline

| Dato | Valor |
|---|---|
| pi upstream | `github.com/earendil-works/pi` (clon local en `/pi`, gitignored: `/pi/`) |
| pi commit | `89a92207f1c9303d53d822fd9b0ac21578834cb4` (2026-06-05), `version 0.0.3` |
| Paquetes pi | `packages/{ai, agent, coding-agent, tui}` |
| Port en Dome | `packages/ai` (= pi-ai), `packages/agent-core` (= pi-agent, rediseñado), `@dome/tools`, `@dome/prompts` + wiring en `electron/agents/agent-runtime.cjs` |
| Estrategia | pi-ai **vendorado** (copia 1:1); pi-agent **rediseñado** ("adopt the design, not the package") |

Clasificación usada en todo el documento:

- `COPIA-FIEL` — vendorado 1:1 (salvo extensión de import).
- `ADAPTADO-OK` — divergencia justificada por la arquitectura de Dome (Electron/IPC/SQLite/renderer).
- `ADAPTADO-RIESGO` — divergencia que puede cambiar el comportamiento observable.
- `GAP` — flujo de pi no presente en Dome.
- `NO-APLICA` — flujo de pi fuera del alcance de Dome (TUI, CLI, proxy propio de pi).

---

## 1. Resumen ejecutivo

| Capa | Veredicto | Detalle |
|---|---|---|
| **A — Providers / LLM I/O (pi-ai → `@dome/ai`)** | ✅ Paridad casi total | Los 19 providers + núcleos son **idénticos** salvo la extensión de import (`.ts`→`.js`). Vivo en producción vía `llm-service.cjs` y `dome-langchain-model.cjs`. |
| **B — Sistema de agente (pi-agent → `@dome/agent-core`)** | 🟨 Paridad parcial | El loop núcleo (stream→tools→repeat), hooks before/after, sequential/parallel, session SQLite, skills y stream-parser están. **Faltan**: compaction por summarization, orquestación de harness (steering/follow-up/queue, branching), `prepareNextTurn`/`transformContext`/`getApiKey`, `validateToolArguments` en el loop, `tool_execution_update`, prompt-templates. |
| **C — Wiring / surfaces (Dome)** | 🟨 Opt-in experimental | Selector `DOME_AGENT_RUNTIME[_<SURFACE>]`, default `langgraph`. Many verificado en vivo (texto+tools); resto cableado pero sin parity. agent-team aún en deepagents. |
| **D — Funciones básicas pi** | 🟨 Vendorado, parcial consumo | Streaming/multi-provider/usage/thinking: vivos. Images, OAuth, env-api-keys, session-resources: **vendorados pero dormidos** (Dome usa equivalentes propios). |

**Conclusión:** el **sistema de providers de pi se copia fielmente y se usa** (Capa A ✅). El
**sistema de agente de pi se adopta parcialmente**: el bucle esencial y los hooks están portados,
pero varios flujos de pi (compaction por resumen, colas de steering/follow-up, branching de sesión,
refresco de API key, validación de argumentos, streaming de resultados de tool) **no están** y son
gaps reales si el objetivo es paridad completa. La mayoría de ausencias son deliberadas para la fase
actual de migración (default sigue en LangGraph), pero deben cerrarse antes del cutover (Fase 6).

---

## 2. Capa A — Providers / LLM I/O (`pi/packages/ai` → `packages/ai`)

### 2.1 Resultado de los diffs

`diff -rq` muestra "differ" en todos los providers, pero el **diff funcional es nulo**: la única
diferencia es la extensión de los specifiers de import (`from "./x.ts"` → `from "./x.js"`),
requerida por el build `tsc`/NodeNext de Dome.

| Grupo | Ficheros | Veredicto |
|---|---|---|
| `providers/*.ts` (incl. `images/`) | 19 | `COPIA-FIEL` — 0 líneas no-import cambiadas |
| Núcleo top-level (`stream`, `models`, `types`, `api-registry`, `env-api-keys`, `images`, `image-models`, `images-api-registry`, `session-resources`, `bedrock-provider`, `oauth`) | todos | `COPIA-FIEL` — solo extensiones de import |
| `utils/**` (incl. `utils/oauth/`) | todos | `COPIA-FIEL` — idénticos |
| `index.ts` (barrel) | 1 | `ADAPTADO-OK` — añade 3 exports dome (`tool-schema`, `legacy-bridge`, `dome-bridge`) |

Comprobación: las únicas "diferencias no-import" detectadas (`stream.ts`, `images.ts`,
`providers/images/register-builtins.ts`) resultaron ser también cambios de extensión en imports
dinámicos / side-effect (`import("./openrouter.ts")` → `.js`).

### 2.2 Diferencias de conjunto de ficheros

| Tipo | Fichero | Veredicto |
|---|---|---|
| Solo en pi | `cli.ts` | `NO-APLICA` — CLI de pi, no parte de la lib |
| Solo en Dome | `dome-bridge.ts` | `ADAPTADO-OK` — `resolveDomeModel`, `domeUsageToLegacy`, `legacyUsageToDome`, `extractTextFromAssistantMessage` |
| Solo en Dome | `legacy-bridge.ts` | `ADAPTADO-OK` — `legacyMessagesToContext`, `mapThinkingLevel` (puente al formato de mensajes legado) |
| Solo en Dome | `tool-schema.ts` | `ADAPTADO-OK` — conversión de schema de tools |
| Solo en Dome | `models.generated.ts`, `image-models.generated.ts` | `ADAPTADO-OK` — catálogos generados |

### 2.3 Consumo en vivo

`@dome/ai` **es la capa LLM real** de Dome (Fase 1 ✅):

- `electron/ai/llm-service.cjs` → `resolveDomeModel`, `legacyMessagesToContext`, `streamSimple`, `complete`, `domeUsageToLegacy` (vision/OCR/editor-ai/metadata).
- `electron/ai/dome-langchain-model.cjs` → envuelve `streamSimple`/`complete` de pi dentro de un modelo LangChain, de modo que **incluso la ruta LangGraph legada stremea con pi por debajo**.
- `electron/agents/agent-runtime.cjs` → `streamSimple` directo en la ruta `domeagent`.

**Veredicto Capa A: ✅ paridad de providers completa y en uso.**

---

## 3. Capa B — Sistema de agente (`pi/packages/agent` → `packages/agent-core`)

pi reorganizado. Mapa de flujo (pi ↔ Dome) con veredicto:

| Flujo pi | pi (archivo) | Dome | Veredicto |
|---|---|---|---|
| Bucle de agente (stream→tools→repeat) | `agent-loop.ts` `runLoop` | `runtime/agent-loop.ts` `runAgentLoop` | `ADAPTADO-OK` (reestructurado a generador con `recursionLimit`) |
| Parsing del stream pi | `streamSimple` + EventStream | `runtime/stream-parser.ts` `parseModelStream` | `COPIA-FIEL` (maneja el wire format de pi correctamente) |
| Ejecución de tools sec/paralelo | `agent-loop.ts` `executeToolCalls*` | `runtime/tool-executor.ts` | `ADAPTADO-RIESGO` (ver 3.1) |
| Hooks before/after tool | `beforeToolCall`/`afterToolCall` | `hooks/*` + tool-executor | `ADAPTADO-OK` |
| Sesión | `harness/session/{jsonl,memory,session,uuid}.ts` (árbol + JSONL) | `session/repo.ts` (SQLite plano) | `ADAPTADO-OK` con branching reducido (R5) |
| Compaction | `harness/compaction/{compaction,branch-summarization}.ts` | `compaction/{default,trim}.ts` | `ADAPTADO-RIESGO` / `GAP` (ver 3.2) |
| Skills (descubrir + inyectar) | `harness/skills.ts` + `system-prompt.ts` | `skills/{index,format,frontmatter}.ts` | `ADAPTADO-OK` |
| Skill invocation | `formatSkillInvocation` | — | `GAP` |
| System prompt | `harness/system-prompt.ts` | `@dome/prompts` (assembler propio) | `ADAPTADO-OK` |
| Prompt templates / slash commands | `harness/prompt-templates.ts` | — | `GAP` (Dome no porta el sistema de prompt-templates de pi) |
| Orquestación de harness | `harness/agent-harness.ts` (phases, colas, branching) | `runtime/agent-loop.ts` `createAgent` (thin) | `GAP` (ver 3.3) |
| Proxy de modelos | `proxy.ts` `streamProxy` | — | `NO-APLICA` (Dome usa su provider `dome`, no el proxy de pi) |
| Guardrails antes del modelo | — | `hooks/guardrails.ts` + `beforeModelCall` | `ADAPTADO-OK` (añadido Dome) |
| Caps de tools | — | `hooks/caps.ts` | `ADAPTADO-OK` (añadido Dome) |
| HITL / aprobación | — | `hooks/hitl.ts` + `beforeToolCall` | `ADAPTADO-OK` (añadido Dome) |

### 3.1 Ejecución de tools — divergencias (`tool-executor.ts`)

- **Modo por defecto invertido**: pi default = `"parallel"`; Dome default = `"sequential"`
  (`mode = opts.mode ?? 'sequential'`). `ADAPTADO-RIESGO` — cambia el orden/concurrencia observable.
- **`executionMode` por tool**: pi fuerza secuencial si **algún** tool del lote lo pide
  (`hasSequentialToolCall`). Dome solo mira `opts.mode`. `GAP`.
- **`validateToolArguments`**: pi valida los argumentos contra el schema **antes** de `beforeToolCall`.
  El loop de Dome **no** llama a `validateToolArguments` (la función existe vendorada en
  `packages/ai/src/utils/validation.ts` pero no se usa en el loop; la validación recae en el
  dispatcher). `GAP` a nivel de loop.
- **`prepareArguments` por tool**: shim de compatibilidad de args. `GAP`.
- **`tool_execution_update` / `onUpdate`**: pi permite a un tool emitir resultados parciales en
  streaming (`AgentToolUpdateCallback`). La firma de `AgentTool.execute` en Dome es `(args, ctx)`
  sin callback de update. `GAP`.
- **Eventos**: pi emite `tool_execution_start/update/end`; Dome emite `tool_call` (parser) + `tool_result`
  (executor). Vocabulario reducido pero suficiente para el renderer actual. `ADAPTADO-OK`.

### 3.2 Compaction — divergencia mayor (Riesgo R4)

| Aspecto | pi (`harness/compaction/compaction.ts`) | Dome (`compaction/{default,trim}.ts`) |
|---|---|---|
| Umbral | Relativo: `contextTokens > contextWindow - reserveTokens` (`reserveTokens` 16384) | Fijo: `thresholdTokens` 100_000 |
| Conteo | `calculateContextTokens(usage)` con usage real del último assistant | Estimación por longitud |
| Estrategia | **Summarization vía LLM** (`generateSummary`/`prepareCompaction`, `findCutPoint`, `findTurnStartIndex`) | **Trim**: descarta turnos viejos, conserva últimos N (`maxRetainedTurns` 10) |
| Branch summary | `branch-summarization.ts` (`generateBranchSummary`) | — |
| Preserve vision | (en pi vía cut-point) | `preserveVision: true` |

**Veredicto:** `ADAPTADO-RIESGO` + `GAP`. La spec de migración pedía "portar umbrales 1:1
primero"; Dome implementó un trim simple en su lugar. Faltan: el resumen por LLM de lo descartado,
el branch-summary, el umbral consciente del `contextWindow` del modelo y el conteo basado en usage real.

### 3.3 Orquestación de harness — `GAP`

`pi/harness/agent-harness.ts` es un orquestador con estado (`phase: idle|turn`) sobre el loop, que
Dome **no** porta. Flujos ausentes:

- **Steering messages** (`getSteeringMessages`): inyectar mensajes del usuario mientras el agente trabaja. `GAP`.
- **Follow-up / queue mode** (`getFollowUpMessages`, `QueueMode = all|one-at-a-time`): continuar tras
  que el agente "pararía". `GAP`.
- **`prepareNextTurn`**: cambiar modelo/thinking-level por turno dentro de un mismo run. `GAP`.
- **`transformContext`**: transform por turno a nivel `AgentMessage`. `GAP`.
- **`getApiKey`**: refresco de API key por llamada (tokens OAuth que expiran, p. ej. Copilot). `GAP` (relevante).
- **Branching / navigate-tree**: la sesión de pi es un árbol navegable con ramas; la de Dome es
  lista plana (aunque `SessionRepo` declara `branch()`/`truncateAfter()`). `GAP` parcial.
- **Eventos de ciclo**: `agent_start`/`agent_end`/`message_start`/`message_update`/`message_end` de
  pi no existen en el `AgentEvent` de Dome. `GAP` (fidelidad de eventos).

### 3.4 Thinking levels

pi: `off | minimal | low | medium | high | xhigh`. Dome: `off | low | medium | high`.
Faltan `minimal` y `xhigh`. `GAP` menor.

---

## 4. Capa C — Wiring / surfaces (Dome)

### 4.1 Selector (`electron/agents/agent-runtime.cjs`)

- `resolveRuntime(surface)`: `DOME_AGENT_RUNTIME_<SURFACE>` > `DOME_AGENT_RUNTIME` > `'langgraph'` (default). `ADAPTADO-OK`.
- `createStreamFnAdapter`: usa `ai.streamSimple` + `resolveDomeModel` + `legacyMessagesToContext`. `ADAPTADO-OK`.
- `mapAgentEventToChunk`: mapea `text_delta, thinking, tool_call, tool_result, usage, budget, error, done`.
  **Devuelve `null` para `turn_start, turn_end, interrupt, artifact_block, retry`.** `ADAPTADO-RIESGO`:
  el evento `interrupt` (HITL) y `artifact_block` no llegan al renderer por este mapper.
- `runDomeAgent` fija `thinkingLevel: 'off'` (ignora el nivel real del opts). `ADAPTADO-RIESGO` menor.

### 4.2 Estado de cutover por surface

| Surface | Consumidor | Runtime default | Parity verificada |
|---|---|---|---|
| Many | `ipc/ai/ai.cjs` → `runManyAgent` | langgraph | 🟨 texto + tool-calling en vivo (MiniMax-M3) con `DOME_AGENT_RUNTIME_MANY=domeagent` |
| agent-chat | `run-engine.cjs` `executeLangGraphRun` (`ownerType==='agent'`) | langgraph | ☐ cableado, sin verificar |
| workflows | `run-engine.cjs:1730` → `runAgent('workflows')` | langgraph | ☐ cableado, sin verificar |
| automations | mismo nodo de `run-engine.cjs` | langgraph | ☐ cableado, sin verificar |
| agent-team | `ipc/agents/agent-team.cjs:413` `resolveRuntime('agent-team')` | langgraph (deepagents) | ⬜ solo selector-aware; runtime de equipo nativo pendiente |

### 4.3 Tools (`@dome/tools`)

`createToolRegistry` (`packages/tools/src/registry.ts`) convierte `ToolDefinition[]` OpenAI-style a
`AgentTool[]` puenteando la ejecución a `electron/tools/tool-dispatcher.cjs` vía `executeToolInMain`.
103 definiciones migradas; la ejecución aún vive en el dispatcher. `ADAPTADO-OK` — estas tools son de
dominio Dome (no provienen de pi), por lo que no son un gap de paridad con pi.

---

## 5. Capa D — Checklist de funciones básicas de pi

| Función pi | Vendorada en `@dome/ai` | Consumida por Dome | Veredicto |
|---|---|---|---|
| Streaming (`streamSimple`/`stream`) | ✅ | ✅ (llm-service, dome-langchain-model, agent-runtime) | `COPIA-FIEL` + en uso |
| Multi-provider (OpenAI/Anthropic/Google/Bedrock/Mistral/Azure/Codex/Copilot/OpenRouter) | ✅ | ✅ | `COPIA-FIEL` + en uso |
| Usage / cost | ✅ | ✅ (`domeUsageToLegacy`) | `COPIA-FIEL` + en uso |
| Thinking levels | ✅ | ✅ parcial (`mapThinkingLevel`, sin `minimal`/`xhigh`) | `ADAPTADO-OK` |
| `models`/`api-registry`/`models.generated` | ✅ | ✅ (`resolveDomeModel`) | `COPIA-FIEL` + en uso |
| `validation` (`validateToolArguments`) | ✅ | ⚠️ no en el loop de agente | `COPIA-FIEL` pero infrautilizado |
| `overflow` / `diagnostics` / `event-stream` / `json-parse` | ✅ | indirecto (vía providers) | `COPIA-FIEL` |
| Images (`images`, `image-models`, `images-api-registry`) | ✅ | ✗ (Dome usa su pipeline de imágenes propio) | `COPIA-FIEL` dormido |
| OAuth (`utils/oauth`, `oauth.ts`) | ✅ | ✗ (Dome usa `auth-manager`/`dome-oauth`) | `COPIA-FIEL` dormido |
| `env-api-keys` | ✅ | ✗ (Dome lee claves de settings/DB) | `COPIA-FIEL` dormido |
| `session-resources` | ✅ | ✗ | `COPIA-FIEL` dormido |

---

## 6. Gaps priorizados y adaptaciones con riesgo

### Alta (bloquean paridad de comportamiento antes del cutover)

1. **Compaction por summarization + branch-summary (R4)** — Dome solo hace trim; pierde el resumen LLM
   y el umbral consciente del `contextWindow`. *(Capa B 3.2)*
2. **`getApiKey` por llamada** — sin refresco de tokens OAuth que expiran, los runs largos con Copilot
   pueden fallar a mitad. *(Capa B 3.3)*
3. **`validateToolArguments` en el loop** — sin validación de args a nivel de agente, args malformados
   llegan al dispatcher sin la red de seguridad de pi. *(Capa B 3.1)*
4. **Default de ejecución de tools (parallel vs sequential)** — diferencia observable de orden/latencia
   y posible drift de transcripción (R1). *(Capa B 3.1)*

### Media (fidelidad de UX / control de flujo)

5. **Orquestación de harness**: steering, follow-up/queue, `prepareNextTurn`, `transformContext`. *(3.3)*
6. **`tool_execution_update`** (streaming de resultados parciales de tool). *(3.1)*
7. **`interrupt`/`artifact_block` no mapeados** en `mapAgentEventToChunk`. *(4.1)*
8. **Branching de sesión / navigate-tree** (R5: preservar contrato Runs UI al ampliar). *(3.3)*

### Baja

9. **Prompt-templates / slash-commands** de pi (`GAP`, posiblemente `NO-APLICA`). *(Capa B)*
10. **`formatSkillInvocation`** (expansión de skill al invocarla). *(Capa B)*
11. **Thinking levels `minimal`/`xhigh`**. *(3.4)*
12. **Eventos de ciclo de mensaje** (`agent_start/end`, `message_*`). *(3.3)*

### Riesgos del registro de migración tocados

- **R1** (drift de tool-call): abierto — sin golden transcripts y con default de ejecución divergente.
- **R4** (compaction): abierto — implementación divergente (trim vs summarization).
- **R5** (sesión rompe Runs UI): mitigado — esquema plano preserva el contrato, pero branching reducido.
- **R8** (tracing/langfuse): no auditado aquí; pendiente de decisión en Fase 2.

---

## 7. Apéndice — comandos de verificación (reproducibles)

```bash
# Baseline
git -C pi rev-parse HEAD            # 89a92207… (v0.0.3)
rg -n "^/pi" .gitignore             # /pi/ (gitignored)

# Capa A — providers idénticos salvo extensión de import
diff -rq pi/packages/ai/src/providers packages/ai/src/providers
# Confirmar que las "diferencias" son solo specifiers .ts→.js:
diff pi/packages/ai/src/providers/anthropic.ts packages/ai/src/providers/anthropic.ts \
  | grep '^[<>]' | grep -v 'from "\.'        # → vacío

# Conjunto de ficheros pi-only / dome-only en ai/src
for f in pi/packages/ai/src/*.ts; do b=$(basename "$f"); [ -f "packages/ai/src/$b" ] || echo "PI-ONLY: $b"; done
for f in packages/ai/src/*.ts; do b=$(basename "$f"); [ -f "pi/packages/ai/src/$b" ] || echo "DOME-ONLY: $b"; done

# Capa B — superficies de pi vs dome
ls pi/packages/agent/src pi/packages/agent/src/harness pi/packages/agent/src/harness/{compaction,session}
find packages/agent-core/src -type f | sort

# Capa C — consumidores del selector
rg -n "runManyAgent|runAgent\(|resolveRuntime" electron --glob '!**/agent-runtime.cjs'

# Capa D — consumo de @dome/ai
rg -n "ai\.(streamSimple|complete|resolveDomeModel|mapThinkingLevel|domeUsageToLegacy)" electron
```

> Notas: el clon `/pi` está gitignored (`/pi/`); no commitear. No se ejecuta `typecheck/lint/build`
> porque esta auditoría no modifica código de producto.
