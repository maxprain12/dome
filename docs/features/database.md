# Database Feature (Main Process)

Documentación del DuckDB de Dome: engine, schema, migrations, prepared statements, FTS, triggers, backups y renderer client. Fachada en `electron/core/database.cjs`; el renderer habla con ella por IPC vía `app/lib/db/client.ts` (ver `resources.md` para el client API).

Estado actual y consumo cross-repo (alcance de la migración desde SQLite): [`docs/duckdb-migration/consumer-impact.md`](../duckdb-migration/consumer-impact.md). Detalles del runtime del agente: [`docs/architecture/agent-runtime.md`](../architecture/agent-runtime.md).

---

## Engine

| Item | Value |
|------|-------|
| Binding | `@duckdb/node-api` (`1.5.4-r.1`) — async-only, sin API sync |
| DB file | `dome.duckdb` en `app.getPath('userData')` |
| Concurrencia | Una sola conexión persistente en el main process. Accesos serializados por una promise chain interna en `DuckDbConnection._enqueue` (single-writer; los reads concurrentes se encolan para preservar orden). |

Al primer arranque de un usuario que viene de una instalación previa de la versión SQLite, el archivo legacy (mismo directorio que `dome.duckdb`) se importa **una sola vez** vía `electron/core/db/legacy-import.cjs` usando la extension `sqlite_scanner` (`ATTACH '<path>' AS legacy (TYPE sqlite)`). La guarda `settings.legacy_sqlite_imported = '1'` evita re-importaciones.

### Extensiones cargadas

`openDuckDb()` (`electron/core/db/duckdb.cjs:168`) ejecuta al arranque:

```sql
INSTALL fts; LOAD fts;
INSTALL json; LOAD json;
INSTALL sqlite_scanner; LOAD sqlite_scanner;
```

— necesarias para FTS, JSON helpers y la importación legacy.

---

## Arquitectura

```
electron/core/
├── database.cjs              # Fachada: initDatabase, getDB, getQueries, integrity, repair
├── db-backup.cjs             # Snapshots automáticos + restore
└── db/
    ├── duckdb.cjs            # Wrapper async: DuckDbConnection, openDuckDb, stmt()
    ├── migrate.cjs           # Runner: applyMigrations(db) → schema_migrations
    ├── queries.cjs           # buildQueries(db) — mapa de prepared statements
    ├── fts.cjs               # createFtsIndexes / reindexFts (PRAGMA create_fts_index)
    ├── triggers.cjs          # Puertos en código de triggers SQLite no soportados
    ├── legacy-import.cjs     # Import one-shot del archivo legacy vía sqlite_scanner
    └── migrations/           # 15 archivos 0001_core.cjs … 0015_fts.cjs
        ├── 0001_core.cjs
        ├── 0002_projects.cjs
        ├── 0003_resources.cjs
        ├── 0004_graph.cjs
        ├── 0005_agents.cjs
        ├── 0006_workflows.cjs
        ├── 0007_chat.cjs
        ├── 0008_learn.cjs
        ├── 0009_marketplace_mcp.cjs
        ├── 0010_calendar.cjs
        ├── 0011_feeders.cjs
        ├── 0012_github.cjs
        ├── 0013_transcription.cjs
        ├── 0014_artifacts.cjs
        └── 0015_fts.cjs
```

---

## API (todo async)

### Conexión (`electron/core/db/duckdb.cjs`)

| Método | Retorna |
|--------|---------|
| `await db.run(sql, params)` | `{ changes }` (no rows) |
| `await db.get(sql, params)` | first row object o `undefined` |
| `await db.all(sql, params)` | `row[]` (BigInt → Number cuando está dentro de `Number.MAX_SAFE_INTEGER`) |
| `await db.exec(sqlScript)` | multi-statement, sin params (`{ ok: true }`) |
| `await db.transaction(async (tx) => …)` | `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` on throw. No anidar transactions — comparten la misma connection. |
| `await db.close()` | cierra connection + instance |

Los statements se construyen con el wrapper `stmt(db, sql)` (`duckdb.cjs:187`):

