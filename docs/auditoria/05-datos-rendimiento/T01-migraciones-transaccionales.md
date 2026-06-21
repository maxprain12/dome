# T01 — Migraciones transaccionales con backup previo

**Prioridad**: P1 · **Severidad**: Alta · **Esfuerzo**: M · **Área**: Datos
**Estado**: ✅ Implementada (2026-06-10) — atomicidad de la ejecución completa vía **backup + restore automático**: checkpoint WAL antes del backup, `applyMigrations()` envuelto en try/catch, y al fallar se cierra la DB, se restaura desde el backup (`restoreDatabaseFromBackup`, limpia `-wal`/`-shm`) y se relanza con mensaje claro. Tests `migration-backup.test.mjs` 4/4 ✓. **Nota de diseño**: no se usan transacciones por migración porque varias migraciones togglean `PRAGMA foreign_keys` (no-op dentro de una transacción SQLite); el restore desde backup da la misma garantía ("una migración que falla deja los datos exactamente como estaban") sin ese riesgo.

## Problema

`electron/core/database.cjs` ejecuta las migraciones (23+, desde la línea ~619) con `db.exec()` sin transacción. Ejemplo de la migración 2 (~líneas 694-750):

```js
db.exec('DROP TABLE resources');
db.exec('ALTER TABLE resources_new RENAME TO resources');
// si el proceso muere entre estas dos líneas → tabla resources perdida
```

Un crash, un cierre forzado o un error de SQL a mitad de migración deja `dome.duckdb` en estado inconsistente con el `schema_version` desfasado, y **no hay backup automático** previo. Es la base de datos con todas las notas del usuario.

## Qué hay que hacer

1. **Backup antes de migrar**: si `schema_version` actual < objetivo, copiar `dome.duckdb` a `dome.duckdb.backup-v{N}-{timestamp}` vía `electron/core/db-backup.cjs` antes de tocar nada. Conservar los últimos 3 backups, borrar los anteriores.
2. **Envolver cada migración en transacción**: DuckDB expone `await db.transaction(async (tx) => …)` en `electron/core/db/duckdb.cjs`. Refactor del runner:
   ```js
   const runMigration = db.transaction((migration) => {
     migration.up(db);
     setSchemaVersion(migration.version);
   });
   ```
   Nota: la mayoría de DDL de SQLite es transaccional; lo que no puede ir dentro de una transacción (p. ej. `PRAGMA journal_mode`) se ejecuta fuera, documentado.
3. **Actualizar `schema_version` dentro de la misma transacción** que la migración (hoy, si se actualiza fuera, un fallo intermedio miente sobre el estado).
4. **Recuperación**: al detectar fallo de migración (catch del runner), loguear, restaurar instrucciones (mensaje al usuario apuntando al backup) y no continuar con migraciones posteriores.
5. **Tests** (encaja en el job de [06/T01](../06-calidad-observabilidad/T01-tests-en-ci.md)): con una DB de fixture en versión vieja → migrar a HEAD → verificar schema; simular una migración que lanza a mitad → verificar que la DB queda en la versión anterior intacta.

## Criterios de aceptación

- [ ] Antes de cualquier migración existe un backup fresco en userData.
- [ ] Una migración que falla deja `schema_version` y datos exactamente como estaban.
- [ ] Test automatizado del rollback.
- [ ] El patrón queda documentado para migraciones futuras (comentario en el runner o doc en `docs/`).

## Riesgos / notas

- Migraciones que recrean índices FTS (vía `PRAGMA create_fts_index` con `overwrite=1`) pueden tener matices transaccionales — probar con una copia de DB real grande.
- El backup añade latencia de arranque solo cuando hay migración pendiente (aceptable).
- Coordinar con [T03](T03-modularizar-database.md): primero esto, luego mover archivos.
