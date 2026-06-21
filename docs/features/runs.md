# Run Engine

Motor de ejecución de Dome: corre agentes, workflows y feeders, persiste cada
ejecución en DuckDB y emite eventos en tiempo real al renderer. Punto de
entrada único para todos los tipos de run (manual, programado, contextual,
canvas).

> Harness, `@dome/agent-core`, HITL y sub-agentes (`task`, `delegate_to_agent`)
> viven en otra capa: ver [docs/architecture/harness-and-subagents.md](../architecture/harness-and-subagents.md).

---

## 1. Mapa de módulos

El Run Engine está dividido en seis módulos cooperantes bajo
`electron/agents/`. `run-engine.cjs` es la fachada: re-exporta `run-store`,
delega en `workflow-executor` y `automation-service`, y enruta cada
arranque al path correcto.

```
                       run-engine.cjs  (façade, 1351 LOC)
                       ┌──────────────┴───────────────┐
                       │                              │
              run-store.cjs                  run-lifecycle.cjs
              (persistencia DuckDB,          (Map<runId, AbortController>,
               eventos runs:* +              finalize/abortAll en shutdown)
               createNoteResource)
                       │
            ┌──────────┴───────────┐
            │                      │
   workflow-executor.cjs   automation-service.cjs
   (DAG topo + Promise.all, (tick 60s, isDue,
    reintentos por nodo,    isAutomationBusy,
    runStore para estado)   startSchedulerAfterGrace)
            │
   workflow-dag.cjs (topologicalLevels, mergePayloads — puro)
            │
   agent-runtime.cjs (runDomeAgent → @dome/agent-core)
            │
   subagents-native.cjs (task / delegate_to_agent)
```

| Módulo | LOC | Responsabilidad |
|--------|-----|-----------------|
| `electron/agents/run-engine.cjs` | 1351 | Fachada pública (`init/stop`, `startAgentRun`, `startWorkflowRun`, `startAutomationNow`, `resumeRun`, `abortRun`, `deleteRun`, `getRun`, `listRuns`, CRUD de automatizaciones). Re-exporta `run-store`. |
| `electron/agents/run-store.cjs` | 411 | Persistencia de runs/steps/links en DuckDB; emisión de `runs:updated` / `runs:step` / `runs:chunk`; side-effect `createNoteResource`; hook `onTerminalAutomationStatus`. |
| `electron/agents/run-lifecycle.cjs` | 61 | Registro en memoria de contextos activos (`activeRunContexts: Map<runId, {controller, …}>`), `releaseRunContext`, `abortRun`, `abortAllRunContexts` (cierre de app). |
| `electron/agents/run-helpers.cjs` | 97 | Funciones puras: `isRunAbortedError`, `parseToolArguments`, `mergeLlmUsage`, `serializeToolResult`, `getToolStepPatch`. Cubierto por `electron/__tests__/run-helpers.test.mjs`. |
| `electron/agents/workflow-dag.cjs` | 70 | `topologicalLevels`, `mergePayloads`, `getInputPayloads`. Detecta ciclos; sin Electron, sin DB. |
| `electron/agents/workflow-executor.cjs` | 593 | Ejecuta un workflow nivel por nivel (topological order), `Promise.all` dentro de cada nivel, política de reintentos por nodo, persiste progreso vía `run-store`. |
| `electron/agents/automation-service.cjs` | 155 | Scheduler (`tick` cada 60 s), `isDue`, `isAutomationBusy`, grace de arranque (`STARTUP_GRACE_MS` 60 s / 120 s en Windows sin `automation_run_on_startup`). |
| `electron/agents/run-retention.cjs` | 153 | Purga runs terminales vencidos (`runs_retention_days`, defecto 90), elimina primero las sesiones JSONL por nodo. |
| `electron/agents/subagents-native.cjs` | 288 | Tools `task` (Many) y `delegate_to_agent` (Agent Team) — delegación anidada al harness. |
| `electron/agents/agent-runtime.cjs` | 1078 | Único runtime de agente: `runAgent(surface, opts)` con `surface ∈ {many, agent-chat, workflows, agent-team, subagent, agent-team-member, threads}` sobre `@dome/agent-core`. |

---

## 2. Ciclo de vida de un run

Cada `automation_runs.status` recorre la máquina:

```
   createRun()
       │
       ▼
   ┌─────────┐
   │ queued  │   ← insertado por createRun; patchRun → 'running' al primer heartbeat
   └────┬────┘
        │ setImmediate → executeAgentRun / executeWorkflowRun
        ▼
   ┌─────────┐                 ┌──────────────────┐
   │ running │ ─── interrupt ──▶│ waiting_approval │  (HITL; resumeRun(decisions))
   └────┬────┘                 └────────┬─────────┘
        │                               │
        ├──── done  ──────────────────► completed       (RUN_TERMINAL_STATUSES)
        ├──── error / thrown ──────────► failed
        └──── controller.abort() ──────► cancelled       (también stale recovery: ver §6)
```

`RUN_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])` en
`run-store.cjs:14`. `waiting_approval` no es terminal — su contexto se
conserva en `activeRunContexts` hasta `resumeRun`.

Cada run se inicializa con `lastHeartbeatAt = Date.now()`. Los chunks del
agent loop (`runs:chunk` con `text`/`thinking`/`tool_call`/`tool_result`/
`usage`/`interrupt`/`compaction`/`budget`) actualizan el heartbeat vía
`patchRun(runId, { lastHeartbeatAt: now() })`.

---

## 3. Paths de arranque

`run-engine.cjs` enruta según el tipo de run. Todos pasan por `createRun`
(insert en `automation_runs`) antes de ejecutar.

### 3.1 Agente (manual / chat / many)

```
window.electron.invoke('runs:start', params)
  → ipc/agents/runs.cjs → runEngine.startAgentRun(params)
  → createRun({ ownerType: 'many' | 'agent', … })
  → setImmediate(executeAgentRun)
  → agentRuntime.runDomeAgent(surface, opts)   // @dome/agent-core
```

```javascript
// params que acepta startAgentRun:
{
  ownerType: 'many' | 'agent',
  ownerId:   '<agentId>',
  title:     'Investiga las últimas tendencias en IA',
  sessionId: 'chat-session-123',         // opcional; ancla threadId
  threadId:  '<opcional; se autoderiva de sessionId>',
  messages:  [{ role: 'user', content: '…' }],
  toolDefinitions: [],                    // resuelto en main si vacío
  mcpServerIds:   [],
  subagentIds:    [],
  skipHitl:  false,                       // true para unattended
  autoSpeak: false,
  contextId: '<resourceId activo>',
}
```

### 3.2 Workflow (Agent Canvas)

```
window.electron.invoke('runs:startWorkflow', params)
  → runEngine.startWorkflowRun({ workflowId, title, inputTemplate, outputMode, … })
  → loadWorkflowById(workflowId)         // canvas_workflows (DuckDB)
  → createRun({ ownerType: 'workflow', workflowId, metadata.progress })
  → setImmediate(executeWorkflowRun)     // workflow-executor.cjs
```

### 3.3 Automatización (cron / contextual / manual)

```
runEngine.startAutomationNow(automationId)
  ├─ targetType === 'feeder'   → runFeeder (services/feeder-runner.cjs)
  ├─ targetType === 'workflow' → startWorkflowRun({ automationId, … })
  └─ targetType === 'agent' | 'many'
                                → startAgentRun({
                                    threadId: `automation_${id}`,  // memoria persistente
                                    skipHitl: true,
                                    …
                                  })
```

`automation-service.cjs:tick()` recorre todas las automatizaciones cada
60 s; para cada una llama `isDue(automation, ts)` y, si está habilitada y
no está ocupada (`isAutomationBusy`), dispara `startAutomationNow`.
`fireContextualAutomations(tag)` hace lo mismo bajo demanda del renderer
cuando una acción del usuario lleva un `tag`.

---

## 4. Persistencia (DuckDB)

El motor es **DuckDB** (`@duckdb/node-api`). La capa async vive
en `electron/core/db/duckdb.cjs`: `db.run/get/all/exec` son `Promise`s y
`db.transaction(async (tx) => …)` envuelve BEGIN/COMMIT/ROLLBACK sobre la
misma conexión serializada.

```javascript
// duckdb.cjs — contrato para todo el código de run-store
await db.run('UPDATE automation_runs SET status = ? WHERE id = ?', ['failed', id]);
const row = await db.get('SELECT * FROM automation_runs WHERE id = ?', [id]);
const rows = await db.all('SELECT id, status FROM automation_runs WHERE owner_type = ?', ['workflow']);
await db.transaction(async (tx) => {
  for (const id of ids) await tx.run('DELETE FROM automation_runs WHERE id = ?', [id]);
});
```