```js
const { stmt } = require('./db/duckdb.cjs');
const s = stmt(db, 'SELECT * FROM resources WHERE id = ?');
await s.get('r1');   // row | undefined
await s.all();       // rows[]
await s.run(a, b);   // { changes }
```

### Fachada (`electron/core/database.cjs`)

| Función | Notas |
|---------|-------|
| `await initDatabase()` | Idempotente, deduplicado por `_initPromise`. Abre DuckDB → `importLegacySqliteIfPresent` → `applyMigrations` → `createDefaultProject` → `buildQueries`. **Debe ser awaited en boot** antes de cualquier `getDB()`/`getQueries()`. |
| `getDB()` | Throws si no se llamó `initDatabase()`. |
| `getQueries()` | Devuelve el statement map cacheado. `invalidateQueries()` fuerza rebuild (lo llama `repairFTSTables`). |
| `await checkIntegrity()` | Probe de catálogo (`SELECT COUNT(*) FROM projects`). |
| `await repairFTSTables()` | Rebuilda índices FTS de `resources` y `resource_interactions` e invalida el statement cache. |
| `await handleCorruptionError(err)` | Heurística de corrupción → `repairFTSTables` → `attemptFullDatabaseRepair` (CHECKPOINT + reindex). |
| `await restoreFromLatestBackupAndReinit()` | Cierra DB, quita `.wal`, restaura, re-inicializa. |
| `await closeDB()` | Cierra connection, limpia caches. |

Convenience de proyecto (en `database.cjs`): `getProjectDeletionImpact`, `deleteProjectWithContent` (cascade explícito en código — DuckDB FKs no soportan `ON DELETE CASCADE`), `deleteAgentFolderCascade`, `deleteWorkflowFolderCascade`.

---

## Migrations

- **15 archivos** en `electron/core/db/migrations/` con naming `^NNNN_.*\.cjs$` (`migrate.cjs:20`).
- Cada módulo exporta `{ id, up: async (db) => … }`. `db` es la `DuckDbConnection`.
- Runner: `applyMigrations(db)` en `electron/core/db/migrate.cjs`:
  1. Crea `schema_migrations(id TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)` si no existe.
  2. Carga IDs ya aplicados.
  3. Para cada migration pendiente, ejecuta `up(db)` + `INSERT INTO schema_migrations` **dentro de una transaction** — si falla, rollback limpio.
- **Idempotente**: corre en cada boot; solo aplica las nuevas.

La fuente de verdad del estado de migrations es la tabla `schema_migrations`. El "schema version" que aparece en backups (`db-backup.cjs:16`, `LATEST_SCHEMA_VERSION = 42`) es un contador lógico independiente, no un migration id.

---

## FTS (DuckDB `fts` extension)

`PRAGMA create_fts_index('<tabla>', '<id_col>', <cols...>, overwrite=1)` crea un índice BM25 nombrado `fts_main_<tabla>`; la búsqueda es `fts_main_<tabla>.match_bm25(<id>, ?)`. Rebuilds usan `overwrite=1`.

Tablas indexadas (definidas en `fts.cjs:12`):

```js
FTS_TABLES = {
  resources:              { id: 'id', columns: ['title', 'content'] },
  resource_interactions:  { id: 'id', columns: ['content'] },
}
```

Build inicial: migration `0015_fts.cjs` llama a `createFtsIndexes(db)`. Repair on-demand: `database.cjs::repairFTSTables()` (parte del recovery de corrupción). Búsqueda vía los statements `searchResources` y `searchInteractions` en `queries.cjs:91, 685`.

---

## Triggers

DuckDB no soporta triggers con la misma flexibilidad que SQLite. Los triggers que mantenían `flashcard_decks.card_count` están portados a código en `electron/core/db/triggers.cjs`:

```js
const { recomputeDeckCardCount } = require('./core/db/triggers.cjs');
await recomputeDeckCardCount(db, deckId);
```

— debe llamarse explícitamente desde los mutations de flashcards (`createFlashcard`, `deleteFlashcard`, moves). Las cascades de proyecto (`deleteProjectWithContent`) son explícitas en código por la misma razón: FKs con `ON DELETE CASCADE` no son confiables en DuckDB.

---

## Tablas clave (HEAD)

