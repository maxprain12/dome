# Automatizaciones

Documentación del sistema de automatizaciones de Dome: reglas programadas que ejecutan agentes de IA de forma autónoma.

---

## Concepto

Las **automatizaciones** son reglas `trigger → acción` que Dome ejecuta automáticamente según un horario. Permiten delegar tareas repetitivas a agentes IA: resumir noticias diarias, actualizar notas, enviar reportes, etc.

```
┌──────────────┐  tick cada 60s  ┌────────────────┐  run engine  ┌──────────────┐
│ automation-  │ ─────────────── │  ¿está en hora │ ──────────── │  run-engine  │
│ service.cjs  │                 │  y habilitada? │              │    .cjs      │
└──────────────┘                 └────────────────┘              └──────────────┘
```

---

## Estructura de datos

```typescript
interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: 'schedule';         // actualmente solo scheduled
  schedule: ScheduleConfig;
  agentId?: string;                // agente personalizado (null = Martin/Many)
  systemAgentId?: string;          // research | library | writer | data | presenter | curator
  prompt: string;                  // instrucción para el agente
  outputMode: 'chat_only' | 'note' | 'studio_output' | 'mixed';
  outputFolderId?: string;         // carpeta donde guardar resultados
  lastRunAt?: number;              // timestamp del último run
  createdAt: string;
  updatedAt: string;
}

interface ScheduleConfig {
  cadence: 'daily' | 'weekly' | 'cron-lite';
  hour: number;                    // 0-23
  weekday?: number;                // 1=Lunes ... 7=Domingo (solo weekly)
  intervalMinutes?: number;        // solo cron-lite
}
```

---

## Tipos de trigger

### Daily (diario)

Ejecuta la automatización una vez al día a la hora indicada.

```json
{
  "cadence": "daily",
  "hour": 8
}
```

→ Se ejecuta cada día a las 8:00 AM (hora local).

### Weekly (semanal)

Una vez a la semana, un día específico a la hora indicada.

```json
{
  "cadence": "weekly",
  "hour": 9,
  "weekday": 1
}
```

→ Cada lunes a las 9:00 AM.

### Cron-lite (cada N minutos)

Para automatizaciones que deben ejecutarse con alta frecuencia.

```json
{
  "cadence": "cron-lite",
  "intervalMinutes": 30
}
```

→ Cada 30 minutos.

> **Importante:** `intervalMinutes` **solo se respeta cuando `cadence === 'cron-lite'`**. Si envías `{ intervalMinutes: 30 }` sin `cadence`, la automatización caerá a `daily` y no se ejecutará cada 30 minutos. La UI Hub fuerza `hour: 0` para cron-lite para evitar la puerta de "hora más temprana" que aplica a `daily`/`weekly`.

---

## Target types

Una automatización ejecuta su acción según `targetType`:

| `targetType` | Acción | LLM | Comentario |
|---|---|---|---|
| `agent` | LangGraph agent | Sí | Recibe `inputTemplate.prompt`. Persiste en `automation_runs`. |
| `many` | LangGraph (owner `many`) | Sí | Variante de `agent`. |
| `workflow` | Canvas workflow | Sí (nodos agente) | Persiste en `automation_runs`. |
| `feeder` | Script sandbox (`feeder-runner`) | **No** | Refresca el JSON de un artefacto. Persiste en `feeder_runs`. |

### Target `feeder` — refresco periódico de artefacto

Permite programar la ejecución de un **feeder** (script Python/Node/Bash/curl aprobado que merge JSON en un artefacto). Ideal para dashboards de monitorización (iDRAC, Redfish, APIs LAN) que necesitan refresco automático cada N minutos.

Payload mínimo (`automations:upsert`):

```json
{
  "title": "iDRAC refresh",
  "targetType": "feeder",
  "targetId": "<feeders.id UUID>",
  "triggerType": "schedule",
  "enabled": true,
  "schedule": { "cadence": "cron-lite", "intervalMinutes": 5 }
}
```

Notas:
- El feeder debe estar `approved=true` y `enabled=true` para que `run-engine.runFeeder` lo acepte.
- `inputTemplate.prompt`, `artifactBindings` y `outputMode` se ignoran (el script controla el merge directamente).
- Los runs aparecen en `feeder_runs` (no en `automation_runs`) y se ven en la pestaña Feeders del artefacto vinculado.

---

## Output modes


| Modo            | Descripción                                                      |
| --------------- | ---------------------------------------------------------------- |
| `chat_only`     | El resultado solo aparece en el historial de runs (no crea nota) |
| `note`          | Crea/actualiza una nota en Dome con el output                    |
| `studio_output` | Genera contenido de studio (mindmap, quiz, etc.)                 |
| `mixed`         | Combina nota + output del chat                                   |


---

## Tick loop (`electron/automation-service.cjs`)

El servicio de automatización comprueba cada 60 segundos si hay automatizaciones que ejecutar:

```javascript
// Lógica de isDue()
function isDue(automation, timestamp) {
  // 1. ¿Está habilitada?
  if (!automation.enabled) return false;

  // 2. ¿Tipo schedule?
  if (automation.triggerType !== 'schedule') return false;

  // 3. Según cadencia:
  //    - daily:    ¿pasó el día desde el último run?
  //    - weekly:   ¿es el weekday correcto y pasó la semana?
  //    - cron-lite: ¿pasaron los N minutos?
}
```

Si la automatización está actualmente en ejecución, se **salta** para evitar ejecuciones concurrentes. Para `targetType: 'feeder'` el chequeo también consulta `feeder_runs` (que es la tabla que usa el feeder-runner), de modo que un feeder ya corriendo no se vuelve a disparar:

