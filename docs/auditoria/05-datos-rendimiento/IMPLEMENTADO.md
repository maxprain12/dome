# 05 — Datos y rendimiento — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Actualizado:** 2026-06-10

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Migraciones + backup | ✅ | Backup con checkpoint WAL + restore automático si falla una migración (transacciones por migración descartadas: los toggles de `PRAGMA foreign_keys` son no-op dentro de transacciones) |
| T02 I/O async main | ✅ | `buildFileTree`, PPT y Excel export migrados a `fs.promises` |
| T03 Modularizar database.cjs | ✅ | 3 fases: `db/queries.cjs` + `db/migrations.cjs` + `db/schema.cjs`; `database.cjs` ~5.000→657 líneas |
| T04 Queries startup + retención | ✅ | LIMITs auditados; caché TTL 30s del id-set de workflow runs; retención en `run-retention.cjs` |

## Archivos clave

- `electron/core/migration-backup.cjs` (+ test)
- `electron/core/database.cjs` — llama backup al inicio de `runMigrations`
- `electron/agents/run-retention.cjs` — purga runs terminales > `runs_retention_days` (default 90, ≤0 desactiva); arranca 30s tras `app ready` y cada 24h; borra sesiones JSONL por nodo de workflows **antes** que las filas SQLite
- `electron/ipc/agents/threads.cjs` — caché del id-set de workflow runs
- `electron/__tests__/migration-backup.test.mjs`, `electron/__tests__/run-retention.test.mjs`

## Cómo validar

```bash
pnpm run test:security   # incluye migration-backup (4) y run-retention (5)

# Backup real: usar DB con schema viejo → arrancar app
ls ~/Library/Application\ Support/dome/dome.duckdb.backup-*

# Retención: setear runs_retention_days=1 en settings, crear runs antiguos → arrancar app
# Los runs terminales >1 día desaparecen de la Runs UI; los workflow JSONL no reaparecen en Many
```

## Pendiente

- T03: modularización de `database.cjs` según auditoría original (refactor grande, PR aparte)