> Lista por dominio, no exhaustiva. Cada tabla está creada en su migration `NNNN_*.cjs`. Para columnas exactas, abrir el archivo de migration correspondiente.

| Tabla | Migration | Propósito |
|-------|-----------|-----------|
| `settings` | 0001 | `key TEXT PK, value TEXT, updated_at` (incluye `legacy_sqlite_imported` que guarda la importación legacy) |
| `dome_cloud_sync` | 0001 | Sync state (device_id, last_server_revision, last_event_poll_at, last_push_at) |
| `dome_provider_sessions` | 0001 | Tokens de sesión del Dome provider (access/refresh + expira) |
| `auth_profiles` | 0001 | Perfiles de auth (`api_key | oauth | token`) por provider |
| `projects` | 0002 | `id, name, description, parent_id, created_at, updated_at` |
| `resources` | 0003 | `id, project_id, type, title, content, file_path, internal_path, file_mime_type, file_size, file_hash, thumbnail_data, original_filename, folder_id, metadata, vault_path, content_text, content_hash, created_at, updated_at` |
| `sources` | 0003 | Bibliographic metadata (doi, isbn, journal, etc.) |
| `tags` / `resource_tags` | 0003 | Tags M:N |
| `resource_transcripts` | 0003 | Cache de transcripts Gemma por página |
| `resource_chunks` | 0003 | Tabla de chunks con embeddings en `BLOB` por `model_version` (caché de embeddings). **El vector search y el espejo FTS de recursos corren sobre LanceDB** (`electron/services/lancedb-semantic.cjs`, store en `userData/dome-lance/`); la tabla DuckDB queda como caché/persistencia de chunks. |
| `resource_interactions` | 0003 | `type IN ('note','annotation','chat')`, `position_data`, `metadata` (JSON en TEXT) |
| `graph_nodes` / `graph_edges` | 0004 | Knowledge graph |
| `semantic_relations` | 0004 | `source_id, target_id, similarity, relation_type ('auto'|'manual'|'confirmed'|'rejected')` |
| `many_agents` / `many_agent_versions` / `agent_folders` / `agent_store` | 0005 | Agentes + versionado |
| `ai_skills` | 0005 | Skills de IA |
| `canvas_workflows` / `workflow_executions` / `workflow_folders` | 0006 | Canvas workflows |
| `automation_definitions` / `automation_runs` / `automation_run_steps` / `automation_run_links` / `automation_artifact_bindings` | 0006 | Automations + runs persistentes |
| `chat_sessions` / `chat_messages` / `chat_traces` | 0007 | Trazabilidad de chat (secundario; Many chat usa JSONL sessions — ver `agent-runtime.md`) |
| `flashcard_decks` / `flashcards` / `flashcard_sessions` / `study_events` / `learn_kpis_cache` / `studio_outputs` / `quiz_runs` | 0008 | Learn subsystem |
| `marketplace_*_installs` / `marketplace_template_mappings` / `mcp_servers` / `mcp_global_settings` | 0009 | Marketplace + MCP |
| `calendar_*` / `email_accounts` | 0010 | Calendar + email |
| `feeders` / `feeder_secrets` / `feeder_runs` | 0011 | Artifact feeders (sandbox scripts) |
| `transcription_sessions` / `transcription_chunks` | 0013 | Transcription pipeline |
| `artifacts` / `artifact_runtime_data` | 0014 | Artifacts + DOME_DATA slots |
| `schema_migrations` | (meta) | Aplicada por `migrate.cjs` — `id TEXT PK, applied_at BIGINT` |

Notas:

- **JSON en TEXT**: `metadata`, `position_data`, `nodes_json`, `edges_json`, `entries_json`, `reminders`, etc. se almacenan como `TEXT` y se parsean en JS. DuckDB `json_*` helpers se usan en queries cuando conviene (p. ej. `findUrlResourceByCanonicalUrl`).
- **Timestamps**: `BIGINT` (epoch ms), no `INTEGER` ni `DATETIME` — esto es lo que espera la fachada.
- **`resource_chunks`**: la tabla sigue en DuckDB. La búsqueda semántica vectorial vive en LanceDB; el mantenimiento de la tabla DuckDB lo hace `lancedb-semantic.cjs` (espejo de los chunks en Lance).

