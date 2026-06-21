# DuckDB migration — consumer impact report

Checklist of every file that still uses the **synchronous** SQLite/better-sqlite3
API (`.prepare()`, `.get/.all/.run` without `await`, `.pragma()`, `.transaction(fn)`
sync variant, `@param {import('better-sqlite3').Database}` JSDoc). Each entry must
be converted to the async DuckDB wrapper (`await db.get/all/run`,
`await db.transaction(async (tx) => …)`, `await queries.x.get/all/run(...)`).

Source: `grep -rn` over `electron/` (excluding `node_modules`, `electron/core/db/`,
`electron/core/db-backup.cjs`, `__tests__`).

## A. `.prepare()` direct call sites — 25 files, 185 sites

| # | file | sites | milestone |
|---|------|------|-----------|
| 1  | `electron/github/github-store.cjs`               | 30 | M5 |
| 2  | `electron/storage/cloud-sync-service.cjs`        | 24 | M5 |
| 3  | `electron/tools/ai-tools-handler.cjs`            | 17 | M6 |
| 4  | `electron/core/guide-bootstrap.cjs`              | 16 | **M1** (boot path) |
| 5  | `electron/storage/vault-watcher.cjs`             | 15 | M5 |
| 6  | `electron/ipc/learn/studio.cjs`                  | 11 | M4 |
| 7  | `electron/email/himalaya-service.cjs`            | 11 | M5 |
| 8  | `electron/services/learn-kpis.cjs`               |  9 | M4 |
| 9  | `electron/storage/vault-store.cjs`               |  8 | M5 |
| 10 | `electron/services/lancedb-semantic.cjs`         |  5 | **M1** (boot path) + M4 |
| 11 | `electron/marketplace/skills-bootstrap.cjs`      |  5 | **M1** (boot path) |
| 12 | `electron/ipc/learn/quiz.cjs`                    |  5 | M4 |
| 13 | `electron/ipc/data/database.cjs`                 |  4 | M2 |
| 14 | `electron/ipc/ai/semantic.cjs`                   |  4 | M3 |
| 15 | `electron/github/github-calendar-bridge.cjs`      |  4 | M5 |
| 16 | `electron/agents/run-engine.cjs`                 |  4 | M5 |
| 17 | `electron/agents/run-retention.cjs`              |  3 | M5 |
| 18 | `electron/calendar/calendar-service.cjs`         |  2 | M5 |
| 19 | `electron/tools/ppt-tools-handler.cjs`           |  1 | M6 |
| 20 | `electron/storage/semantic-index-scheduler.cjs`  |  1 | M5 |
| 21 | `electron/main.cjs`                              |  1 | **M1** (boot path) |
| 22 | `electron/ipc/sync/indexing-sync.cjs`            |  1 | M4 |
| 23 | `electron/ipc/data/resources.cjs`                |  1 | M2 |
| 24 | `electron/ipc/agents/artifacts.cjs`              |  1 | M3 |
| 25 | `electron/calendar/calendar-import-service.cjs`  |  1 | M5 |

## B. `queries.x.get/all/run` (and `getQueries().x.get/all/run`) called without `await` — ~45 files, ~470 sites

Top by count (full list grows as conversion progresses; re-run the grep to refresh):

| # | file | sites | milestone |
|---|------|------|-----------|
| 1  | `electron/tools/ai-tools-handler.cjs`              | 76 | M6 |
| 2  | `electron/ipc/learn/flashcards.cjs`                | 31 | M4 |
| 3  | `electron/ipc/agents/artifacts.cjs`                | 25 | M3 |
| 4  | `electron/bench/fixtures.cjs`                      | 21 | M6 |
| 5  | `electron/transcription/transcription-session.cjs` | 20 | M6 |
| 6  | `electron/agents/run-store.cjs`                    | 18 | M5 |
| 7  | `electron/ipc/agents/chat.cjs`                     | 17 | M3 |
| 8  | `electron/agents/run-engine.cjs`                   | 17 | M5 |
| 9  | `electron/ipc/integrations/web.cjs`                | 14 | M4 |
| 10 | `electron/core/init.cjs`                           | 14 | M6 |
| 11 | `electron/tools/docx-tools-handler.cjs`            | 13 | M6 |
| 12 | `electron/transcription/transcription-note-helper.cjs` | 10 | M6 |
| 13 | `electron/tools/excel-tools-handler.cjs`           | 10 | M6 |
| 14 | `electron/tools/ai-tools-extra.cjs`                | 10 | M6 |
| 15 | `electron/storage/vault-store.cjs`                 |  9 | M5 |
| 16 | `electron/ipc/ai/ai.cjs`                           |  9 | M3 |
| 17 | `electron/auth/dome-oauth.cjs`                     |  9 | M6 |
| 18 | `electron/tools/ppt-tools-handler.cjs`             |  8 | M6 |
| 19 | `electron/ipc/ai/ollama.cjs`                       |  8 | M3 |
| 20 | `electron/artifacts/artifact-sink.cjs`             |  7 | M6 |
| 21 | `electron/transcription/transcription-service.cjs` |  6 | M6 |
| 22 | `electron/artifacts/artifact-link-sync.cjs`        |  6 | M6 |
| 23 | `electron/ai/ai-settings.cjs`                      |  6 | M6 |
| 24 | `electron/main.cjs`                                |  5 | **M1** (boot path) |
| 25 | `electron/ipc/integrations/feeders.cjs`            |  5 | M4 |
| 26 | `electron/ai/provider-keys.cjs`                    |  5 | M6 |
| 27 | `electron/transcription/transcription-recovery.cjs`|  4 | M6 |
| 28 | `electron/core/settings-secrets.cjs`               |  4 | M6 |
| 29 | `electron/core/deep-link-handler.cjs`              |  4 | M6 |
| 30 | `electron/bench/provider-config.cjs`               |  4 | M6 |
| 31 | `electron/transcription/transcription-shortcut.cjs`|  3 | M6 |
| 32 | `electron/ipc/core/migration.cjs`                  |  3 | M2 |
| 33 | `electron/ai/resolve-provider-config.cjs`          |  3 | M6 |
| 34 | `electron/agents/kb-llm-provision.cjs`             |  3 | M6 |
| 35 | `electron/ipc/core/window.cjs`                     |  2 | M2 |
| 36 | `electron/ipc/agents/threads.cjs`                  |  2 | M3 |
| 37 | `electron/auth/github-oauth.cjs`                   |  2 | M6 |
| 38 | `electron/auth/github-copilot-oauth.cjs`           |  2 | M6 |
| 39 | `electron/agents/automation-service.cjs`           |  2 | M5 |
| 40 | `electron/tools/tool-dispatcher.cjs`               |  1 | M6 |

