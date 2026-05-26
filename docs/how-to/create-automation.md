# How to Create an Automation

Automations are scheduled rules that run an **agent**, a **workflow** or a **feeder** on a recurring cadence. They are managed through the **Automations Hub** tab and stored in your local SQLite database (`automation_definitions`).

---

## Creating an automation from the UI

1. Open the **Automations** tab in the Hub.
2. Click **New**.
3. Pick a **Destination** (target):
   - **Agent** — runs a LangGraph agent and saves the run in `automation_runs`.
   - **Workflow** — runs a canvas workflow node graph.
   - **Feeder** — runs an approved sandboxed script that merges JSON into an artifact (no LLM). The selector lists all feeders across all artifacts; only `approved` + `enabled` ones are pickable.
4. Fill in:
   - **Name** — human-readable label.
   - **Trigger** — `manual` | `scheduled` | `contextual` (see below).
   - **Prompt** / **Output mode** / **Artifact bindings** — only relevant for agent and workflow targets. Hidden for feeders (the feeder script owns the data merge).
5. Toggle it on.

### Refrescar un feeder cada N minutos (caso iDRAC)

1. Crea el artefacto y su feeder desde la pestaña **Feeders** del artefacto.
2. Aprueba el feeder y verifica que se ejecuta manualmente.
3. En **Automations → New**:
   - **Destination**: `Feeder` y selecciona el feeder.
   - **Name**: `iDRAC Auto Refresh` (lo que quieras).
   - **Trigger**: `Scheduled` con **Cadence = «cada N minutos»** y `intervalMinutes = 5`.
4. Guarda con el toggle activado. El tick de 60s detectará el `cron-lite` y ejecutará `runFeeder` con `triggeredBy: 'automation'`.

---

## Schedule types

| Cadence | Description | Example |
|---------|-------------|---------|
| `daily` | Runs every day at a fixed hour | Every day at 08:00 |
| `weekly` | Runs on a specific weekday at a fixed hour | Every Monday at 09:00 |
| `cron-lite` | Runs every N minutes | Every 30 minutes |

### Schedule object shape

```json
{
  "cadence": "daily",
  "hour": 8,
  "weekday": 1,
  "intervalMinutes": 30
}
```

- `hour` (0–23): used by `daily` and `weekly`.
- `weekday` (0 = Sunday … 6 = Saturday): used by `weekly` only.
- `intervalMinutes`: used by `cron-lite` only.

---

## Output modes

| Mode | Description |
|------|-------------|
| `chat_only` | Result shown in the Many chat panel, not saved |
| `note` | Result saved as a new note resource in the library |
| `studio_output` | Result written to a Studio canvas output |
| `mixed` | Result shown in chat AND saved as a note |

---

## Automation data model

```typescript
interface Automation {
  id: string;                  // generated UUID
  name: string;
  enabled: boolean;
  triggerType: 'schedule';
  schedule: {
    cadence: 'daily' | 'weekly' | 'cron-lite';
    hour: number;              // 0–23
    weekday?: number;          // 0–6 (weekly only)
    intervalMinutes?: number;  // cron-lite only
  };
  agentId?: string;            // custom agent ID
  systemAgentId?: string;      // built-in agent (e.g. 'many')
  prompt: string;              // instruction for the agent
  outputMode: 'chat_only' | 'note' | 'studio_output' | 'mixed';
  outputFolderId?: string;     // folder for note output
  lastRunAt?: number;          // unix ms
  createdAt: string;           // ISO date
  updatedAt: string;           // ISO date
}
```

---

## IPC channels (for programmatic creation)

The real channels (renderer → main) are:

```typescript
// List
const automations = await window.electron.invoke('automations:list', { projectId });

// Create or update (single channel — no separate create/update/toggle)
const created = await window.electron.invoke('automations:upsert', {
  title: 'Daily News Digest',
  projectId,
  targetType: 'agent',       // 'agent' | 'workflow' | 'feeder'
  targetId: '<agentId>',
  triggerType: 'schedule',
  enabled: true,
  schedule: { cadence: 'daily', hour: 8 },
  inputTemplate: { prompt: 'Search ...' },
  outputMode: 'chat_only',
});

// Run immediately
await window.electron.invoke('automations:runNow', created.id);

// Delete
await window.electron.invoke('automations:delete', created.id);
```

### Feeder refresh example

```typescript
await window.electron.invoke('automations:upsert', {
  title: 'iDRAC Auto Refresh',
  projectId,
  targetType: 'feeder',
  targetId: '<feeders.id>',
  triggerType: 'schedule',
  enabled: true,
  schedule: { cadence: 'cron-lite', intervalMinutes: 5 },
  // No prompt / outputMode / artifactBindings — feeders ignore them.
});
```

---

## Example automations

### Daily research digest

```json
{
  "name": "Daily AI News",
  "enabled": true,
  "triggerType": "schedule",
  "schedule": { "cadence": "daily", "hour": 8 },
  "systemAgentId": "many",
  "prompt": "Search the web for the 5 most important AI and technology news stories from the last 24 hours. Summarize each in 2–3 sentences with a source link.",
  "outputMode": "note"
}
```

### Weekly review

```json
{
  "name": "Weekly Progress Review",
  "enabled": true,
  "triggerType": "schedule",
  "schedule": { "cadence": "weekly", "hour": 9, "weekday": 1 },
  "systemAgentId": "many",
  "prompt": "Look at my notes and resources created this week. Write a brief summary of what I worked on and suggest 3 follow-up actions.",
  "outputMode": "mixed"
}
```
