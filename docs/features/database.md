# Base de datos — SQLite en el main process

Dome persiste el estado de la app en **SQLite** (`better-sqlite3`) en el main process. El renderer **nunca** toca la DB directamente: usa IPC vía `app/lib/db/client.ts`.

**Schema HEAD:** `settings.schema_version = 61` (migraciones legacy) + journal Drizzle (`__drizzle_migrations`).

---

## Arquitectura en capas

```
Renderer (app/lib/db/client.ts)
        │  window.electron.invoke('db:*', …)
        ▼
IPC handlers (electron/ipc/data/*.cjs)
        │
        ├─► getQueries()          ← prepared statements (mayoría de dominios)
        ├─► getSettingsRepo()     ← Drizzle piloto (settings)
        ├─► getTagsRepo()         ← Drizzle piloto (tags)
        └─► runDbReadTask()       ← lecturas pesadas en worker thread
        │
        ▼
electron/core/database.cjs       ← fachada: getDB(), init, migraciones
        │
        ├─► electron/core/db/schema.cjs      — DDL base (install nueva)
        ├─► electron/core/db/migrations.cjs  — migraciones legacy 1…53
        ├─► electron/core/db/queries.cjs     — prepared statements
        ├─► electron/core/db/drizzle-bridge.cjs — post-v53: Drizzle + FTS
        ├─► electron/core/db/drizzle-repos.cjs  — adaptadores snake_case
        └─► electron/core/db/fts-schema.cjs     — FTS5 + triggers (SQL crudo)
        │
        ▼
packages/db (@dome/db)           — schema TypeScript, repos tipados, migrator Drizzle
```

### Reglas de diseño

| Regla | Detalle |
|-------|---------|
| **Un writer** | Una sola conexión `getDB()` en main; Drizzle envuelve la misma instancia |
| **Legacy primero** | `applyMigrations()` debe llegar a v53 antes de `runDrizzleMigrations()` |
| **FTS en SQL crudo** | Tablas virtuales FTS5 y triggers no van en Drizzle; viven en `fts-schema.cjs` |
| **Migración incremental** | Nuevos dominios → Drizzle por PR; ver [.claude/sops/drizzle-domain-migration.md](../../.claude/sops/drizzle-domain-migration.md) |
| **Offload de lecturas** | FTS híbrido, listados grandes → `electron/workers/db-read.worker.cjs` |

---

## Ubicación del archivo

| SO | Ruta |
|----|------|
| macOS | `~/Library/Application Support/dome/dome.db` |
| Windows | `%APPDATA%\dome\dome.db` |
| Linux | `~/.config/dome/dome.db` |

Backups automáticos antes de migrar: `dome.db.backup-v{N}-{timestamp}` (ver `electron/core/db-backup.cjs`; `LATEST_SCHEMA_VERSION = 53`).

---

## Flujo de arranque

1. `initDatabase()` — PRAGMAs (WAL, foreign_keys, synchronous NORMAL).
2. `createBaseSchema()` — tablas base si DB nueva.
3. `applyMigrations()` — runner legacy hasta v53 (transaccional + backup).
4. `runDrizzleMigrations()` — baseline Drizzle + deltas futuros; luego `ensureFtsSchema()`.
5. `scheduleDeferredDbMaintenance()` — `incremental_vacuum`, retención de runs, etc. (diferido post-arranque).
6. Al cerrar: `PRAGMA optimize` + `shutdownWorkers()`.

---

## Paquete `@dome/db`

Workspace en `packages/db/`:

| Ruta | Rol |
|------|-----|
| `src/schema/*.ts` | Tablas Drizzle reflejando HEAD v53 (core, agents, data, calendar, learn, …) |
| `src/repos/settings.ts`, `repos/tags.ts` | Repos piloto ya cableados en main |
| `src/client.ts` | `createDrizzle(sqlite)` sobre better-sqlite3 existente |
| `src/migrate.ts` | `runDrizzleMigrate()` |
| `drizzle/0000_baseline_v53.sql` | Baseline no-op (`SELECT 1;`) — schema real viene del legacy |
| `src/constants.ts` | `LEGACY_SCHEMA_VERSION = 53` |