Plus many single-site consumers (chat-tool dispatcher, ipc handlers, etc.) —
re-run `grep -rnE "queries\.[a-zA-Z]+\.(get|all|run)\(" electron/` periodically.

## C. `db.pragma()` — 2 sites (only real ones)

- `electron/core/db-backup.cjs:147` — `db.pragma('wal_checkpoint(TRUNCATE)')` → `await db.exec('CHECKPOINT')`
- `electron/core/db-backup.cjs:256` — `db.pragma('busy_timeout = 5000')` → drop (DuckDB has no busy_timeout; locking is internal)

(All other `.exec(` matches in the codebase are `RegExp.exec` false positives.)

## D. `database.getDB().prepare()` — 1 site

- `electron/main.cjs:1138` — orphan-tag cleanup → `await database.getDB().run('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM resource_tags)')`

## E. `better-sqlite3` require/dependency — to remove in M7

- `package.json:129` — `"better-sqlite3": "^12.6.2"` (dep)
- `package.json:194` — `"@types/better-sqlite3": "^7.6.0"` (devDep)
- `package.json:24` — `rebuild:natives` script references `better-sqlite3`
- `package.json:257` — `asarUnpack` includes `node_modules/better-sqlite3/**/*`
- `electron/core/db-backup.cjs:254` — `require('better-sqlite3')` in `verifyDatabaseFile` → **M1 rewrite** (boot path)
- `electron/core/db/schema.cjs` — whole file is SQLite-PRAGMA based → **M7 delete** (dead code)
- `electron/core/db/migrations.cjs` (3412 lines) — old SQLite runner → **M7 delete** (dead code)

## F. JSDoc type references to `better-sqlite3` — ~15 files (M7 cleanup)

`@param {import('better-sqlite3').Database}` and `.Statement` in:
- `electron/core/guide-bootstrap.cjs` (3)
- `electron/marketplace/skills-bootstrap.cjs` (1)
- `electron/agents/kb-llm-provision.cjs` (1)
- `electron/storage/cloud-sync-service.cjs` (~10)
- `electron/services/embeddings.service.cjs` (1)
- `electron/services/lancedb-semantic.cjs` (2)
- `electron/services/resource-text.cjs` (1)
- `electron/core/db-backup.cjs` (1)

## G. Tests with better-sqlite3 mocks — M8

- `electron/__tests__/migration-backup.test.mjs` — rewrite to async DuckDB mock
- `electron/__tests__/run-retention.test.mjs` — rewrite to async DuckDB mock

## Milestone boundaries (recap)

| Milestone | Scope | Leaves app bootable? |
|-----------|-------|----------------------|
| **M1** | boot path: `duckdb.cjs` +sqlite_scanner, `legacy-import.cjs` (new), `db-backup.cjs` rewrite, `skills-bootstrap.cjs` async, `guide-bootstrap.cjs` async, `lancedb-semantic.cjs` boot funcs async, `main.cjs` await init + fixes | ✅ boots, CRUD consumers still broken |
| M2 | IPC core/data (C1) | partial |
| M3 | IPC ai/agents (C2) | partial |
| M4 | IPC learn/media/sync + services (C3+C4) | partial |
| M5 | storage/agents/calendar/email/github (C5+C6) | partial |
| M6 | marketplace/guide done / tools/artifacts/bench/auth/transcription (C7) | mostly working |
| M7 | cleanup (delete dead code, drop deps, JSDoc) | ✅ |
| M8 | tests + full validation + PR squash → main | ✅ |