### 4.1 Tablas de runs

Definidas en `electron/core/db/migrations/0006_workflows.cjs`. Todas
comparten `automation_runs.*` + `automation_run_steps.*` (auditoría
paso-a-paso) + `automation_run_links.*` (relaciones run → resource /
note creado).

```sql
CREATE TABLE automation_runs (
  id                    TEXT PRIMARY KEY,
  automation_id         TEXT,
  owner_type            TEXT NOT NULL CHECK(owner_type IN ('many','agent','workflow','automation')),
  owner_id              TEXT NOT NULL,
  title                 TEXT,
  status                TEXT NOT NULL CHECK(status IN
                            ('queued','running','waiting_approval','completed','failed','cancelled')),
  session_id            TEXT,
  workflow_id           TEXT,
  workflow_execution_id TEXT,
  thread_id             TEXT,
  output_text           TEXT,
  summary               TEXT,
  error                 TEXT,
  metadata              TEXT,                    -- JSON
  started_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,
  finished_at           BIGINT,
  last_heartbeat_at     BIGINT,
  project_id            TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE automation_run_steps (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL,
  parent_step_id TEXT,                          -- sub-pasos (tool_call hijo de workflow_agent)
  step_type      TEXT NOT NULL,                 -- info|tool_call|completion|error|cancelled|decision
                                                -- |workflow_node|workflow_agent|workflow_output
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'done',
  content        TEXT,
  metadata       TEXT,                          -- JSON
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL
);

CREATE TABLE automation_run_links (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  link_type   TEXT NOT NULL,                    -- 'resource' para notas/artefactos vinculados
  link_id     TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);
```

Índices notables: `idx_automation_runs_status`, `idx_automation_runs_owner`
(`owner_type, owner_id, updated_at`), `idx_automation_runs_session`,
`idx_automation_runs_automation`, `idx_automation_run_steps_run`.

> DuckDB **no soporta `ON DELETE CASCADE`**; las cascades (steps y links
> de un run purgado) se hacen explícitamente en
> `electron/agents/run-retention.cjs:purgeExpiredRuns`.

### 4.2 Tablas por superficie

Las tablas de definición de cada owner viven en otras migraciones:

- **Agentes**: `agent_folders`, `many_agents`, `many_agent_versions`,
  `agent_store`, `ai_skills` →
  `electron/core/db/migrations/0005_agents.cjs`.
- **Workflows**: `workflow_folders`, `canvas_workflows`,
  `workflow_executions`, `automation_definitions`,
  `automation_artifact_bindings` → `0006_workflows.cjs`.
- **Chat (sesiones JSONL)**: gestionado por
  `electron/agents/dome-harness-bridge.cjs` con `JsonlSessionRepo` en
  `userData/agent-sessions/`, no en DuckDB.

### 4.3 Stale recovery (boot)

`runEngine.init()` llama a `recoverStuckRuns()` (`run-engine.cjs:1246`)
al arrancar y limpia tres categorías de runs zombi:

| Estado previo | Cutoff | Resultado |
|---------------|--------|-----------|
| `running` sin heartbeat | 120 s (`RUN_RECOVERY_STALE_MS`) | `failed` + `"Interrupted - the app was restarted while this run was active."` |
| `queued` sin arrancar | 5 min (`RUN_QUEUED_ORPHAN_MS`) | `failed` + `"Orphaned — the app was restarted before this run started."` |
| `waiting_approval` | 7 días (`RUN_WAITING_APPROVAL_STALE_MS`) | `cancelled` + `"Cancelled — approval was not completed within 7 days."` |

---

## 5. Canales IPC

Definidos en `electron/ipc/agents/runs.cjs` y dados de alta en
`electron/preload.cjs` (`ALLOWED_CHANNELS.invoke` y `.on`).

### 5.1 Renderer → Main (`window.electron.invoke`)

