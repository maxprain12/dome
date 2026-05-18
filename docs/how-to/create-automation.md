# How to Create an Automation

Automations are scheduled rules that run an agent on a recurring cadence and save the output to your library or chat. They are managed through the **Automations** UI (Settings → Automations) and stored in your local SQLite database.

---

## Creating an automation from the UI

1. Open **Settings → Automations**.
2. Click **New Automation**.
3. Fill in:
   - **Name** — human-readable label.
   - **Agent** — which agent will run (your installed agents or a system agent).
   - **Prompt** — the instruction sent to the agent on each run.
   - **Schedule** — when to run (see below).
   - **Output mode** — where the result goes (see below).
4. Toggle the automation on.

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

If you need to create automations from code (e.g. an agent tool or a plugin), use these IPC channels from the renderer:

```typescript
// List all automations
const automations = await window.electron.invoke('automations:list');

// Create a new automation
const created = await window.electron.invoke('automations:create', {
  name: 'Daily News Digest',
  enabled: true,
  triggerType: 'schedule',
  schedule: { cadence: 'daily', hour: 8 },
  systemAgentId: 'many',
  prompt: 'Search the web for the top 5 AI news stories today and summarize them as bullet points.',
  outputMode: 'note',
});

// Toggle on/off
await window.electron.invoke('automations:toggle', { id: created.id, enabled: false });

// Run immediately
await window.electron.invoke('automations:runNow', { id: created.id });

// Delete
await window.electron.invoke('automations:delete', { id: created.id });
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