---

## Prepared statements

`buildQueries(db)` (`electron/core/db/queries.cjs`) devuelve un mapa agrupado por dominio. Cada entry es un wrapper `stmt(db, sql)` con `.get/all/run(...args)`. Categorías (ver el archivo para el SQL exacto):

- **Projects**: `createProject`, `getProjects`, `getProjectById`
- **Resources**: `createResource`, `getResourcesByProject`, `getResourceById`, `getResourceByIdForIndexing`, `updateResource`, `createResourceWithFile`, `updateResourceFile`, `updateResourceThumbnail`, `findByHash`, `getAllInternalPaths`, `getResourcesWithLegacyPath`, `deleteResource`, `getResourcesByFolder`, `getRootResources`, `moveResourceToFolder`, `moveResourceToProject`, `removeResourceFromFolder`
- **Sources**: `createSource`, `getSources`, `getSourceById`
- **FTS**: `searchResources` (`fts_main_resources.match_bm25`), `searchInteractions` (`fts_main_resource_interactions.match_bm25`)
- **Settings**: `getSetting`, `setSetting` (UPSERT)
- **Many agents**: `listManyAgents`, `getManyAgentById`, `createManyAgent`, `updateManyAgent`, `deleteManyAgent` + version history (`listAgentVersions`, `createAgentVersion`, …)
- **Agent folders**: `listAgentFolders`, `createAgentFolder`, `updateAgentFolder`, `deleteAgentFolder`, `moveManyAgentsFolder`, `reparentAgentFolders`
- **Canvas workflows + folders**: `listCanvasWorkflows`, `getCanvasWorkflowById`, `createCanvasWorkflow`, `updateCanvasWorkflow`, `deleteCanvasWorkflow`; `listWorkflowExecutionsByWorkflow`, `upsertWorkflowExecution`, `trimWorkflowExecutions`
- **MCP**: `listMcpServers`, `createMcpServer`, `updateMcpServer`, `getMcpGlobalSettings`, `upsertMcpGlobalSettings`
- **Marketplace**: `listMarketplaceAgentInstalls`, `upsertMarketplaceAgentInstall`, `listMarketplaceWorkflowInstalls`, `upsertMarketplaceWorkflowInstall`, `listMarketplaceTemplateMappings`, `upsertMarketplaceTemplateMapping`
- **Auth/sessions**: `upsertDomeProviderSession`, `getActiveDomeProviderSession`, `getDomeProviderSessionWithRefresh`, `clearDomeProviderSessions`
- **Interactions**: `createInteraction`, `getInteractionsByResource`, `getInteractionsByType`, `updateInteraction`, `deleteInteraction`
- **Chat (traceability)**: `createChatSession`, `getChatSession`, `updateChatSession`, `getChatSessionsByAgent/Resource/Global`, `createChatMessage`, `getChatMessagesBySession`, `appendChatTrace`, deletes
- **Automations + runs**: `createAutomationDefinition`, `updateAutomationDefinition`, `getAutomationDefinitionById`, `getAutomationDefinitionsByTarget/Project/All`, `getEnabledScheduledAutomations`, `countAutomationDefinitions`, `createAutomationRun`, `updateAutomationRun`, `getAutomationRunById`, `getAutomationRunsByOwner/Automation/Project/Global`, `getActiveRunBySession`, `deleteAutomationRun`, `createAutomationRunStep`, `updateAutomationRunStep`, `getAutomationRunSteps`, `createAutomationRunLink`, `getAutomationRunLinks`
- **Semantic chunks + relations** (caché en DuckDB; vector search en LanceDB): `insertResourceChunk`, `deleteChunksByResource`, `getChunksByResource`, `getAllChunkIdsByModel`, `getChunkEmbeddingsByResource`, `getChunksBatchByIds`, `getAllChunkRowsForModel`, `getDistinctChunkResourceIdsExcluding`, `getChunkEmbeddingsByResourceForModel`, `countChunksByResourceForModel`, `getChunkEmbeddingsByRankSampleForModel`, `getChunkRowsForSemanticSearch`, `insertSemanticRelation`, `getSemanticRelationByPair`, `updateSemanticRelationState`, `deleteSemanticAutoFromSource`, `updateSemanticAutoByPair`, `getSemanticOutgoing`, `getSemanticIncoming`
- **Tags**: `getTagsByResource`, `getAllTagsWithCount`, `getAllTagsWithCountByProject`, `getResourcesByTag`, `getResourcesByTagInProject`, `findTagByNameInsensitive`, `insertTag`, `attachTagToResource`, `detachTagFromResource`, `findUrlResourceByCanonicalUrl`
- **Search/misc**: `getAllResources`, `listResourcesLight`, `listResourcesLightByProject`, `listResourcesIdType`, `searchForMention`, `searchForMentionByProject`, `getBacklinks`
- **Graph**: `createGraphNode`, `getGraphNodeById/Resource/ByType`, `updateGraphNode`, `deleteGraphNode`, `searchGraphNodes`, edges + `getNodeNeighbors` (1-hop)
- **Flashcards**: decks, cards, sessions, `getDueFlashcards`, `updateFlashcardReview`, `getFlashcardStats` (KPIs: total/new/due/mastered/maturity), `reviewFlashcardFsrs` (FSRS state + interval mirror)
- **Learn KPIs**: `getKpiCache`, `setKpiCache` (UPSERT), `clearKpiCache`, `getStudyEventsSince`, `createStudyEvent`
- **Transcripts**: `upsertResourceTranscript`, `getResourceTranscriptsByResource`, `deleteResourceTranscripts`, `countResourceTranscriptsForHash`, `updateResourceContent`
- **Calendar**: cuentas, calendarios, eventos, links, notifications (`getPendingCalendarNotifications`, `markCalendarNotificationNotified`)
- **Transcription**: `insertTranscriptionSession`, `updateTranscriptionSessionStatus`, `appendTranscriptionPartial`, `finalizeTranscriptionSession`, `getStaleTranscriptionSessions`, `deleteTranscriptionSession`, `insertTranscriptionChunk` (UPSERT por `session_id, track, seq`), `updateTranscriptionChunkText`, `listSessionChunks`
- **Artifacts**: `createArtifact`, `getArtifactById/ByResourceId`, `listArtifactsByProject`, `updateArtifactState/Update`, `deleteArtifact`, `getArtifactsLinkedToResource`, runtime data + bindings + `getAutomationArtifactBindingById`
- **Feeders**: CRUD, `approveFeeder`, `updateFeederScript`, `listAllFeeders`, `countRunningFeederRunsByAutomation`, secrets, runs