| Canal | Parámetros | Backend | Descripción |
|-------|-----------|---------|-------------|
| `runs:get` | `runId: string` | `runEngine.getRun` | Run + `steps[]` + `links[]`. |
| `runs:list` | `{ sessionId?, automationId?, ownerType?, ownerId?, projectId?, limit? }` | `runEngine.listRuns` | Filtros por sesión / automation / owner / proyecto; `limit` clamp `[1, 100]`. |
| `runs:getActiveBySession` | `sessionId: string` | `runEngine.getActiveRunBySession` | Run activo (queued/running/waiting_approval) de una sesión. |
| `runs:start` | `RunParams` | `runEngine.startAgentRun` | Inicia run de agente (`ownerType: 'many' | 'agent'`). Reemplaza el antiguo `runs:startLangGraph`. |
| `runs:startWorkflow` | `WorkflowRunParams` | `runEngine.startWorkflowRun` | Inicia run de workflow del Agent Canvas. |
| `runs:resume` | `{ runId, decisions[] }` | `runEngine.resumeRun` | Reanuda run en `waiting_approval` con `decisions: [{type:'approve'|'reject'|'edit', …}]`. |
| `runs:abort` | `runId: string` | `runEngine.abortRun` | Aborta el run (`AbortController.abort()`, status → `cancelled`). |
| `runs:delete` | `runId: string` | `runEngine.deleteRun` | Borra fila (con `runs:updated {deleted:true}` broadcast). |
| `automations:get` / `:list` / `:upsert` / `:delete` / `:runNow` / `:notifyContext` | varios | `runEngine.getAutomation` / `getAutomationList` (interno) / `upsertAutomation` / `deleteAutomation` / `startAutomationNow` / `fireContextualAutomations` | CRUD + disparo manual + disparo contextual (ver [automations.md](./automations.md)). |

> El renombrado `runs:cancel` → `runs:abort` y `runs:startLangGraph` →
> `runs:start` ocurrió al fusionar el run-engine con el runtime nativo
> (`@dome/agent-core`). El preload no expone los canales antiguos.

### 5.2 Main → Renderer (push)

Definidos como constantes en `electron/agents/run-store.cjs:11-13` y
emitidos por `windowManager.broadcast(...)`:

| Canal | Payload (shape) | Origen |
|-------|-----------------|--------|
| `runs:updated` | `{ run: AutomationRun }` (o `{run, deleted:true}` en `runs:delete`) | `createRun`, `patchRun`, `deleteRun` |
| `runs:step` | `{ step: AutomationRunStep }` | `appendRunStep`, `updateRunStep` |
| `runs:chunk` | `{ runId, type, … }` con `type ∈ {'text','thinking','tool_call','tool_result','usage','budget','compaction','interrupt','error','done'}` | `createRunChunkEmitter` (chunk emitter del run-engine) |

### 5.3 Suscripción desde el renderer

```typescript
// app/lib/automations/api.ts envuelve los canales con tipos
import { useAgentRunStream } from '@/lib/runs';

const unsubStatus = window.electron.on('runs:updated', (data) => {
  if (data.deleted) {
    removeRunFromStore(data.run.id);
    return;
  }
  upsertRunInStore(data.run); // { id, status, outputText, error, metadata, … }
});

const unsubChunk = window.electron.on('runs:chunk', (data) => {
  if (data.runId !== runId) return;
  if (data.type === 'text')     appendOutput(data.text);
  if (data.type === 'thinking') appendThinking(data.text);
  if (data.type === 'tool_call') showToolCall(data.toolCall);
  if (data.type === 'usage')     updateBudget(data.usage);
  if (data.type === 'interrupt') showApprovalCard(data.actionRequests);
  if (data.type === 'done')      unsubChunk();
});

const unsubStep = window.electron.on('runs:step', (data) => {
  appendTimelineEntry(data.step); // step_type, status, content, …
});

return () => { unsubStatus(); unsubChunk(); unsubStep(); };
```

Componentes principales: `RunLogView` (timeline con steps + chunks),
`RunsWorkspaceView` (lista filtrada), `RunStatusBadge`, `RunProgress`,
`RunStepList`. Todos se mantienen en Zustand (`app/lib/store/runs.ts`) y
usan `useAgentRunStream` para la suscripción + cleanup.

---

## 6. Ejecución de workflows (DAG)

`electron/agents/workflow-executor.cjs` resuelve cada nodo del
`canvas_workflows` mediante `topologicalLevels(nodes, edges)`
(`workflow-dag.cjs`) y ejecuta cada nivel con `Promise.all`.

```
for (const level of topologicalLevels(workflow.nodes, workflow.edges)) {
  if (aborted || !getRun(runId)) break;
  const results = await Promise.all(
    level.map((node) => runNodeWithRetry(nodeRunners.get(node.id))),
  );
  for (const result of results) Object.assign(state.payloads, result.payloads);
}
```

