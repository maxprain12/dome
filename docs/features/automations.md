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

Si la automatización está actualmente en ejecución (`queued`, `running`, o `waiting_approval`), se **salta** para evitar ejecuciones concurrentes:

```javascript
function isAutomationBusy(automationId) {
  const runs = runEngine.listRuns({ automationId, limit: 5 });
  return runs.some(run => ['queued', 'running', 'waiting_approval'].includes(run.status));
}
```

---

## IPC Channels


| Canal                | Parámetros         | Descripción                      |
| -------------------- | ------------------ | -------------------------------- |
| `automations:list`   | —                  | Lista todas las automatizaciones |
| `automations:get`    | `id`               | Obtener automatización por ID    |
| `automations:create` | `AutomationConfig` | Crear nueva automatización       |
| `automations:update` | `id, updates`      | Actualizar automatización        |
| `automations:delete` | `id`               | Eliminar automatización          |
| `automations:toggle` | `id, enabled`      | Activar/desactivar               |
| `automations:runNow` | `id`               | Ejecutar inmediatamente          |


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
| `on_whatsapp_message` | Al recibir un mensaje de WhatsApp        |


---

*Ver también: [runs.md](./runs.md) para la documentación del Run Engine.*

## KB LLM (wiki compilada)

Plantillas de prompt para agentes y automatizaciones:

- [prompts/kb-wiki-compile.md](../prompts/kb-wiki-compile.md) — compilación incremental de la wiki
- [prompts/kb-wiki-health.md](../prompts/kb-wiki-health.md) — lint / salud del corpus

Modelo de metadatos: [kb-llm-wiki-model.md](./kb-llm-wiki-model.md).