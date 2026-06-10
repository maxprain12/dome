# 05 — Datos y rendimiento — Implementación y validación

**Rama:** `fix/auditoria-seguridad-p0-p2` · **Fecha:** 2026-06-09

## Resumen

| Tarea | Estado | Notas |
|-------|--------|-------|
| T01 Migraciones + backup | ⚠️ Parcial | Backup pre-migración; transacciones por migración pendientes |
| T02 I/O async main | ⏳ Pendiente | |
| T03 Modularizar database.cjs | ⏳ Pendiente | |
| T04 Queries startup | ⏳ Pendiente | |

## Archivos clave

- `electron/core/migration-backup.cjs`
- `electron/core/database.cjs` — llama backup al inicio de `runMigrations`
- `electron/__tests__/migration-backup.test.mjs`

## Cómo validar

```bash
pnpm run test:security   # incluye migration-backup tests

# Backup real: borrar schema_version en DB de prueba o usar DB vieja → arrancar app
# Debe aparecer dome.db.backup-v{N}-{timestamp} en userData
ls ~/Library/Application\ Support/dome/dome.db.backup-*
```

## Pendiente

- T01: envolver cada bloque `if (version < N)` en `db.transaction()`
- T02: `fs.promises` / workers en tools calientes
- T03/T04: modularización y retención según auditoría original