```javascript
function isAutomationBusy(automation) {
  const runs = runEngine.listRuns({ automationId: automation.id, limit: 5 });
  if (runs.some(r => ['queued','running','waiting_approval'].includes(r.status))) return true;
  if (automation.targetType === 'feeder') {
    const row = db.getQueries().countRunningFeederRunsByAutomation.get(automation.id);
    if (row && row.c > 0) return true;
  }
  return false;
}
```

---

## IPC Channels

| Canal                | Parámetros                          | Descripción                                    |
| -------------------- | ----------------------------------- | ---------------------------------------------- |
| `automations:list`   | `{ targetType?, targetId?, projectId? }` | Lista (con filtros opcionales)            |
| `automations:get`    | `id`                                | Obtener por ID                                 |
| `automations:upsert` | `SaveAutomationPayload`             | Crear o actualizar (incluye `artifactBindings`) |
| `automations:delete` | `id`                                | Eliminar                                       |
| `automations:runNow` | `id`                                | Ejecutar inmediatamente                        |
| `automations:notifyContext` | `{ tag, ... }`               | Disparo de triggers contextuales               |

> El `enabled` se setea desde el propio payload de `upsert`; no hay canal `toggle` separado.


Los resultados de ejecución se gestionan via `runs:*` (ver [runs.md](./runs.md)).

---

## UI Components


| Componente        | Ubicación                     | Descripción                         |
| ----------------- | ----------------------------- | ----------------------------------- |
| `AutomationsView` | `app/components/automations/` | Lista y gestión de automatizaciones |
| `AutomationForm`  | `app/components/automations/` | Crear/editar automatización         |
| `RunLogView`      | `app/components/automations/` | Ver historial de ejecuciones        |


---

## SQLite schema

```sql
CREATE TABLE automations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  enabled     INTEGER DEFAULT 1,
  triggerType TEXT DEFAULT 'schedule',
  schedule    TEXT,           -- JSON: { cadence, hour, weekday?, intervalMinutes? }
  agentId     TEXT,
  systemAgentId TEXT,
  prompt      TEXT NOT NULL,
  outputMode  TEXT DEFAULT 'chat_only',
  outputFolderId TEXT,
  lastRunAt   INTEGER,
  createdAt   TEXT,
  updatedAt   TEXT
);
```

---

## Casos de uso habituales

### Resumen diario de noticias

```
Cadencia: Daily, 8:00 AM
Agente: Research Agent
Prompt: "Busca las últimas noticias sobre [tema] y crea un resumen con los 5 puntos más importantes"
Output: note → carpeta "Daily Digest"
```

### Revisión semanal de objetivos

```
Cadencia: Weekly, Lunes 9:00 AM
Agente: Library Agent
Prompt: "Revisa mis notas de la semana pasada y genera un resumen de progreso hacia mis objetivos"
Output: note
```

### Monitor cada 30 minutos

```
Cadencia: Cron-lite, 30 minutos
Agente: Research Agent
Prompt: "Comprueba si hay novedades sobre [tema crítico] y avisa si hay algo urgente"
Output: chat_only
```

---

## 🔜 Triggers planificados (Fase 2)

Los siguientes tipos de trigger están planificados pero no implementados:


| Trigger               | Descripción                              |
| --------------------- | ---------------------------------------- |
| `on_resource_added`   | Al añadir un nuevo recurso a un proyecto |
| `on_note_updated`     | Al modificar una nota específica         |
| `on_calendar_event`   | Al crearse o modificarse un evento       |
| `on_webhook`          | Al recibir una webhook HTTP externa      |


---

## Provider matrix — social comment → DM (plan 014)

Regla objetivo: comentario con hashtag (p. ej. `#Curso`) → DM con enlace.

**STOP condition aplicada (014):** se envió draft_only + matrix sin adapters.

**Estado 018:** adapters `listComments` + `sendDm` implementados para Instagram, LinkedIn y X; poller cada 5 min; mode default `live` + cold DM. El envío real sigue dependiendo de productos/App Review/tier de cada red — si la API rechaza, el draft queda en `failed` (nunca se finge éxito).

| Provider | Listar comentarios | Enviar DM | Contadores | Scopes / notas |
|----------|-------------------|-----------|------------|----------------|
| LinkedIn | Sí (`socialActions/.../comments`) | Sí (best-effort `rest/messages` + legacy) | Sí | Org CMA recomendado; messaging a menudo partner-gated |
| Instagram | Sí (`/{media}/comments`) | Sí (`/{ig-user}/messages`) | Sí | Requiere `manage_comments` + `manage_messages` + reconnect |
| X | Sí (search `conversation_id`) | Sí (`dm_conversations/with/.../messages`) | Sí | Requiere `dm.read`/`dm.write` + tier API adecuado |

Código: `provider-capabilities.cjs`, `social-messaging.cjs`, `providers/*.cjs`, poller en `social-service.cjs`, IPC `social:drafts:*` / `social:live-reply-rules:*`, UI Monitor.

---

*Ver también: [runs.md](./runs.md) para la documentación del Run Engine.*

## KB LLM (wiki compilada)

Plantillas de prompt para agentes y automatizaciones:

- [`packages/prompts/surfaces/kb-wiki/compile.md`](../packages/prompts/surfaces/kb-wiki/compile.md) — compilación incremental de la wiki
- [`packages/prompts/surfaces/kb-wiki/health.md`](../packages/prompts/surfaces/kb-wiki/health.md) — lint / salud del corpus

Modelo de metadatos: [kb-llm-wiki-model.md](./kb-llm-wiki-model.md).