- **Tipos de nodo** manejados por `nodeRunners`:
  - `text-input` / `document` / `image` → payload estático (sin LLM).
  - `agent` → `agentRuntime.runDomeAgent('workflows', …)` con la persona
    del agente (`resolveWorkflowAgent`), tools filtradas, threadId
    `${runId}_${nodeId}` (un JSONL por nodo, huérfano del historial de
    Many).
  - `output` → acumula el output final del workflow (`mergePayloads`).
- **Reintentos por nodo** (`runNodeWithRetry`): hasta 3 intentos con
  backoff exponencial `500 ms · 2^(n-1) · (1 + jitter 0.1)` solo para
  errores transitorios (`rate limit | timeout | network | econnreset |
  socket hang up`).
- **Progreso**: `metadata.progress = { total, completed, percent,
  completedNodeIds[] }` se parchea en cada nodo completado vía
  `syncWorkflowProgress`.
- **Sin checkpointing**: workflows no se reanudan a mitad de grafo tras
  un restart (a diferencia de las sesiones de chat, que sí usan JSONL
  persistente por thread).
- **Side effects**: cuando `outputMode ∈ {'note','mixed'}` y hay
  `finalOutput`, se crea un `resources` con `createNoteResource` y se
  enlaza vía `automation_run_links` (`link_type='resource'`).

---

## 7. Retención de runs

`electron/agents/run-retention.cjs` purga runs terminales vencidos.

- **Configuración**: setting `runs_retention_days` (defecto 90; `<= 0`
  desactiva).
- **Ciclo**: `STARTUP_DELAY_MS = 30 s` después del init + `setInterval`
  diario (`PURGE_INTERVAL_MS = 24 h`).
- **Algoritmo** (`purgeExpiredRuns`):
  1. `SELECT id, owner_type FROM automation_runs WHERE status IN
     ('completed','failed','cancelled') AND updated_at < cutoff`.
  2. Para `owner_type='workflow'`, eliminar primero las sesiones JSONL
     huérfanas (`${runId}_${nodeId}`) para que un fallo de borrado no
     deje la sesión reapareciendo en el historial de Many.
  3. `db.transaction(async (tx) => { for (id of purgeable)
     tx.run('DELETE FROM automation_runs WHERE id = ?', [id]); })`.
  4. `DELETE FROM feeder_runs WHERE status IN ('completed','failed')
     AND started_at < cutoff` (independiente, vía
     `electron/agents/automation-service.cjs` lo considera "busy").

Pasos (`automation_run_steps`) y links (`automation_run_links`) se
eliminan por separado en código — DuckDB no soporta `ON DELETE CASCADE`
en estas FKs.

---

## 8. Suscripción a un run específico (patrón renderer)

```typescript
import { startAgentRun, getRun } from '@/lib/automations/api';
import { useAgentRunStream } from '@/lib/runs/useAgentRunStream';

// 1. Arrancar
const runId = await startAgentRun({
  ownerType: 'agent',
  ownerId: 'research',
  title: 'Investiga las últimas tendencias en IA',
  messages: [{ role: 'user', content: '…' }],
});

// 2. Suscribirse (cleanup automático al desmontar)
useAgentRunStream(runId, {
  onChunk:  (chunk) => appendToOutput(chunk),
  onStep:   (step)  => appendTimeline(step),
  onStatus: (run)   => updateRunStatus(run.status),
  onDone:   (run)   => {
    if (run.status === 'completed')     showSummary(run.summary);
    if (run.status === 'failed')        showError(run.error);
    if (run.status === 'cancelled')     showCancel();
    if (run.status === 'waiting_approval') openApprovalCard(run.metadata.pendingApproval);
  },
});

// 3. Cancelar (renderer → main)
await window.electron.invoke('runs:abort', runId);
```

---

## Ver también

- [automations.md](./automations.md) — definición y CRUD de automatizaciones.
- [agent-canvas.md](./agent-canvas.md) — workflows del Canvas (origen de
  los `canvas_workflows` que ejecuta el workflow-executor).
- [docs/architecture/harness-and-subagents.md](../architecture/harness-and-subagents.md) —
  runtime de agente (`@dome/agent-core`), HITL, sub-agentes
  (`task` / `delegate_to_agent`).
- [docs/architecture/agent-runtime.md](../architecture/agent-runtime.md) —
  `agent-runtime.cjs`, eventos `AgentEvent` mapeados a chunks, compactación.
- [docs/architecture/ipc-channels.md](../architecture/ipc-channels.md) —
  tabla maestra de todos los canales IPC.