Comandos útiles:

```bash
pnpm run build:packages          # compila @dome/db
pnpm run test:drizzle-spike      # smoke: settings + tags vía repos Drizzle
pnpm run db:perf-baseline        # tamaño DB, dbstat, latencia de queries
pnpm --filter @dome/db run db:generate   # nueva migración Drizzle (cuando cambie DDL)
```

Tests de convergencia: `electron/__tests__/drizzle-bridge.test.mjs`.

---

## Workers (carga pesada fuera del main)

| Worker | Uso |
|--------|-----|
| `document-extract.worker.cjs` | Extracción de texto PDF/DOCX/PPTX en adjuntos y recursos |
| `db-read.worker.cjs` | FTS read-only, listados de IDs por proyecto |
| `worker-pool.cjs` | Pool + `runDbReadTask()` / `runDocumentExtract()` |

Integrado en: `electron/ipc/data/files.cjs`, `resources.cjs`, `electron/tools/ai-tools-handler.cjs` (hybrid search). `main.cjs` llama `shutdownWorkers()` en `before-quit`.

---

## Tablas principales (resumen)

| Dominio | Tablas |
|---------|--------|
| Core | `projects`, `resources`, `sources`, `citations`, `tags`, `resource_tags`, `settings` |
| Interacciones | `resource_interactions`, `resource_links`, `search_index` |
| Auth / memoria | `auth_profiles`, `martin_memory` |
| Agentes | `agents`, `agent_threads`, `runs`, `run_steps`, `workflows`, … |
| Automatizaciones | `automations`, `automation_runs`, `automation_artifact_bindings` |
| Learn | `flashcards`, `quiz_*`, decks FSRS |
| Calendar | `calendar_events`, sync metadata |
| Artifacts | `artifacts` |
| FTS (virtual) | `resources_fts`, `interactions_fts` (+ triggers en `fts-schema.cjs`) |

Schema completo en código: `electron/core/db/schema.cjs` y `packages/db/src/schema/`.

---

## Migraciones legacy (1…53)

- Versión en `settings.schema_version`.
- Historia congelada en `electron/core/db/migrations.cjs` (append-only).
- Instalación **nueva**: `createBaseSchema()` + última migración pone HEAD v53.
- Instalación **existente**: runner aplica solo deltas pendientes.

Tras v53, cambios de DDL nuevos deben ir como migraciones Drizzle en `packages/db/drizzle/` (no añadir bloques al monolito legacy salvo hotfix excepcional).

---

## Acceso desde el renderer

```typescript
// app/lib/db/client.ts — siempre usar este wrapper
const projects = await window.electron.invoke('db:projects:getAll');
const tags = await window.electron.invoke('db:tags:getAll');
```

Ver también: [resources.md](resources.md), [ipc.md](ipc.md), [architecture/ipc-channels.md](../architecture/ipc-channels.md).

---

## Archivos clave

| Path | Rol |
|------|-----|
| `electron/core/database.cjs` | Fachada pública: getDB, init, getQueries, repos Drizzle |
| `electron/core/db-backup.cjs` | Backup pre-migración, integridad |
| `electron/core/db/drizzle-bridge.cjs` | Puente legacy → Drizzle |
| `electron/core/db/fts-schema.cjs` | FTS5 idempotente |
| `electron/ipc/data/database.cjs` | IPC settings (Drizzle) |
| `electron/ipc/data/tags.cjs` | IPC tags (Drizzle) |
| `packages/db/` | Schema TS, migrator, repos |
| `electron/workers/` | Pool de workers |

**ADR:** [0002-drizzle-incremental-migration.md](../architecture/decisions/0002-drizzle-incremental-migration.md)
