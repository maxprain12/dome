# Run Engine

Documentación del Run Engine de Dome: motor de ejecución de agentes en background con persistencia de estado.

---

## ¿Qué es el Run Engine?

El **Run Engine** (`electron/run-engine.cjs`) es el componente central que ejecuta agentes de IA de forma asíncrona, persistiendo el estado de cada ejecución en SQLite y emitiendo eventos en tiempo real al renderer.

Todos los tipos de ejecución pasan por el Run Engine:
- Automatizaciones programadas
- Runs de Agent Canvas (workflows)
- Conversaciones de Agent Teams
- Runs manuales desde la UI

---

## Ciclo de vida de un Run

```
         startRun()
              │
              ▼
         ┌─────────┐
         │ queued  │  ← en cola, esperando recursos
         └────┬────┘
              │
              ▼
         ┌─────────┐
         │ running │  ← ejecutando agente LangGraph
         └────┬────┘
              │
     ┌────────┼────────┬──────────────┐
     ▼        ▼        ▼              ▼
┌──────────┐ ┌───────┐ ┌──────────┐ ┌──────────────────┐
│completed │ │failed │ │cancelled │ │waiting_approval  │
└──────────┘ └───────┘ └──────────┘ └──────────────────┘
                                           │
                                    resumeRun(decisions)
                                           │
                                           ▼
                                       running → completed
```

### Estados

| Estado | Descripción |
|--------|-------------|
| `queued` | El run fue creado pero aún no empezó a ejecutarse |
| `running` | Agente activamente ejecutando |
| `completed` | Terminó con éxito |
| `failed` | Terminó con error |
| `cancelled` | Cancelado por el usuario |
| `waiting_approval` | Pausa esperando aprobación del usuario para continuar |

---

## Tipos de Run

### LangGraph Run

Ejecuta un grafo LangGraph con un agente específico:

```javascript
const runId = await runEngine.startLangGraphRun({
  agentId: 'research',         // ID del agente del sistema o personalizado
  prompt: 'Investiga sobre X',
  sessionId: 'chat-session-123',
  outputMode: 'note',
  outputFolderId: 'folder-456',
  aiConfig: { provider, model, apiKey },
  tools: getToolDefinitionsByIds(toolIds),
});
```

### Workflow Run

Ejecuta un workflow del Agent Canvas:

```javascript
const runId = runEngine.startWorkflowRun({
  workflowId: 'workflow-789',
  inputData: { text: 'Input del usuario' },
  sessionId: 'canvas-session-abc',
});
```

### Automation Run

Iniciado por el automation-service:

```javascript
await runEngine.startAutomationNow(automationId);
// → crea un LangGraph run con la config de la automatización
```

---

## Agentes del sistema

El Run Engine incluye 6 agentes de sistema preconfigurados:

| ID | Nombre | Herramientas | Especialidad |
|----|--------|-------------|-------------|
| `research` | Research Agent | web_search, web_fetch, deep_research | Investigación en internet |
| `library` | Library Agent | resource_search, resource_get, resource_semantic_search | Búsqueda en biblioteca Dome |
| `writer` | Writer Agent | resource_create, resource_update | Creación y edición de contenido |
| `data` | Data Agent | excel_get, excel_set_*, resource_get | Análisis de datos y tablas |
| `presenter` | Presenter Agent | ppt_create, ppt_get_slides, resource_create | Presentaciones |
| `curator` | Curator Agent | get_related_resources, semantic_search, flashcard_create | Organización del conocimiento |

---

## IPC Channels

### Renderer → Main

| Canal | Parámetros | Descripción |
|-------|-----------|-------------|
| `runs:get` | `runId: string` | Obtener run por ID |
| `runs:list` | `{ automationId?, sessionId?, status?, limit? }` | Listar runs con filtros |
| `runs:getActiveBySession` | `sessionId: string` | Run activo de una sesión |
| `runs:startLangGraph` | `RunParams` | Iniciar run de agente |
| `runs:startWorkflow` | `WorkflowRunParams` | Iniciar run de workflow |
| `runs:cancel` | `runId: string` | Cancelar run activo |
| `runs:resume` | `{ runId, decisions[] }` | Reanudar run con decisiones del usuario |
| `runs:listAutomations` | — | Lista automations del run engine |
| `runs:createAutomation` | `AutomationConfig` | Crear automatización |
| `runs:updateAutomation` | `{ id, updates }` | Actualizar automatización |
| `runs:deleteAutomation` | `id` | Eliminar automatización |
| `runs:toggleAutomation` | `{ id, enabled }` | Activar/desactivar |
| `runs:startAutomationNow` | `id` | Ejecutar ahora |

### Main → Renderer (eventos push)

| Canal | Payload | Descripción |
|-------|---------|-------------|
| `runs:updated` | `{ runId, status, ... }` | Cambio de estado del run |
| `runs:step` | `{ runId, step, agentId, ... }` | Paso del agente completado |
| `runs:chunk` | `{ runId, text }` | Chunk de texto streaming |

### Suscribirse a eventos en el renderer

```typescript
// app/ — suscribirse a updates de runs
const unsub = window.electron.on('runs:updated', (data) => {
  const { runId, status } = data;
  updateRunInStore(runId, { status });
});

// cleanup al desmontar
return () => unsub();
```

---

## SQLite schema

```sql
CREATE TABLE runs (
  id           TEXT PRIMARY KEY,
  automationId TEXT,              -- null si es run manual
  sessionId    TEXT,              -- chat session o canvas session
  status       TEXT NOT NULL,     -- queued|running|completed|failed|cancelled|waiting_approval
  agentId      TEXT,
  systemAgentId TEXT,
  prompt       TEXT,
  outputMode   TEXT,
  outputFolderId TEXT,
  result       TEXT,              -- JSON output del run
  error        TEXT,              -- mensaje de error si falló
  steps        TEXT,              -- JSON array de pasos ejecutados
  startedAt    INTEGER,
  finishedAt   INTEGER,
  createdAt    TEXT
);
```

---

## UI Components

| Componente | Descripción |
|-----------|-------------|
| `RunLogView` | Historial de runs con logs expandibles |
| `RunStatusBadge` | Badge de estado inline (queued/running/completed/...) |
| `RunProgress` | Barra de progreso para runs en curso |
| `RunStepList` | Lista de pasos del agente con timestamps |

El `RunLogView` se actualiza en tiempo real via IPC `runs:updated` y `runs:step`.

---

## Ejemplo: seguir un run en tiempo real

```typescript
// Iniciar run
const { data: runId } = await window.electron.invoke('runs:startLangGraph', {
  systemAgentId: 'research',
  prompt: 'Investiga las últimas tendencias en IA',
  outputMode: 'note',
});

// Escuchar updates
const unsub = window.electron.on('runs:updated', (data) => {
  if (data.runId !== runId) return;
  console.log('Estado:', data.status);
  if (['completed', 'failed', 'cancelled'].includes(data.status)) {
    unsub(); // dejar de escuchar
  }
});

// Escuchar streaming
const unsubChunk = window.electron.on('runs:chunk', (data) => {
  if (data.runId !== runId) return;
  appendToOutput(data.text);
});
```

---

*Ver también: [automations.md](./automations.md) para la configuración de automatizaciones programadas.*
