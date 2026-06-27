# ADR-0002 — Migración incremental a Drizzle (@dome/db)

**Estado:** Aceptado (2026-06)  
**Contexto:** `electron/core/database.cjs` + `queries.cjs` (~1k líneas de prepared statements) eran el único acceso SQL. El schema HEAD es v53; cualquier refactor big-bang arriesgaba datos de usuario.

## Decisión

1. **Paquete `@dome/db`** (`packages/db/`) con schema Drizzle TypeScript reflejando v53, repos tipados y migrator Drizzle.
2. **Bridge post-legacy:** tras `applyMigrations()` hasta v53, `runDrizzleMigrations()` seedea `__drizzle_migrations` y aplica deltas futuros. Baseline `0000_baseline_v53.sql` es no-op; el DDL real sigue en legacy + `schema.cjs`.
3. **FTS5 fuera de Drizzle:** tablas virtuales y triggers en `electron/core/db/fts-schema.cjs` (SQL crudo, idempotente).
4. **Pilotos:** `settings` y `tags` migrados primero vía `drizzle-repos.cjs`; el resto permanece en `queries.cjs` hasta migración dominio a dominio.
5. **Workers:** lecturas pesadas (FTS, extracción documentos) en `electron/workers/` para no bloquear el main thread.

## Consecuencias

- Nuevas features de DB: preferir repo Drizzle + migración en `packages/db/drizzle/`.
- SOP: [.claude/sops/drizzle-domain-migration.md](../../../.claude/sops/drizzle-domain-migration.md).
- Validación: `pnpm run test:drizzle-spike`, `electron/__tests__/drizzle-bridge.test.mjs`.
- **No** abrir segunda conexión de escritura; Drizzle usa `getDB()` existente.

## Alternativas descartadas

- **Big-bang rewrite** de `queries.cjs` → alto riesgo, difícil de revisar.
- **DuckDB como OLTP** → no sustituye SQLite para transacciones locales del desktop.
- **Mover FTS a Drizzle** → FTS5 requiere DDL/triggers específicos; mejor SQL explícito.