> Convención: nunca preparar statements ad-hoc en handlers. Agregar nuevos statements agrupados por dominio en `queries.cjs`.

---

## Backups (`electron/core/db-backup.cjs`)

### Layout de snapshots

| Prefix | Uso |
|--------|-----|
| `dome.duckdb.auto-{reason}-{iso}` | Snapshots periódicos (startup/quit/scheduled) |
| `dome.duckdb.backup-v{N}-{iso}` | Pre-migration (`N` = `LATEST_SCHEMA_VERSION - 1`) |

Cap: `MAX_AUTO_BACKUPS = 5`, `MAX_MIGRATION_BACKUPS = 3`. Si el archivo live supera `MAX_AUTO_BACKUP_SOURCE_BYTES` (250 MB), se saltea el auto-backup (alivia el "multi-GB bloat" en Windows cuando el WAL se quedó grande). `findLatestBackup` prefiere snapshots < `MAX_PREFERRED_RESTORE_BYTES` (400 MB) y verifica el archivo antes de aceptar.

### Pipeline de backup

1. `checkpointWal(db)` → `await db.exec('CHECKPOINT')` (idem `wal_checkpoint(TRUNCATE)`).
2. `fs.copyFileSync(dbPath, backupPath)` — file-copy snapshot.
3. `pruneBackupsByPrefix` mantiene los N más recientes.

### Verificación y restore

