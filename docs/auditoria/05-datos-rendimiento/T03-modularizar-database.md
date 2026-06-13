# T03 — Modularizar database.cjs

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: L · **Área**: Datos
**Estado**: ✅ Implementado (fases a+b+c, 2026-06-13) — (a) `db/queries.cjs` (#360); (b) `db/migrations.cjs` con las 42 migraciones verbatim (#377); (c) **schema DDL → `db/schema.cjs`** (`createBaseSchema(db)`: PRAGMAs + todas las tablas/índices/FTS/triggers `IF NOT EXISTS`, byte-idéntico verificado por diff). `database.cjs` baja de ~5.000 a **657 líneas** (fachada: getDB/initDatabase/getQueries/integridad/reparación/borrados en cascada). La decisión de diseño se mantiene: instalación nueva = `createBaseSchema` + `schema_version` a HEAD vía la última migración; existente = runner. La plantilla para migraciones futuras está en la cabecera de `db/migrations.cjs`. Nota: `migrations.cjs` (2.899) es historia congelada (un bloque por versión, append-only) y `queries.cjs` (1.087) un mapa cohesivo de prepared statements — exceden las ~800 líneas por diseño, no por acoplamiento.

## Problema

`electron/core/database.cjs` tiene **4.978 líneas** mezclando tres cosas:

1. Creación de schema (tablas, índices, FTS5, triggers).
2. 23+ migraciones inline (la mayor parte del archivo).
3. Prepared statements / queries (`getQueries()`).

Cada release añade una migración al final del monolito. Es el archivo más grande del repo y el más delicado (datos de usuario).

## Qué hay que hacer

1. Extraer manteniendo `database.cjs` como fachada (la API `getDb()`, `getQueries()`, init no cambia para los ~40 módulos que la consumen):
   - `electron/core/db/schema.cjs` — DDL del schema actual (estado final, para instalaciones nuevas).
   - `electron/core/db/migrations/NNN-descripcion.cjs` — un archivo por migración exportando `{ version, up(db) }`; el runner las carga ordenadas por versión. Las 23 existentes se mueven tal cual (sin reescribirlas: son historia congelada).
   - `electron/core/db/migration-runner.cjs` — el runner transaccional de [T01](T01-migraciones-transaccionales.md).
   - `electron/core/db/queries.cjs` — prepared statements (si supera ~800 líneas, dividir por dominio: resources, runs, learn…).
2. Decisión de diseño a respetar: instalación nueva = schema final directo + `schema_version` a HEAD (sin reproducir 23 migraciones); instalación existente = runner de migraciones. Verificar que ya funciona así y conservarlo.
3. Hacerlo en 2-3 PRs: (a) extraer queries, (b) extraer migraciones + runner, (c) extraer schema.
4. Por cada PR: probar arranque con DB nueva, con DB existente en HEAD, y con DB en versión vieja (fixture) que migra.
5. Plantilla para migraciones futuras documentada (cómo añadir `migrations/024-….cjs`).

## Criterios de aceptación

- [ ] Ningún archivo de la capa DB supera ~800 líneas.
- [ ] DB nueva, DB en HEAD y DB antigua migrando funcionan igual que antes.
- [ ] `database.cjs` (fachada) conserva la API pública; cero cambios en los consumidores.
- [ ] Añadir una migración nueva = crear un archivo, sin tocar el monolito.

## Riesgos / notas

- Hacer **después** de [T01](T01-migraciones-transaccionales.md) (backup+transacciones) — mover migraciones sin esa red es arriesgado.
- Mismo patrón de fachada que [04/T05](../04-harness-agentes/T05-modularizar-run-engine.md); el siguiente candidato tras estos dos es `ai-tools-handler.cjs` (4.153 líneas) si se quiere continuar la serie.
