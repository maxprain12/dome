# T05 — Windows startup hang / high RAM (v2.5.x)

**Prioridad**: P0 · **Severidad**: Alta · **Área**: Rendimiento / Windows
**Estado**: ✅ Implementado (2026-06-20) — ver CHANGELOG unreleased y `scripts/windows-startup-diag.mjs`.

## Problema

Tras v2.5.x, en Windows Dome puede quedar en "Cargando..." con ~6–7 GB RAM al abrir, incluso tras matar el proceso desde el Administrador de tareas. No depende de la bandeja del sistema.

## Causas probables (código)

1. **Tormenta de arranque** — `automationService.init()` ejecutaba `tick()` al instante; `reindexAll` a los 5 s; GitHub sync a los 20 s; SQLite sin `busy_timeout`.
2. **Runs huérfanos `queued`** — tras crash no se recuperan; bloquean o confunden automations.
3. **MCP stdio** — `loadToolsForServer()` sin `client.close()` → procesos hijo acumulados.
4. **Correo / himalaya** — descarga del binario sin timeout; pestaña `email` restaurada desde `localStorage`.
5. **UI** — `ContentRouter` spinner infinito si `activeTab` huérfano o Suspense lazy sin timeout.

## Diagnóstico

```bash
node scripts/windows-startup-diag.mjs
node scripts/windows-startup-diag.mjs --db "%APPDATA%\dome\dome.duckdb"
```

Consultas útiles:

```sql
SELECT status, COUNT(*) FROM automation_runs GROUP BY status;
SELECT id, status, automation_id FROM automation_runs
  WHERE status IN ('queued','running','waiting_approval');
SELECT id, title, schedule_json FROM automation_definitions WHERE enabled = 1;
```

## Fixes implementados

- Backups automáticos: [`electron/core/db-backup.cjs`](electron/core/db-backup.cjs) + scheduler cada 6 h / startup / quit.
- Detección: `preflightRestoreIfCorrupt()` + `quick_check` tras init.
- Restauración: `restoreFromLatestBackup()` unifica `dome.duckdb.auto-*` y `dome.duckdb.backup-v*`.

Ver CHANGELOG unreleased.

## Criterios de aceptación

- [ ] Arranque interactivo < 3 s sin runs activos (Windows, DB mediana).
- [ ] RAM reposo < 1.5 GB sin agent runs.
- [ ] Ningún spinner central > 15 s sin fallback accionable.
- [ ] `node scripts/windows-startup-diag.mjs` documenta estado local sin errores.