- `verifyDatabaseFile(dbPath)`: abre el archivo con `openDuckDb` (read-only) y prueba `SELECT COUNT(*) AS c FROM information_schema.tables`. Corrupt/empty → throw → `{ ok: false, errors }`.
- `preflightRestoreIfCorrupt(dbPath)`: corre al boot — chequea el archivo, y si falla, restaura desde el último backup válido.
- `restoreFromLatestBackup(dbPath)`: devuelve `{ restored, backupPath, reason }`.
- `restoreFromLatestBackupAndReinit()` (en `database.cjs`): además cierra la connection, quita el `.wal` sidecar (`removeWalSidecars`) y llama a `initDatabase()`.

---

## Renderer client (`app/lib/db/client.ts`)

- **API pública sin cambios** (mismos métodos: `createResource`, `getResourceById`, `searchResources`, `createChatSession`, etc.).
- **Internamente todo es `await`** porque el main process expone Promises. Las funciones del client son `async` y devuelven `Promise<DBResponse<T>>`.
- Para métodos que no caben en el `window.electron.db` agrupado (agents, workflows, folders, MCP, marketplace, executions, migrations, resources/storage), el client llama directamente a `window.electron.invoke('db:<group>:<action>', …)` con `await`.
- El transport sigue siendo IPC vía `electron/preload.cjs` (`ALLOWED_CHANNELS`). No hay acceso directo del renderer a DuckDB.

---

## Design notes

- **Async end-to-end**: todos los consumers deben `await`. La migración actualizó ~25 archivos con `.prepare()` directos y ~470 call sites que usaban `queries.x.get/all/run` sin `await` — ver `docs/duckdb-migration/consumer-impact.md` para el estado por milestone.
- **Single connection serializada**: un `Promise.resolve().then(work, work)` chain (`DuckDbConnection._enqueue`) garantiza orden; no se hacen calls concurrentes sobre la misma connection. **No anidar `db.transaction()`**.
- **Cascades explícitas en código**: FKs sin `ON DELETE CASCADE` confiable → `deleteProjectWithContent` las enumera (resources, chat_sessions, agents, workflows, automations, runs, decks, studio_outputs, folders, executions).
- **BigInt safe**: `DuckDbConnection` convierte BigInt a Number cuando está dentro de `±2^53−1`; valores fuera de ese rango se quedan como BigInt.
- **FTS repair**: en lugar de poblar tablas FTS manualmente, se reconstruye con `overwrite=1`. Lo dispara `database.cjs::repairFTSTables()` (parte del recovery de corrupción).
- **Integridad**: sin `PRAGMA integrity_check` — el probe es `SELECT COUNT(*) FROM projects` contra la connection abierta. Corrupción heurística (`CORRUPT`/`malformed`/`not a database` en error.code o error.message) → `repairFTSTables` → `attemptFullDatabaseRepair` → `restoreFromLatestBackupAndReinit` como último recurso.

---

## Key files

| Path | Rol |
|------|-----|
| `electron/core/database.cjs` | Fachada: `initDatabase`, `getDB`, `getQueries`, `closeDB`, `checkIntegrity`, `repairFTSTables`, `handleCorruptionError`, cascade helpers, `restoreFromLatestBackupAndReinit` |
| `electron/core/db/duckdb.cjs` | Wrapper async (`DuckDbConnection`, `openDuckDb`, `stmt`) — carga extensiones |
| `electron/core/db/migrate.cjs` | `applyMigrations(db)` — idempotente, transaction por migration |
| `electron/core/db/queries.cjs` | `buildQueries(db)` — mapa de prepared statements |
| `electron/core/db/fts.cjs` | `createFtsIndexes` / `reindexFts` |
| `electron/core/db/triggers.cjs` | `recomputeDeckCardCount` (puerto del trigger legacy) |
| `electron/core/db/legacy-import.cjs` | One-shot `importLegacySqlite(db, duckDbPath)` vía `sqlite_scanner` |
| `electron/core/db/migrations/0001_core.cjs … 0015_fts.cjs` | 15 migrations |
| `electron/core/db-backup.cjs` | Auto/pre-migration snapshots, `verifyDatabaseFile`, `preflightRestoreIfCorrupt`, `restoreFromLatestBackup` |
| `electron/main.cjs` | Registra IPC handlers `db:*`; **debe `await` `initDatabase()`** durante el boot |
| `app/lib/db/client.ts` | Renderer client (mismo API, ahora `await` todo) |
