# SOP: Migrar un dominio a Drizzle (@dome/db)

Cuando muevas acceso SQL de `queries.cjs` a Drizzle:

## 1. Schema

- Añade/actualiza la tabla en `packages/db/src/schema/*.ts`.
- Si es cambio de DDL para installs existentes, genera migración:
  ```bash
  pnpm --filter @dome/db run db:generate
  ```
- FTS5, triggers y recreate-table con CHECK siguen en SQL crudo (`fts-schema.cjs` o migración custom).

## 2. Repositorio

- Implementa funciones en `packages/db/src/repos/<domain>.ts`.
- Exporta desde `packages/db/src/index.ts`.
- Ejecuta `pnpm run build:packages`.

## 3. Bridge en main

- Crea adaptador snake_case en `electron/core/db/drizzle-repos.cjs` (IPC/renderer esperan snake_case).
- Expón `getXRepo()` desde `electron/core/database.cjs`.

## 4. IPC / handlers

- Sustituye `queries.*` por `database.getXRepo()` en el dominio.
- Mantén secretos/settings enmascarados en rutas existentes si aplica.

## 5. Validación

```bash
pnpm run build:packages
pnpm run test:security
pnpm run typecheck
node scripts/drizzle-spike.mjs [path-to-dome.db]
```

## Reglas

- **No big-bang**: un dominio por PR.
- **Un writer**: Drizzle envuelve la misma conexión `getDB()`; no abras otra DB de escritura.
- **Legacy primero**: `applyMigrations` debe llegar a v53 antes de `runDrizzleMigrations`.
- **Rendimiento**: lecturas pesadas → `electron/workers/`; escrituras en main.
