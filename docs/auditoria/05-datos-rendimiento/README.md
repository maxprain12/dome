# 05 — Datos y Rendimiento

Auditoría de la capa de datos (SQLite, migraciones) y del rendimiento del main process. Fecha: 2026-06-09.

## Resumen

- **Migraciones sin transacciones**: `electron/core/database.cjs` ejecuta 23+ migraciones con `db.exec()` suelto; la migración 2 hace `DROP TABLE resources` + rename en pasos separados — un fallo a mitad deja la DB inconsistente y sin backup automático.
- **I/O síncrona en hot paths del main**: `readFileSync`/`writeFileSync` en handlers de tools PPT/Excel y `statSync`/`readdirSync` en file-tree — bloquean el event loop (UI congelada con archivos grandes).
- `database.cjs` con 4.978 líneas (schema + migraciones + queries en un archivo).
- Cargas completas al arrancar (`getWorkflowRunIds.all()` sin filtro).

## Tareas

| Tarea | Prioridad | Esfuerzo | Estado |
|-------|-----------|----------|--------|
| [T01 — Migraciones transaccionales + backup](T01-migraciones-transaccionales.md) | P1 | M | ✅ Implementada |
| [T02 — I/O asíncrona en el main process](T02-io-asincrona-main.md) | P1 | M | ✅ Implementada |
| [T03 — Modularizar database.cjs](T03-modularizar-database.md) | P2 | L | ✅ Implementado |
| [T04 — Revisar queries de arranque](T04-queries-startup.md) | P3 | S | ✅ Implementada |

> **Validación 2026-06-10**: T01 — backup con checkpoint WAL + restore automático si una migración falla (transacciones por migración descartadas con razón documentada: los toggles de `PRAGMA foreign_keys` son no-op dentro de transacciones). T02 — `buildFileTree`, PPT y Excel export migrados a `fs.promises`. T04 — queries de runs ya tenían LIMIT; el id-set de workflow runs se cachea (TTL 30s); retención implementada en `electron/agents/run-retention.cjs` (purga runs terminales con más de `runs_retention_days` días, default 90; borra las sesiones JSONL de workflows antes que las filas SQLite; 5 tests).

## Lo que ya está bien

- WAL mode, foreign keys activadas, triggers.
- Versionado de schema en `settings` (`schema_version`).
- Índices bien colocados tras las migraciones.
- Embeddings en `utilityProcess.fork` worker (no bloquean el main) — fix de mayo 2026.
- Integridad al arranque con `quick_check` (evita falsos positivos de FTS).

## Orden recomendado

T01 es independiente y de alto valor (protege los datos del usuario en cada release). T02 por lotes (ppt → excel → file-tree). T03 después de T01 para no mover migraciones mientras se les añade transaccionalidad.
